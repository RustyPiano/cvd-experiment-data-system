from uuid import UUID

from fastapi.testclient import TestClient

from app.main import app
from app.models.audit import AuditEvent
from app.models.sample import Sample, SampleRole
from app.repositories.experiment_repository import ExperimentRepository

client = TestClient(app)


def test_v2_routes_are_collected_under_api_v1() -> None:
    paths = app.openapi()["paths"]

    assert "/api/v1/experiments" in paths
    assert "/api/v1/experiments/{run_id}/characterization-records" in paths
    assert "/api/v1/samples/{sample_id}/measured-products" in paths
    legacy_prefix = "/api/v1/" + "v2/"
    assert not any(path.startswith(legacy_prefix) for path in paths)


def test_v2_experiment_status_openapi_is_closed_enum() -> None:
    status_schema = app.openapi()["components"]["schemas"]["V2ExperimentRead"]["properties"][
        "status"
    ]

    assert status_schema["enum"] == ["draft", "submitted", "locked", "invalid"]


def login(email: str, password: str = "Password123!") -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {login(email)}"}


def test_naive_started_at_drives_local_experiment_and_run_code_date(
    active_user, monkeypatch
) -> None:
    def next_run_code(_repository: ExperimentRepository, experiment_date) -> str:
        return f"CVD-{experiment_date:%Y}-0001"

    monkeypatch.setattr(ExperimentRepository, "next_run_code", next_run_code)
    response = client.post(
        "/api/v1/experiments",
        json={
            "started_at": "2026-07-12T00:05:00",
            "synthesis_method": "APCVD",
            "operator": "午夜实验员",
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 201, response.text
    assert response.json()["experiment_date"] == "2026-07-12"
    assert response.json()["run_code"] == "CVD-2026-0001"


def test_v2_entity_versions_are_append_only_queryable_and_audited(active_user, db_session) -> None:
    headers = auth_headers(active_user.email)

    create = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "化学品",
            "substance_name": "三氧化钼",
            "chemical_formula": "MoO3",
            "batch_number": "B202405",
            "supplier": "阿拉丁",
        },
        headers=headers,
    )
    assert create.status_code == 201, create.text
    entity_id = create.json()["id"]
    assert create.json()["latest_version"]["version"] == 1

    append = client.post(
        f"/api/v1/material-lots/{entity_id}/versions",
        json={
            "lot_category": "化学品",
            "substance_name": "三氧化钼",
            "chemical_formula": "MoO3",
            "batch_number": "B202405",
            "supplier": "Sigma",
        },
        headers=headers,
    )
    assert append.status_code == 201, append.text
    assert append.json()["version"] == 2

    versions = client.get(f"/api/v1/material-lots/{entity_id}/versions", headers=headers)
    assert versions.status_code == 200
    assert [item["version"] for item in versions.json()["items"]] == [1, 2]
    event = db_session.query(AuditEvent).filter(AuditEvent.action == "append_entity_version").one()
    assert event.actor_id == active_user.id
    assert event.entity_id == UUID(entity_id)
    assert event.before_json is None
    assert event.after_json == {
        "kind": "material_lot",
        "entity_id": entity_id,
        "version": 2,
    }


