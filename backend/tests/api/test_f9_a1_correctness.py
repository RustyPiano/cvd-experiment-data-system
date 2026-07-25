from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.models.file_asset import FileAsset
from app.models.module_payload import ExperimentModulePayload
from app.models.v2_entities import Setup, SetupVersion
from app.repositories.experiment_repository import ExperimentRepository
from app.services import v2_r0_service
from app.services.v2_field_source import experiment_fields, load_field_source
from tests.helpers.v2_payloads import (
    basic_info_payload,
    setup_payload,
    target_product_payload,
    temperature_sensor,
)

client = TestClient(app)


def _headers(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_run(headers: dict[str, str], run_code: str | None = None) -> dict:
    payload = {
        "started_at": "2026-07-12T09:30:00",
        "synthesis_method": "APCVD",
        "operator": "tester",
        "chemical_formula": "MoS2",
        "ambient_temperature_C": 25.0,
        "ambient_humidity_percent": 45.0,
        "precheck_confirmed": True,
    }
    if run_code is not None:
        payload["run_code"] = run_code
    response = client.post("/api/v1/experiments", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _create_sample(headers: dict[str, str], run_id: str) -> dict:
    response = client.post(
        f"/api/v1/experiments/{run_id}/samples",
        json={"role": "control"},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_run_code_rejects_invalid_and_valid_custom_code_can_create_sample(active_user) -> None:
    headers = _headers(active_user.email)

    invalid = client.post(
        "/api/v1/experiments",
        json={
            "run_code": "TEST01",
            "started_at": "2026-07-12T09:30:00",
            "synthesis_method": "APCVD",
            "operator": "tester",
        },
        headers=headers,
    )
    run = _create_run(headers, "CVD-2026-0001")
    sample = _create_sample(headers, run["id"])

    assert invalid.status_code == 422
    assert sample["sample_code"]


def test_auto_run_code_uses_maximum_existing_suffix(active_user) -> None:
    headers = _headers(active_user.email)
    _create_run(headers, "CVD-2026-0099")

    created = [_create_run(headers)["run_code"] for _ in range(3)]

    assert created == ["CVD-2026-0100", "CVD-2026-0101", "CVD-2026-0102"]


def test_auto_run_code_returns_conflict_when_year_sequence_is_exhausted(active_user) -> None:
    headers = _headers(active_user.email)
    _create_run(headers, "CVD-2026-9999")

    response = client.post(
        "/api/v1/experiments",
        json={
            "started_at": "2026-07-12T09:30:00",
            "synthesis_method": "APCVD",
            "operator": "tester",
        },
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Run code sequence exhausted for 2026"


def test_auto_run_code_retries_after_unique_collision(active_user, monkeypatch) -> None:
    headers = _headers(active_user.email)
    _create_run(headers, "CVD-2026-0001")
    real_next = ExperimentRepository.next_run_code
    calls = 0

    def collide_once(repository: ExperimentRepository, experiment_date) -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            return "CVD-2026-0001"
        return real_next(repository, experiment_date)

    monkeypatch.setattr(ExperimentRepository, "next_run_code", collide_once)

    assert _create_run(headers)["run_code"] == "CVD-2026-0002"
    assert calls == 2


def test_entity_numeric_and_string_length_validation(admin_user) -> None:
    headers = _headers(admin_user.email)
    bad_number = client.post(
        "/api/v1/setups",
        json=setup_payload(setup_code="SETUP-1", zone_count="abc"),
        headers=headers,
    )
    too_long = client.post(
        "/api/v1/setups",
        json=setup_payload(setup_code="x" * 129),
        headers=headers,
    )
    valid = client.post(
        "/api/v1/setups",
        json=setup_payload(setup_code="SETUP-2"),
        headers=headers,
    )
    overflow = client.post(
        "/api/v1/setups",
        json=setup_payload(setup_code="SETUP-3", zone_count=2_147_483_648),
        headers=headers,
    )
    boolean_number = client.post(
        "/api/v1/setups",
        json=setup_payload(setup_code="SETUP-4", zone_count=True),
        headers=headers,
    )
    non_finite = client.post(
        "/api/v1/setups",
        json=setup_payload(
            setup_code="SETUP-5",
            temperature_sensors=[temperature_sensor(uncertainty_C="NaN")],
            zone_count=1,
        ),
        headers=headers,
    )

    assert bad_number.status_code == 422
    assert "zone_count" in bad_number.text
    assert too_long.status_code == 422
    assert "setup_code" in too_long.text
    assert valid.status_code == 201, valid.text
    assert overflow.status_code == 422
    assert boolean_number.status_code == 422
    assert non_finite.status_code == 422


def test_setup_requires_structured_sensors_and_rejects_deleted_fields(admin_user) -> None:
    headers = _headers(admin_user.email)
    valid = client.post(
        "/api/v1/setups",
        json=setup_payload(setup_code="SETUP-SENSORS-1"),
        headers=headers,
    )
    missing_sensors = client.post(
        "/api/v1/setups",
        json={
            key: value
            for key, value in setup_payload(setup_code="SETUP-SENSORS-2").items()
            if key != "temperature_sensors"
        },
        headers=headers,
    )
    deleted_pump_field = client.post(
        "/api/v1/setups",
        json={
            **setup_payload(setup_code="SETUP-SENSORS-3"),
            "pump_model_base_pressure": {"option": "Edwards RV12", "value": 2.0},
        },
        headers=headers,
    )
    deleted_coordinate_field = client.post(
        "/api/v1/setups",
        json={
            **setup_payload(setup_code="SETUP-SENSORS-4"),
            "coordinate_system": "upstream negative / downstream positive",
        },
        headers=headers,
    )

    assert valid.status_code == 201, valid.text
    assert valid.json()["latest_version"]["data"]["temperature_sensors"][0]["zone_index"] == 1
    assert missing_sensors.status_code == 422
    assert deleted_pump_field.status_code == 422
    assert deleted_coordinate_field.status_code == 422


def test_empty_entity_composite_cannot_bypass_shape_and_option_validation(
    admin_user,
) -> None:
    response = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "batch_number": "BAD-COMPOSITE",
            "substrate_orientation_polish": {
                "value": None,
                "option": "not-a-polish-option",
                "extra": "must-not-survive",
            },
        },
        headers=_headers(admin_user.email),
    )

    assert response.status_code == 422
    assert {item["key"] for item in response.json()["detail"]["invalid"]} == {
        "option",
        "extra",
    }


def test_experiment_chemical_formula_length_is_bounded(active_user) -> None:
    response = client.post(
        "/api/v1/experiments",
        json={
            "started_at": "2026-07-12T09:30:00",
            "synthesis_method": "APCVD",
            "operator": "tester",
            "chemical_formula": "x" * 65,
        },
        headers=_headers(active_user.email),
    )

    assert response.status_code == 422


def test_create_run_normalizes_formula_and_accepts_parenthesized_groups(active_user) -> None:
    headers = _headers(active_user.email)
    normalized = client.post(
        "/api/v1/experiments",
        json={
            "run_code": "CVD-2026-0009",
            "started_at": "2026-07-22T09:00:00",
            "synthesis_method": "APCVD",
            "chemical_formula": " Mo S₂ ",
        },
        headers=headers,
    )
    assert normalized.status_code == 201, normalized.text
    assert normalized.json()["material_system"] == "MoS2"

    grouped = client.post(
        "/api/v1/experiments",
        json={
            "run_code": "CVD-2026-0011",
            "started_at": "2026-07-22T09:00:00",
            "synthesis_method": "APCVD",
            "chemical_formula": "Mo(S)2",
        },
        headers=headers,
    )
    assert grouped.status_code == 201, grouped.text
    assert grouped.json()["material_system"] == "Mo(S)2"


def test_invalid_reason_is_returned_after_invalidation(active_user) -> None:
    headers = _headers(active_user.email)
    run = _create_run(headers, "CVD-2026-0010")

    invalidated = client.post(
        f"/api/v1/experiments/{run['id']}/invalidate",
        json={"reason": "bad thermocouple"},
        headers=headers,
    )
    fetched = client.get(f"/api/v1/experiments/{run['id']}", headers=headers)

    assert invalidated.status_code == 200
    assert invalidated.json()["invalid_reason"] == "bad thermocouple"
    assert fetched.json()["invalid_reason"] == "bad thermocouple"


def test_characterization_instrument_reference_must_be_complete_and_exist(
    active_user, admin_user
) -> None:
    owner_headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    run = _create_run(owner_headers, "CVD-2026-0020")
    sample = _create_sample(owner_headers, run["id"])

    only_id = client.post(
        f"/api/v1/experiments/{run['id']}/characterization-records",
        json={
            "sample_id": sample["id"],
            "instrument_id": str(uuid4()),
            "method_instrument": "Raman",
        },
        headers=owner_headers,
    )
    missing = client.post(
        f"/api/v1/experiments/{run['id']}/characterization-records",
        json={
            "sample_id": sample["id"],
            "instrument_id": str(uuid4()),
            "instrument_version": 1,
            "method_instrument": "Raman",
        },
        headers=owner_headers,
    )
    instrument = client.post(
        "/api/v1/instruments",
        json={"instrument_code": "RAMAN-1", "name_type": "Raman"},
        headers=admin_headers,
    )
    valid = client.post(
        f"/api/v1/experiments/{run['id']}/characterization-records",
        json={
            "sample_id": sample["id"],
            "instrument_id": instrument.json()["id"],
            "instrument_version": 1,
            "method_instrument": "Raman",
        },
        headers=owner_headers,
    )

    assert only_id.status_code == 422
    assert "instrument_id" in only_id.text and "instrument_version" in only_id.text
    assert missing.status_code == 422
    assert "instrument" in missing.text.lower()
    assert valid.status_code == 201, valid.text
    assert valid.json()["instrument_snapshot_json"]["instrument_code_snapshot"] == "RAMAN-1"


def test_characterization_method_uses_vocabulary_and_cascades_to_files(
    active_user, db_session
) -> None:
    headers = _headers(active_user.email)
    run = _create_run(headers, "CVD-2026-0030")
    sample = _create_sample(headers, run["id"])

    invalid = client.post(
        f"/api/v1/experiments/{run['id']}/characterization-records",
        json={"sample_id": sample["id"], "method_instrument": "not-a-method"},
        headers=headers,
    )
    record = client.post(
        f"/api/v1/experiments/{run['id']}/characterization-records",
        json={"sample_id": sample["id"], "method_instrument": "Raman"},
        headers=headers,
    )
    upload = client.post(
        f"/api/v1/experiments/{run['id']}/files",
        data={"characterization_record_id": record.json()["id"]},
        files={"file": ("spectrum.txt", b"peak=404", "text/plain")},
        headers=headers,
    )
    updated = client.patch(
        f"/api/v1/characterization-records/{record.json()['id']}",
        json={"method_instrument": "SEM"},
        headers=headers,
    )

    assert invalid.status_code == 422
    assert record.status_code == 201, record.text
    assert upload.status_code == 201, upload.text
    assert updated.status_code == 200, updated.text
    db_session.expire_all()
    synced_asset = db_session.get(FileAsset, UUID(upload.json()["id"]))
    assert synced_asset.method == "SEM"
    assert synced_asset.file_kind == "SEM"


def test_basic_info_upsert_synchronizes_date_and_canonical_run_code(active_user) -> None:
    headers = _headers(active_user.email)
    run = _create_run(headers, "CVD-2026-0040")

    saved = client.put(
        f"/api/v1/experiments/{run['id']}/modules/basic_info",
        json={
            "payload_json": basic_info_payload(
                started_at="2026-07-13T00:05:00",
                run_code="CVD-1999-9999",
                operator="tester",
            )
        },
        headers=headers,
    )
    fetched = client.get(f"/api/v1/experiments/{run['id']}", headers=headers)

    assert saved.status_code == 200, saved.text
    assert saved.json()["payload_json"]["run_code"] == "CVD-2026-0040"
    assert fetched.json()["experiment_date"] == "2026-07-13"


def test_setup_without_external_field_allows_process_without_field_program(
    active_user, db_session
) -> None:
    headers = _headers(active_user.email)
    setup = Setup()
    db_session.add(setup)
    db_session.flush()
    db_session.add(
        SetupVersion(
            entity_id=setup.id,
            version=1,
            setup_code="SETUP-MIXED",
            setup_name="mixed field setup",
            zone_count=2,
            orientation="水平",
            coordinate_system="上游负/下游正",
            attrs={
                "field_devices": ["none"],
                "temperature_sensors": [
                    temperature_sensor(zone_index=1),
                    temperature_sensor(zone_index=2),
                ],
            },
        )
    )
    db_session.commit()
    run = _create_run(headers, "CVD-2026-0050")
    reference = client.put(
        f"/api/v1/experiments/{run['id']}/setup-reference",
        json={
            "setup_id": str(setup.id),
            "version": 1,
            "tube_usage_history": {"reset_count": 0, "use_number_since_reset": 1},
        },
        headers=headers,
    )
    response = client.put(
        f"/api/v1/experiments/{run['id']}/modules/process_steps",
        json={"payload_json": {"items": []}},
        headers=headers,
    )

    assert reference.status_code == 200, reference.text
    assert response.status_code == 200, response.text


def test_lock_setup_gate_rejects_invalid_payload_and_accepts_reference_endpoint(
    active_user, admin_user, db_session, monkeypatch
) -> None:
    owner_headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    run = _create_run(owner_headers, "CVD-2026-0051")
    target = client.put(
        f"/api/v1/experiments/{run['id']}/modules/target_product",
        json={"payload_json": target_product_payload()},
        headers=owner_headers,
    )
    assert target.status_code == 200, target.text
    db_session.add(
        ExperimentModulePayload(
            experiment_run_id=UUID(run["id"]),
            module_key="equipment",
            schema_version="cvd_v2",
            payload_json={"setup_ref": "garbage"},
        )
    )
    db_session.commit()
    doc = load_field_source()
    setup_ref = next(field for field in experiment_fields(doc) if field["key"] == "setup_ref")
    monkeypatch.setattr(v2_r0_service, "experiment_fields", lambda _doc: [setup_ref])
    monkeypatch.setattr(v2_r0_service, "_process_semantic_checks", lambda *args: [])

    rejected = client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner_headers)
    setup = client.post(
        "/api/v1/setups",
        json=setup_payload(setup_code="SETUP-R0", setup_name="R0 setup", zone_count=1),
        headers=admin_headers,
    )
    referenced = client.put(
        f"/api/v1/experiments/{run['id']}/setup-reference",
        json={
            "setup_id": setup.json()["id"],
            "version": 1,
            "tube_usage_history": {"reset_count": 0, "use_number_since_reset": 1},
        },
        headers=owner_headers,
    )
    accepted = client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner_headers)

    assert rejected.status_code == 422
    assert "zone_count" in {item["key"] for item in rejected.json()["detail"]["invalid"]}
    assert referenced.status_code == 200, referenced.text
    assert accepted.status_code == 200, accepted.text


