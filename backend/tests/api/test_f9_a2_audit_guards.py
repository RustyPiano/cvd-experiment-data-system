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
            "synthesis_method": "APCVD",
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
        json={"setup_id": setup.json()["id"], "version": 1},
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


def test_result_crud_writes_are_audited_with_delete_snapshots(active_user, db_session) -> None:
    headers = _headers(active_user.email)
    run = _run(headers, "CVD-2026-0902")
    sample = client.post(
        f"/api/v1/experiments/{run['id']}/samples",
        json={"role": "control"},
        headers=headers,
    ).json()
    record = client.post(
        f"/api/v1/experiments/{run['id']}/characterization-records",
        json={
            "sample_id": sample["id"],
            "method_instrument": "Raman",
            "test_conditions": "ambient",
        },
        headers=headers,
    )
    record_id = record.json()["id"]
    assert (
        client.patch(
            f"/api/v1/characterization-records/{record_id}",
            json={"test_conditions": "vacuum"},
            headers=headers,
        ).status_code
        == 200
    )
    product = client.post(
        f"/api/v1/samples/{sample['id']}/measured-products",
        json={
            "characterization_record_id": record_id,
            "observed_phenomena": ["不连续覆盖"],
        },
        headers=headers,
    )
    product_id = product.json()["id"]
    assert (
        client.patch(
            f"/api/v1/measured-products/{product_id}",
            json={"layer_count": 1, "coverage_percent": 70},
            headers=headers,
        ).status_code
        == 200
    )
    assert (
        client.delete(f"/api/v1/measured-products/{product_id}", headers=headers).status_code == 204
    )
    assert (
        client.delete(f"/api/v1/characterization-records/{record_id}", headers=headers).status_code
        == 204
    )

    record_events = (
        db_session.query(AuditEvent)
        .filter_by(entity_type="characterization_record", entity_id=UUID(record_id))
        .all()
    )
    product_events = (
        db_session.query(AuditEvent)
        .filter_by(entity_type="measured_product", entity_id=UUID(product_id))
        .all()
    )
    assert [event.action for event in record_events] == ["create", "update", "delete"]
    assert record_events[1].before_json["test_conditions"] == "ambient"
    assert record_events[2].before_json["test_conditions"] == "vacuum"
    assert record_events[2].after_json is None
    assert [event.action for event in product_events] == ["create", "update", "delete"]
    assert product_events[2].before_json["layer_count"] == 1
    assert product_events[2].before_json["coverage_percent"] == 70
    assert product_events[2].after_json is None


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
