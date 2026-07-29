from uuid import UUID

from fastapi.testclient import TestClient

from app.main import app
from app.models.audit import AuditEvent
from tests.helpers.v2_payloads import setup_payload

client = TestClient(app)


def _headers(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _run(headers: dict[str, str], run_code: str) -> dict:
    response = client.post(
        "/api/v1/experiments",
        json={
            "run_code": run_code,
            "started_at": "2026-07-12T09:30:00",
            "synthesis_method": "CVD",
            "operator": "tester",
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _setup_payload(**overrides) -> dict:
    values = {
        "setup_code": "SETUP-F9-A2",
        "setup_name": "F9-A2 setup",
        "zone_count": 3,
        **overrides,
    }
    return setup_payload(**values)


def test_entity_run_and_setup_reference_writes_are_audited(
    active_user, admin_user, db_session
) -> None:
    owner_headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    setup = client.post("/api/v1/setups", json=_setup_payload(), headers=admin_headers)
    run = _run(owner_headers, "CVD-2026-0901")
    referenced = client.put(
        f"/api/v1/experiments/{run['id']}/setup-reference",
        json={
            "setup_id": setup.json()["id"],
            "version": 1,
            "tube_usage_history": {"reset_count": 0, "use_number_since_reset": 1},
        },
        headers=owner_headers,
    )

    assert setup.status_code == 201, setup.text
    assert referenced.status_code == 200, referenced.text
    setup_event = (
        db_session.query(AuditEvent)
        .filter_by(entity_type="setup", entity_id=UUID(setup.json()["id"]), action="create")
        .one()
    )
    assert setup_event.actor_id == admin_user.id
    assert setup_event.before_json is None
    assert setup_event.after_json["version"] == 1
    run_events = (
        db_session.query(AuditEvent)
        .filter_by(entity_type="experiment_run", entity_id=UUID(run["id"]))
        .all()
    )
    assert [event.action for event in run_events] == ["create", "set_setup_reference"]
    assert run_events[0].after_json["run_code"] == "CVD-2026-0901"
    assert run_events[1].before_json == {"setup_ref": None, "setup_ref_version": None}
    assert run_events[1].after_json == {
        "setup_ref": setup.json()["id"],
        "setup_ref_version": 1,
    }


def test_legacy_result_writes_are_gone(active_user) -> None:
    headers = _headers(active_user.email)
    run = _run(headers, "CVD-2026-0902")
    sample_response = client.post(
        f"/api/v1/experiments/{run['id']}/samples",
        json={},
        headers=headers,
    )
    assert sample_response.status_code == 201, sample_response.text
    sample_id = sample_response.json()["id"]
    missing_id = "00000000-0000-0000-0000-000000000001"
    calls = [
        ("post", f"/api/v1/experiments/{run['id']}/characterization-records"),
        ("patch", f"/api/v1/characterization-records/{missing_id}"),
        ("delete", f"/api/v1/characterization-records/{missing_id}"),
        ("post", f"/api/v1/samples/{sample_id}/measured-products"),
        ("patch", f"/api/v1/measured-products/{missing_id}"),
        ("delete", f"/api/v1/measured-products/{missing_id}"),
        ("post", f"/api/v1/samples/{sample_id}/results"),
        ("put", f"/api/v1/results/{missing_id}"),
        ("delete", f"/api/v1/results/{missing_id}"),
    ]
    for method, path in calls:
        response = client.request(method, path, json={}, headers=headers)
        assert response.status_code == 410, (method, path, response.text)


def test_setup_field_devices_none_is_exclusive_on_create_and_append(admin_user) -> None:
    headers = _headers(admin_user.email)
    rejected_create = client.post(
        "/api/v1/setups",
        json=_setup_payload(field_devices=["none", "plasma"]),
        headers=headers,
    )
    setup = client.post(
        "/api/v1/setups",
        json=_setup_payload(setup_code="SETUP-F9-A2-VALID", field_devices=["none"]),
        headers=headers,
    )
    rejected_append = client.post(
        f"/api/v1/setups/{setup.json()['id']}/versions",
        json=_setup_payload(
            setup_code="SETUP-F9-A2-VALID",
            field_devices=["none", "plasma"],
        ),
        headers=headers,
    )

    assert rejected_create.status_code == 422
    assert rejected_append.status_code == 422


def test_setup_integer_values_reject_fraction_and_numeric_strings(admin_user) -> None:
    headers = _headers(admin_user.email)
    fraction = client.post(
        "/api/v1/setups",
        json=_setup_payload(setup_code="SETUP-FRACTION", zone_count=3.5),
        headers=headers,
    )
    integer = client.post(
        "/api/v1/setups",
        json=_setup_payload(setup_code="SETUP-INTEGER", zone_count=3),
        headers=headers,
    )
    integer_string = client.post(
        "/api/v1/setups",
        json=_setup_payload(setup_code="SETUP-INTEGER-STRING", zone_count="3"),
        headers=headers,
    )

    assert fraction.status_code == 422
    assert fraction.json()["detail"] == {"invalid": [{"key": "zone_count", "reason": "type"}]}
    assert integer.status_code == 201, integer.text
    assert integer.json()["latest_version"]["data"]["zone_count"] == 3
    assert integer_string.status_code == 422
    assert integer_string.json()["detail"] == {"invalid": [{"key": "zone_count", "reason": "type"}]}


def test_owner_still_lists_own_invalid_run(active_user) -> None:
    headers = _headers(active_user.email)
    run = _run(headers, "CVD-2026-0903")
    invalidated = client.post(
        f"/api/v1/experiments/{run['id']}/invalidate",
        json={"reason": "bad thermocouple"},
        headers=headers,
    )
    listed = client.get("/api/v1/experiments", headers=headers)

    assert invalidated.status_code == 200, invalidated.text
    match = next(item for item in listed.json()["items"] if item["id"] == run["id"])
    assert match["status"] == "invalid"