def test_v2_entity_create_reports_all_missing_required_fields(active_user) -> None:
    headers = auth_headers(active_user.email)

    response = client.post(
        "/api/v1/material-lots",
        json={"lot_category": "化学品"},
        headers=headers,
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["missing"] == [
        "substance_name",
        "chemical_formula",
        "batch_number",
    ]


def test_v2_run_payload_validation_and_setup_snapshot(active_user) -> None:
    headers = auth_headers(active_user.email)
    setup = client.post(
        "/api/v1/setups",
        json={
            "setup_code": "CVD-炉1",
            "setup_name": "1号双温区管式炉",
            "zone_count": 2,
            "orientation": "水平",
            "coordinate_system": "原点=温区2热电偶；下游为正",
            "field_devices": "等离子",
        },
        headers=headers,
    )
    assert setup.status_code == 201, setup.text

    run = client.post(
        "/api/v1/experiments",
        json={
            "run_code": "CVD-2026-0100",
            "started_at": "2026-07-08T09:30:00",
            "synthesis_method": "APCVD",
            "operator": "李俊杰",
            "chemical_formula": "MoS2",
        },
        headers=headers,
    )
    assert run.status_code == 201, run.text
    run_id = run.json()["id"]
    assert run.json()["schema_version"] == "cvd_v2"

    ref = client.put(
        f"/api/v1/experiments/{run_id}/setup-reference",
        json={"setup_id": setup.json()["id"], "version": 1},
        headers=headers,
    )
    assert ref.status_code == 200, ref.text
    assert ref.json()["setup_ref_version"] == 1
    assert ref.json()["setup_ref_snapshot_json"]["setup_code_snapshot"] == "CVD-炉1"

    bad_step = client.put(
        f"/api/v1/experiments/{run_id}/modules/process_steps",
        json={
            "payload_json": {
                "items": [
                    {
                        "stage_type": "反应生长",
                        "temperature_program": "25->750",
                        "gas_species": "Ar",
                        "gas_flow_sccm": 80,
                        "pressure_system": "常压",
                    }
                ]
            }
        },
        headers=headers,
    )
    assert bad_step.status_code == 422
    assert "field_params" in bad_step.text

    good_step = client.put(
        f"/api/v1/experiments/{run_id}/modules/process_steps",
        json={
            "payload_json": {
                "items": [
                    {
                        "stage_type": "反应生长",
                        "temperature_program": "25->750",
                        "gas_species": "Ar",
                        "gas_flow_sccm": 80,
                        "pressure_system": "常压",
                        "field_params": "等离子 50W",
                    }
                ]
            }
        },
        headers=headers,
    )
    assert good_step.status_code == 200, good_step.text
    assert good_step.json()["schema_version"] == "cvd_v2"


def _create_run(headers: dict[str, str], run_code: str, formula: str = "MoS2") -> str:
    response = client.post(
        "/api/v1/experiments",
        json={
            "run_code": run_code,
            "started_at": "2026-07-11T09:30:00",
            "synthesis_method": "APCVD",
            "operator": "李俊杰",
            "chemical_formula": formula,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_target_product_upsert_updates_run_material_system_and_audits_key(
    active_user, db_session
) -> None:
    headers = auth_headers(active_user.email)
    run_id = _create_run(headers, "CVD-2026-0101")

    response = client.put(
        f"/api/v1/experiments/{run_id}/modules/target_product",
        json={"payload_json": {"chemical_formula": "WS2/MoS2", "structure_type": "本征"}},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    run = client.get(f"/api/v1/experiments/{run_id}", headers=headers)
    assert run.json()["material_system"] == "WS2/MoS2"
    event = db_session.query(AuditEvent).filter(AuditEvent.action == "upsert_module").one()
    assert event.actor_id == active_user.id
    assert event.entity_id == UUID(run_id)
    assert event.before_json is None
    assert event.after_json == {"module_key": "target_product"}


def test_target_product_upsert_clears_run_material_system(active_user) -> None:
    headers = auth_headers(active_user.email)
    run_id = _create_run(headers, "CVD-2026-0102")

    response = client.put(
        f"/api/v1/experiments/{run_id}/modules/target_product",
        json={"payload_json": {"chemical_formula": "", "structure_type": "本征"}},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    run = client.get(f"/api/v1/experiments/{run_id}", headers=headers)
    assert run.json()["material_system"] is None


def test_other_module_upsert_preserves_run_material_system(active_user) -> None:
    headers = auth_headers(active_user.email)
    run_id = _create_run(headers, "CVD-2026-0103", "WSe2")

    response = client.put(
        f"/api/v1/experiments/{run_id}/modules/basic_info",
        json={
            "payload_json": {
                "started_at": "2026-07-11T09:30:00",
                "synthesis_method": "LPCVD",
                "operator": "李俊杰",
                "run_code": "CVD-2026-0103",
            }
        },
        headers=headers,
    )

    assert response.status_code == 200, response.text
    run = client.get(f"/api/v1/experiments/{run_id}", headers=headers)
    assert run.json()["material_system"] == "WSe2"


def test_v2_characterization_and_measured_product_crud(active_user, db_session) -> None:
    headers = auth_headers(active_user.email)
    run = client.post(
        "/api/v1/experiments",
        json={
            "run_code": "CVD-2026-0104",
            "started_at": "2026-07-08T09:30:00",
            "synthesis_method": "APCVD",
            "operator": "李俊杰",
        },
        headers=headers,
    )
    assert run.status_code == 201, run.text
    run_id = run.json()["id"]
    sample = Sample(
        sample_code="RUN-V2-RESULTS-S1",
        experiment_run_id=UUID(run_id),
        role=SampleRole.PRODUCT,
    )
    db_session.add(sample)
    db_session.commit()
    db_session.refresh(sample)

    record = client.post(
        f"/api/v1/experiments/{run_id}/characterization-records",
        json={"sample_id": str(sample.id), "method_instrument": "Raman"},
        headers=headers,
    )
    assert record.status_code == 201, record.text

    product = client.post(
        f"/api/v1/samples/{sample.id}/measured-products",
        json={
            "characterization_record_id": record.json()["id"],
            "observed_phenomena": ["不连续覆盖"],
            "detected_phase_stacking": "2H-MoS2",
        },
        headers=headers,
    )
    assert product.status_code == 201, product.text
    assert product.json()["observed_phenomena"] == ["不连续覆盖"]

    patch = client.patch(
        f"/api/v1/measured-products/{product.json()['id']}",
        json={"measured_layers_coverage": "1层；70%"},
        headers=headers,
    )
    assert patch.status_code == 200, patch.text
    assert patch.json()["measured_layers_coverage"] == "1层；70%"

    other_sample = Sample(
        sample_code="RUN-V2-RESULTS-S2",
        experiment_run_id=UUID(run_id),
        role=SampleRole.CONTROL,
    )
    db_session.add(other_sample)
    db_session.commit()
    other_record = client.post(
        f"/api/v1/experiments/{run_id}/characterization-records",
        json={"sample_id": str(other_sample.id), "method_instrument": "SEM"},
        headers=headers,
    )
    assert other_record.status_code == 201, other_record.text

    cross_sample = client.patch(
        f"/api/v1/measured-products/{product.json()['id']}",
        json={"characterization_record_id": other_record.json()["id"]},
        headers=headers,
    )
    assert cross_sample.status_code == 422
    assert cross_sample.json()["detail"] == "characterization_record_id must belong to the sample"

    referenced_delete = client.delete(
        f"/api/v1/characterization-records/{record.json()['id']}",
        headers=headers,
    )
    assert referenced_delete.status_code == 409
    assert "measured product" in referenced_delete.json()["detail"].lower()
