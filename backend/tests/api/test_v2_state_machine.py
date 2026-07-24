from uuid import UUID
from zlib import crc32

from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.main import app
from app.models.audit import AuditEvent
from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.user import User, UserRole
from app.models.v2_results import MeasuredProduct
from app.repositories.experiment_repository import ExperimentRepository
from app.services.sample_service import SampleService

client = TestClient(app)


def _headers(email: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _run(headers: dict[str, str], code: str, method: str = "PVD-热蒸发") -> dict:
    response = client.post(
        "/api/v1/experiments",
        json={
            "run_code": f"CVD-2026-{crc32(code.encode()) % 10000:04d}",
            "started_at": "2026-07-11T09:00:00",
            "synthesis_method": method,
            "operator": "tester",
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _add_substrates(headers: dict[str, str], run_id: str, items: list[dict] | None = None) -> dict:
    response = client.put(
        f"/api/v1/experiments/{run_id}/modules/substrates",
        json={"payload_json": {"items": items or [{"material": "蓝宝石"}]}},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()["payload_json"]


def _lockable_run(headers: dict[str, str], code: str) -> dict:
    run = _run(headers, code)
    _add_substrates(headers, run["id"])
    return run


def test_direct_lock_unlock_invalidate_and_audit(active_user, admin_user, db_session) -> None:
    owner = _headers(active_user.email)
    admin = _headers(admin_user.email)
    run = _lockable_run(owner, "STATE-HAPPY")
    run_id = run["id"]

    assert client.post(f"/api/v1/experiments/{run_id}/submit", headers=owner).status_code == 404
    assert (
        client.post(f"/api/v1/experiments/{run_id}/return-to-draft", headers=owner).status_code
        == 404
    )

    locked = client.post(f"/api/v1/experiments/{run_id}/lock", headers=owner)
    assert locked.status_code == 200, locked.text
    assert locked.json()["status"] == "locked"
    assert locked.json()["locked_at"] is not None
    assert "submitted_at" not in locked.json()
    assert locked.json()["result_missing_todo"] is True
    assert client.post(f"/api/v1/experiments/{run_id}/lock", headers=owner).status_code == 409
    assert (
        client.post(
            f"/api/v1/experiments/{run_id}/invalidate",
            json={"reason": "locked"},
            headers=owner,
        ).status_code
        == 409
    )

    assert client.post(f"/api/v1/experiments/{run_id}/unlock", headers=owner).status_code == 403
    unlocked = client.post(f"/api/v1/experiments/{run_id}/unlock", headers=admin)
    assert unlocked.status_code == 200, unlocked.text
    assert unlocked.json()["status"] == "draft"
    assert unlocked.json()["locked_at"] is None
    assert unlocked.json()["result_missing_todo"] is False

    invalid = client.post(
        f"/api/v1/experiments/{run_id}/invalidate",
        json={"reason": "bad run"},
        headers=owner,
    )
    assert invalid.status_code == 200, invalid.text
    assert invalid.json()["status"] == "invalid"
    assert client.post(f"/api/v1/experiments/{run_id}/lock", headers=owner).status_code == 409
    assert client.post(f"/api/v1/experiments/{run_id}/unlock", headers=admin).status_code == 409
    assert (
        client.post(
            f"/api/v1/experiments/{run_id}/invalidate",
            json={"reason": "again"},
            headers=owner,
        ).status_code
        == 409
    )

    events = db_session.query(AuditEvent).filter(AuditEvent.entity_id == UUID(run_id)).all()
    assert [event.action for event in events] == [
        "create",
        "upsert_module",
        "lock",
        "unlock",
        "invalidate",
    ]
    assert events[-3].actor_id == active_user.id
    assert events[-2].actor_id == admin_user.id
    assert events[-1].actor_id == active_user.id


def test_lock_gate_returns_structured_missing_fields(active_user) -> None:
    headers = _headers(active_user.email)
    run = _run(headers, "STATE-R0", "APCVD")

    response = client.post(f"/api/v1/experiments/{run['id']}/lock", headers=headers)

    assert response.status_code == 422
    missing = response.json()["detail"]["missing"]
    assert missing
    assert {"key", "label", "module"} <= missing[0].keys()
    missing_keys = {item["key"] for item in missing}
    assert {"structure_type", "phase_state"} <= missing_keys
    assert {"components", "amount"}.isdisjoint(missing_keys)


def test_operator_is_always_the_run_owner(active_user, admin_user) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    run = _run(headers, "OWNER-OPERATOR")

    assert run["operator"] == active_user.name

    response = client.put(
        f"/api/v1/experiments/{run['id']}/modules/basic_info",
        json={
            "payload_json": {
                "started_at": "2026-07-11T10:00:00",
                "synthesis_method": "APCVD",
                "operator": "Another Member",
                "run_code": "CVD-2099-9999",
            }
        },
        headers=admin_headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["payload_json"]["operator"] == active_user.name


def test_lock_translates_concurrent_sample_conflict_to_409(active_user, monkeypatch) -> None:
    headers = _headers(active_user.email)
    run = _lockable_run(headers, "STATE-LOCK-RACE")

    def raise_integrity_error(*args, **kwargs):
        del args, kwargs
        raise IntegrityError("INSERT", {}, RuntimeError("concurrent growth sample"))

    monkeypatch.setattr(SampleService, "sync_growth_samples", raise_integrity_error)

    response = client.post(f"/api/v1/experiments/{run['id']}/lock", headers=headers)

    assert response.status_code == 409, response.text
    assert "concurrently" in response.json()["detail"]
    refreshed = client.get(f"/api/v1/experiments/{run['id']}", headers=headers).json()
    assert refreshed["status"] == "draft"


def test_process_writes_recheck_status_after_acquiring_run_lock(active_user, monkeypatch) -> None:
    headers = _headers(active_user.email)
    run = _run(headers, "STATE-PROCESS-RACE")
    original_lock = ExperimentRepository.get_by_id_for_update
    locked_run_ids: list[UUID] = []

    def return_concurrently_locked(repository, run_id):
        locked = original_lock(repository, run_id)
        assert locked is not None
        locked.status = ExperimentStatus.LOCKED
        locked_run_ids.append(run_id)
        return locked

    monkeypatch.setattr(
        ExperimentRepository,
        "get_by_id_for_update",
        return_concurrently_locked,
    )

    module_response = client.put(
        f"/api/v1/experiments/{run['id']}/modules/basic_info",
        json={"payload_json": {}},
        headers=headers,
    )
    setup_response = client.put(
        f"/api/v1/experiments/{run['id']}/setup-reference",
        json={
            "setup_id": "00000000-0000-0000-0000-000000000001",
            "version": 1,
        },
        headers=headers,
    )

    assert module_response.status_code == 409, module_response.text
    assert setup_response.status_code == 409, setup_response.text
    assert locked_run_ids == [UUID(run["id"]), UUID(run["id"])]


def test_lock_classifies_missing_structure_discriminator_as_r0(active_user) -> None:
    headers = _headers(active_user.email)
    setup = client.post(
        "/api/v1/setups",
        json={
            "setup_code": "SETUP-STATE-REQUIRED",
            "setup_name": "Required gate setup",
            "zone_count": 1,
            "orientation": "水平",
            "coordinate_system": "上游负/下游正",
            "field_devices": "无",
            "flow_reference_temperature_C": 20,
            "flow_reference_pressure_Pa": 101325,
        },
        headers=headers,
    )
    assert setup.status_code == 201, setup.text
    run = _run(headers, "STATE-REQUIRED", "APCVD")
    run_id = run["id"]
    assert (
        client.put(
            f"/api/v1/experiments/{run_id}/setup-reference",
            json={"setup_id": setup.json()["id"], "version": 1},
            headers=headers,
        ).status_code
        == 200
    )
    payloads = {
        "target_product": {
            "chemical_formula": "WS2/MoS2",
            "structure_type": None,
            "components": [{"formula": "WS2", "role": "上层"}],
        },
        "precursors": {"items": [{"name_formula": "MoO3", "phase_state": "固", "amount": 20}]},
        "substrates": {"items": [{"material": "蓝宝石"}]},
        "process_steps": {
            "items": [
                {
                    "stage_type": "反应生长",
                    "temperature_program": "750 C",
                    "gas_species": "Ar",
                    "gas_flow_sccm": 80,
                    "pressure_system": {
                        "value": 101325,
                        "option": "atmospheric_pressure",
                    },
                }
            ]
        },
    }
    for module, payload in payloads.items():
        response = client.put(
            f"/api/v1/experiments/{run_id}/modules/{module}",
            json={"payload_json": payload},
            headers=headers,
        )
        assert response.status_code == 200, response.text

    response = client.post(f"/api/v1/experiments/{run_id}/lock", headers=headers)

    assert response.status_code == 422, response.text
    missing = response.json()["detail"]["missing"]
    assert next(item for item in missing if item["key"] == "structure_type")["requirement"] == "r0"


def test_write_permissions_follow_two_state_visibility(active_user, db_session) -> None:
    owner = _headers(active_user.email)
    other = User(
        email="other@example.com",
        name="Other",
        password_hash=active_user.password_hash,
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    run = _lockable_run(owner, "STATE-OWNER")
    headers = _headers(other.email)

    assert client.post(f"/api/v1/experiments/{run['id']}/lock", headers=headers).status_code == 404
    assert (
        client.post(
            f"/api/v1/experiments/{run['id']}/invalidate",
            json={"reason": "no"},
            headers=headers,
        ).status_code
        == 404
    )

    experiment = db_session.get(ExperimentRun, UUID(run["id"]))
    experiment.status = ExperimentStatus.LOCKED
    db_session.commit()

    assert client.post(f"/api/v1/experiments/{run['id']}/lock", headers=headers).status_code == 403
    assert (
        client.post(f"/api/v1/experiments/{run['id']}/unlock", headers=headers).status_code == 403
    )


def test_other_member_can_write_locked_results_and_files(active_user, db_session) -> None:
    owner = _headers(active_user.email)
    other = User(
        email="result-helper@example.com",
        name="Result Helper",
        password_hash=active_user.password_hash,
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    helper = _headers(other.email)
    run = _lockable_run(owner, "STATE-COLLAB")
    run_id = run["id"]
    assert client.post(f"/api/v1/experiments/{run_id}/lock", headers=owner).status_code == 200
    samples = client.get(f"/api/v1/samples?experiment_id={run_id}", headers=helper).json()["items"]
    assert len(samples) == 1
    sample = samples[0]

    record = client.post(
        f"/api/v1/experiments/{run_id}/characterization-records",
        json={"sample_id": sample["id"], "method_instrument": "Raman"},
        headers=helper,
    )
    assert record.status_code == 201, record.text
    assert (
        client.patch(
            f"/api/v1/characterization-records/{record.json()['id']}",
            json={"test_conditions": "532 nm"},
            headers=helper,
        ).status_code
        == 200
    )
    product = client.post(
        f"/api/v1/samples/{sample['id']}/measured-products",
        json={
            "characterization_record_id": record.json()["id"],
            "observed_phenomena": ["不连续覆盖"],
        },
        headers=helper,
    )
    assert product.status_code == 201, product.text
    assert (
        client.patch(
            f"/api/v1/measured-products/{product.json()['id']}",
            json={"layer_count": 1, "coverage_percent": 70},
            headers=helper,
        ).status_code
        == 200
    )
    upload = client.post(
        f"/api/v1/experiments/{run_id}/files",
        data={
            "characterization_record_id": record.json()["id"],
            "asset_role": "characterization_file",
        },
        files={"file": ("raman.txt", b"data", "text/plain")},
        headers=helper,
    )
    assert upload.status_code == 201, upload.text
    assert (
        client.put(
            f"/api/v1/experiments/{run_id}/modules/substrates",
            json={"payload_json": {"items": [{"material": "SiO2/Si"}]}},
            headers=helper,
        ).status_code
        == 403
    )
    assert client.delete(f"/api/v1/files/{upload.json()['id']}", headers=helper).status_code == 204
    assert (
        client.delete(
            f"/api/v1/measured-products/{product.json()['id']}", headers=helper
        ).status_code
        == 204
    )
    assert (
        client.delete(
            f"/api/v1/characterization-records/{record.json()['id']}",
            headers=helper,
        ).status_code
        == 204
    )


def test_result_write_rechecks_nonowner_access_after_run_lock(
    active_user,
    db_session,
    monkeypatch,
) -> None:
    owner = _headers(active_user.email)
    helper_user = User(
        email="unlock-race-helper@example.com",
        name="Unlock Race Helper",
        password_hash=active_user.password_hash,
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(helper_user)
    db_session.commit()
    helper = _headers(helper_user.email)
    run = _lockable_run(owner, "STATE-UNLOCK-RACE")
    assert client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner).status_code == 200
    sample = client.get(
        f"/api/v1/samples?experiment_id={run['id']}",
        headers=helper,
    ).json()["items"][0]

    original = ExperimentRepository.get_by_id_for_update

    def unlock_before_locked_read(repository, run_id):
        locked_run = original(repository, run_id)
        locked_run.status = ExperimentStatus.DRAFT
        repository.db.flush()
        return locked_run

    monkeypatch.setattr(
        ExperimentRepository,
        "get_by_id_for_update",
        unlock_before_locked_read,
    )
    response = client.post(
        f"/api/v1/samples/{sample['id']}/results",
        json={"kind": "direct_observation", "observed_phenomena": ["无生长"]},
        headers=helper,
    )

    assert response.status_code == 404
    db_session.expire_all()
    assert db_session.query(MeasuredProduct).count() == 0


def test_not_characterized_marker_clears_todo_and_new_result_clears_marker(
    active_user,
    monkeypatch,
) -> None:
    locked_run_ids: list[UUID] = []
    original_lock = ExperimentRepository.get_by_id_for_update

    def tracked_lock(repository, run_id):
        locked_run_ids.append(run_id)
        return original_lock(repository, run_id)

    monkeypatch.setattr(ExperimentRepository, "get_by_id_for_update", tracked_lock)
    headers = _headers(active_user.email)
    run = _lockable_run(headers, "STATE-NOT-CHAR")
    run_id = run["id"]
    assert client.post(f"/api/v1/experiments/{run_id}/lock", headers=headers).status_code == 200
    sample = client.get(f"/api/v1/samples?experiment_id={run_id}", headers=headers).json()["items"][
        0
    ]

    marked = client.put(
        f"/api/v1/experiments/{run_id}/not-characterized",
        json={"confirmed": True},
        headers=headers,
    )
    assert marked.status_code == 200, marked.text
    assert marked.json()["not_characterized_by_id"] is not None
    assert marked.json()["not_characterized_at"] is not None
    assert marked.json()["result_missing_todo"] is False

    result = client.post(
        f"/api/v1/samples/{sample['id']}/measured-products",
        json={"observed_phenomena": ["不连续覆盖"]},
        headers=headers,
    )
    assert result.status_code == 201, result.text
    refreshed = client.get(f"/api/v1/experiments/{run_id}", headers=headers).json()
    assert refreshed["not_characterized_by_id"] is None
    assert refreshed["not_characterized_at"] is None
    assert refreshed["result_missing_todo"] is False
    assert (
        client.put(
            f"/api/v1/experiments/{run_id}/not-characterized",
            json={"confirmed": True},
            headers=headers,
        ).status_code
        == 409
    )
    assert locked_run_ids.count(UUID(run_id)) >= 4


def test_invalid_run_rejects_process_and_result_writes(active_user) -> None:
    headers = _headers(active_user.email)
    run = _run(headers, "STATE-INVALID")
    run_id = run["id"]
    sample = client.post(
        f"/api/v1/experiments/{run_id}/samples", json={"role": "control"}, headers=headers
    ).json()
    record = client.post(
        f"/api/v1/experiments/{run_id}/characterization-records",
        json={"sample_id": sample["id"], "method_instrument": "Raman"},
        headers=headers,
    ).json()
    product = client.post(
        f"/api/v1/samples/{sample['id']}/measured-products",
        json={"observed_phenomena": ["不连续覆盖"]},
        headers=headers,
    ).json()
    assert (
        client.post(
            f"/api/v1/experiments/{run_id}/invalidate",
            json={"reason": "invalid data"},
            headers=headers,
        ).status_code
        == 200
    )

    requests = [
        ("put", f"/api/v1/experiments/{run_id}/modules/basic_info", {"payload_json": {}}),
        (
            "put",
            f"/api/v1/experiments/{run_id}/setup-reference",
            {"setup_id": "00000000-0000-0000-0000-000000000001", "version": 1},
        ),
        (
            "post",
            f"/api/v1/experiments/{run_id}/characterization-records",
            {"sample_id": sample["id"], "method_instrument": "Raman"},
        ),
        ("patch", f"/api/v1/characterization-records/{record['id']}", {}),
        ("delete", f"/api/v1/characterization-records/{record['id']}", None),
        (
            "post",
            f"/api/v1/samples/{sample['id']}/measured-products",
            {"observed_phenomena": ["无生长"]},
        ),
        ("patch", f"/api/v1/measured-products/{product['id']}", {}),
        ("delete", f"/api/v1/measured-products/{product['id']}", None),
    ]
    for method, url, body in requests:
        response = client.request(method, url, json=body, headers=headers)
        assert response.status_code == 409, (method, url, response.text)