def test_module_validation_returns_structured_invalid_detail(active_user) -> None:
    headers = _headers(active_user.email)
    run = _create_run(headers, "CVD-2026-0060")

    response = client.put(
        f"/api/v1/experiments/{run['id']}/modules/process_steps",
        json={"payload_json": {"items": "not-a-list"}},
        headers=headers,
    )
    bad_formula = client.put(
        f"/api/v1/experiments/{run['id']}/modules/target_product",
        json={"payload_json": target_product_payload(chemical_formula="x" * 65)},
        headers=headers,
    )
    bad_formula_type = client.put(
        f"/api/v1/experiments/{run['id']}/modules/target_product",
        json={"payload_json": target_product_payload(chemical_formula={"not": "text"})},
        headers=headers,
    )

    assert response.status_code == 422
    invalid = response.json()["detail"]["invalid"]
    assert any(item["key"] == "items" for item in invalid)
    assert all(item["reason"] in {"type", "length", "value"} for item in invalid)
    assert bad_formula.status_code == 422
    assert bad_formula.json()["detail"] == {
        "invalid": [{"key": "chemical_formula", "reason": "value"}]
    }
    assert bad_formula_type.status_code == 422
    assert bad_formula_type.json()["detail"] == {
        "invalid": [{"key": "chemical_formula", "reason": "type"}]
    }


def test_basic_info_invalid_started_at_returns_structured_422(active_user) -> None:
    headers = _headers(active_user.email)
    run = _create_run(headers, "CVD-2026-0061")

    response = client.put(
        f"/api/v1/experiments/{run['id']}/modules/basic_info",
        json={
            "payload_json": basic_info_payload(
                started_at=123,
                operator="tester",
                run_code=run["run_code"],
            )
        },
        headers=headers,
    )

    assert response.status_code == 422
    assert response.json()["detail"] == {"invalid": [{"key": "started_at", "reason": "value"}]}
