import time
from uuid import UUID

from fastapi.testclient import TestClient

from app.main import app
from app.models.file_asset import FileAsset
from app.models.module_payload import ExperimentModuleKey, ExperimentModulePayload

client = TestClient(app)


def login(email: str, password: str = "Password123!") -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {login(email)}"}


def populate_required_modules(experiment_id: str, email: str) -> None:
    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={"payload_json": {"items": [{"role": "A", "type": "MoO3", "method": "powder"}]}},
        headers=auth_headers(email),
    )
    assert precursors_response.status_code == 200

    furnace_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/furnace_program",
        json={
            "payload_json": {
                "zones": [
                    {
                        "zone_index": 1,
                        "precursor_placed": True,
                        "temperature_program": [
                            {"time_min": 0, "temperature_C": 25},
                            {"time_min": 30, "temperature_C": 750},
                        ],
                        "note": "",
                    }
                ]
            }
        },
        headers=auth_headers(email),
    )
    assert furnace_response.status_code == 200

    gas_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/gas_program",
        json={
            "payload_json": {
                "pre_washing_gas": "Ar+H2",
                "segments": [
                    {
                        "stage": "growth",
                        "start_min": 0,
                        "end_min": 45,
                        "gas": "Ar",
                        "components": [{"name": "Ar", "fraction": 1}],
                        "flow_sccm": 80,
                    }
                ],
            }
        },
        headers=auth_headers(email),
    )
    assert gas_response.status_code == 200


def assert_issue_exists(
    issues: list[dict[str, str]],
    *,
    module_key: str,
    field_path: str,
    message_contains: str,
) -> None:
    assert any(
        issue["module_key"] == module_key
        and issue["field_path"] == field_path
        and message_contains in issue["message"]
        for issue in issues
    ), issues


def create_experiment_for_test(email: str, *, objective: str = "Validation flow") -> str:
    response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": objective,
        },
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_create_experiment_creates_draft_for_member(active_user) -> None:
    response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Baseline growth",
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["owner_id"] == str(active_user.id)
    assert body["run_code"].startswith("CVD-2026-")


def test_viewer_cannot_create_experiment(viewer_user) -> None:
    response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Should fail",
        },
        headers=auth_headers(viewer_user.email),
    )

    assert response.status_code == 403


def test_list_experiments_shows_own_drafts_and_public_submitted(active_user, admin_user) -> None:
    own_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Own draft",
        },
        headers=auth_headers(active_user.email),
    )
    assert own_response.status_code == 201

    other_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-22",
            "objective": "Other draft",
        },
        headers=auth_headers(admin_user.email),
    )
    assert other_response.status_code == 201
    other_id = other_response.json()["id"]
    populate_required_modules(other_id, admin_user.email)

    submit_response = client.post(
        f"/api/v1/experiments/{other_id}/submit",
        headers=auth_headers(admin_user.email),
    )
    assert submit_response.status_code == 200

    list_response = client.get(
        "/api/v1/experiments",
        headers=auth_headers(active_user.email),
    )

    assert list_response.status_code == 200
    run_codes = {item["run_code"] for item in list_response.json()["items"]}
    assert own_response.json()["run_code"] in run_codes
    assert other_response.json()["run_code"] in run_codes


def test_patch_experiment_updates_draft_for_owner(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Before patch",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    patch_response = client.patch(
        f"/api/v1/experiments/{experiment_id}",
        json={
            "experiment_type": "cvd_hot_wall",
            "objective": "After patch",
            "material_system": "WS2",
        },
        headers=auth_headers(active_user.email),
    )

    assert patch_response.status_code == 200
    assert patch_response.json()["experiment_type"] == "cvd_hot_wall"
    assert patch_response.json()["objective"] == "After patch"
    assert patch_response.json()["material_system"] == "WS2"


def test_patch_experiment_updates_draft_date_without_changing_run_code(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Before date patch",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    original_run_code = create_response.json()["run_code"]

    patch_response = client.patch(
        f"/api/v1/experiments/{experiment_id}",
        json={"experiment_date": "2026-04-20"},
        headers=auth_headers(active_user.email),
    )

    assert patch_response.status_code == 200
    body = patch_response.json()
    assert body["experiment_date"] == "2026-04-20"
    assert body["run_code"] == original_run_code


def test_patch_experiment_date_rejects_null(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Null date patch",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    patch_response = client.patch(
        f"/api/v1/experiments/{experiment_id}",
        json={"experiment_date": None},
        headers=auth_headers(active_user.email),
    )

    assert patch_response.status_code == 422
    assert patch_response.json()["detail"] == "experiment_date cannot be null"


def test_patch_experiment_date_rejects_non_draft(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Submitted date patch",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_required_modules(experiment_id, active_user.email)
    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )
    assert submit_response.status_code == 200

    patch_response = client.patch(
        f"/api/v1/experiments/{experiment_id}",
        json={"experiment_date": "2026-04-20"},
        headers=auth_headers(active_user.email),
    )

    assert patch_response.status_code == 409


def test_patch_experiment_preserves_unset_fields(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Before patch",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    patch_response = client.patch(
        f"/api/v1/experiments/{experiment_id}",
        json={"objective": "Only objective changed"},
        headers=auth_headers(active_user.email),
    )

    assert patch_response.status_code == 200
    assert patch_response.json()["objective"] == "Only objective changed"
    assert patch_response.json()["material_system"] == "MoS2"


def test_submit_then_lock_updates_status_timestamps(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Status flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_required_modules(experiment_id, active_user.email)

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )
    lock_response = client.post(
        f"/api/v1/experiments/{experiment_id}/lock",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 200
    assert submit_response.json()["status"] == "submitted"
    assert submit_response.json()["submitted_at"] is not None
    assert lock_response.status_code == 200
    assert lock_response.json()["status"] == "locked"
    assert lock_response.json()["locked_at"] is not None


def test_return_to_draft_moves_submitted_experiment_back_to_draft(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Return flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_required_modules(experiment_id, active_user.email)

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )
    assert submit_response.status_code == 200

    return_response = client.post(
        f"/api/v1/experiments/{experiment_id}/return-to-draft",
        headers=auth_headers(active_user.email),
    )

    assert return_response.status_code == 200
    assert return_response.json()["status"] == "draft"
    assert return_response.json()["submitted_at"] is None
    assert return_response.json()["locked_at"] is None


def test_submit_rejects_missing_required_main_fields(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": None,
            "experiment_date": "2026-04-23",
            "objective": "Validation flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422
    body = response.json()
    assert body["ok"] is False
    assert_issue_exists(
        body["errors"],
        module_key="basic_info",
        field_path="material_system",
        message_contains="required",
    )


def test_validate_returns_structured_errors_and_warnings(active_user, db_session) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": None,
            "experiment_date": "2026-04-23",
            "objective": "Validate payload structure",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    environment_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/environment",
        json={
            "payload_json": {
                "indoor_temperature_C": 40,
                "sample_env": "clean",
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert environment_response.status_code == 200

    precheck_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precheck",
        json={
            "payload_json": {
                "seal_intact": False,
                "risk_note": "",
                "boat_contamination_level": "high",
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert precheck_response.status_code == 200

    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={
            "payload_json": {
                "items": [{"role": "A", "type": "MoO3", "brand": "Sigma", "method": "powder"}],
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert precursors_response.status_code == 200

    furnace_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/furnace_program",
        json={
            "payload_json": {
                "zones": [
                    {
                        "zone_index": 1,
                        "temperature_program": [
                            {"time_min": 10, "temperature_C": 750},
                            {"time_min": 5, "temperature_C": 700},
                        ],
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert furnace_response.status_code == 200

    gas_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/gas_program",
        json={
            "payload_json": {
                "segments": [
                    {
                        "stage": "growth",
                        "start_min": 0,
                        "end_min": 8,
                        "gas": "Ar",
                        "flow_sccm": 80,
                    },
                    {
                        "stage": "cooldown",
                        "start_min": 6,
                        "end_min": 12,
                        "gas": "Ar+H2",
                        "flow_sccm": 100,
                    },
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert gas_response.status_code == 200

    db_session.add(
        FileAsset(
            experiment_run_id=UUID(experiment_id),
            sample_id=None,
            uploaded_by_id=active_user.id,
            original_name="validate.txt",
            storage_path="manual/validate.txt",
            content_type="text/plain",
            size_bytes=8,
            sha256="a" * 64,
            method="",
            file_category="raw",
            note=None,
            file_kind=None,
            metadata_json={},
        )
    )
    db_session.commit()

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/validate",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert body["blocking_count"] == len(body["errors"])
    assert body["warning_count"] == len(body["warnings"])
    assert body["completion_score"] == 58
    assert_issue_exists(
        body["errors"],
        module_key="basic_info",
        field_path="material_system",
        message_contains="required",
    )
    assert_issue_exists(
        body["errors"],
        module_key="furnace_program",
        field_path="zones[0].temperature_program",
        message_contains="strictly increasing",
    )
    assert_issue_exists(
        body["errors"],
        module_key="gas_program",
        field_path="segments",
        message_contains="overlap",
    )
    assert_issue_exists(
        body["errors"],
        module_key="precheck",
        field_path="risk_note",
        message_contains="required",
    )
    assert_issue_exists(
        body["errors"],
        module_key="files",
        field_path="items[0].method",
        message_contains="required",
    )
    assert_issue_exists(
        body["warnings"],
        module_key="environment",
        field_path="indoor_temperature_C",
        message_contains="out of range",
    )
    assert_issue_exists(
        body["warnings"],
        module_key="environment",
        field_path="indoor_humidity_percent",
        message_contains="missing",
    )
    assert_issue_exists(
        body["warnings"],
        module_key="precheck",
        field_path="boat_contamination_level",
        message_contains="high",
    )
    assert_issue_exists(
        body["warnings"],
        module_key="precursors",
        field_path="items[0].batch_no",
        message_contains="missing",
    )
    assert_issue_exists(
        body["warnings"],
        module_key="files",
        field_path="items[0].sample_id",
        message_contains="not linked",
    )
    assert_issue_exists(
        body["warnings"],
        module_key="result_summary",
        field_path="quality_label",
        message_contains="unknown",
    )


def test_validate_score_uses_fixed_checklist_for_repeated_rows(active_user) -> None:
    def create_experiment_with_precursors(precursor_items: list[dict]) -> str:
        experiment_id = create_experiment_for_test(
            active_user.email,
            objective="Fixed checklist completeness",
        )
        precursors_response = client.put(
            f"/api/v1/experiments/{experiment_id}/modules/precursors",
            json={"payload_json": {"items": precursor_items}},
            headers=auth_headers(active_user.email),
        )
        assert precursors_response.status_code == 200
        furnace_response = client.put(
            f"/api/v1/experiments/{experiment_id}/modules/furnace_program",
            json={
                "payload_json": {
                    "zones": [
                        {
                            "zone_index": 1,
                            "temperature_program": [
                                {"time_min": 0, "temperature_C": 25},
                                {"time_min": 30, "temperature_C": 750},
                            ],
                        }
                    ]
                }
            },
            headers=auth_headers(active_user.email),
        )
        assert furnace_response.status_code == 200
        summary_response = client.put(
            f"/api/v1/experiments/{experiment_id}/modules/result_summary",
            json={"payload_json": {"quality_label": "success"}},
            headers=auth_headers(active_user.email),
        )
        assert summary_response.status_code == 200
        return experiment_id

    one_row_id = create_experiment_with_precursors(
        [{"role": "A", "type": "MoO3", "method": "powder", "mass_mg": 5}]
    )
    two_row_id = create_experiment_with_precursors(
        [
            {"role": "A", "type": "MoO3", "method": "powder", "mass_mg": 5},
            {
                "role": "B",
                "type": "S",
                "method": "evaporation",
                "mass_mg": 2,
                "batch_no": "S-001",
            },
        ]
    )

    one_row_response = client.post(
        f"/api/v1/experiments/{one_row_id}/validate",
        headers=auth_headers(active_user.email),
    )
    two_row_response = client.post(
        f"/api/v1/experiments/{two_row_id}/validate",
        headers=auth_headers(active_user.email),
    )

    assert one_row_response.status_code == 200
    assert two_row_response.status_code == 200
    assert (
        one_row_response.json()["completion_score"] == two_row_response.json()["completion_score"]
    )


def test_validate_can_return_ok_with_incomplete_score(active_user) -> None:
    experiment_id = create_experiment_for_test(
        active_user.email,
        objective="Incomplete but submittable",
    )
    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "A",
                        "type": "MoO3",
                        "method": "powder",
                        "mass_mg": 5,
                        "batch_no": "MO-001",
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert precursors_response.status_code == 200
    furnace_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/furnace_program",
        json={
            "payload_json": {
                "zones": [
                    {
                        "zone_index": 1,
                        "temperature_program": [
                            {"time_min": 0, "temperature_C": 25},
                            {"time_min": 30, "temperature_C": 750},
                        ],
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert furnace_response.status_code == 200
    summary_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/result_summary",
        json={"payload_json": {"quality_label": "success"}},
        headers=auth_headers(active_user.email),
    )
    assert summary_response.status_code == 200

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/validate",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["errors"] == []
    assert body["warnings"] == []
    assert body["completion_score"] == 58


def test_submit_returns_same_validation_structure_on_failure(active_user, db_session) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Submit should mirror validate",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    environment_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/environment",
        json={"payload_json": {"indoor_temperature_C": 39, "sample_env": "clean"}},
        headers=auth_headers(active_user.email),
    )
    assert environment_response.status_code == 200

    db_session.add(
        FileAsset(
            experiment_run_id=UUID(experiment_id),
            sample_id=None,
            uploaded_by_id=active_user.id,
            original_name="submit.txt",
            storage_path="manual/submit.txt",
            content_type="text/plain",
            size_bytes=6,
            sha256="b" * 64,
            method="",
            file_category="raw",
            note=None,
            file_kind=None,
            metadata_json={},
        )
    )
    db_session.commit()

    validate_response = client.post(
        f"/api/v1/experiments/{experiment_id}/validate",
        headers=auth_headers(active_user.email),
    )
    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )

    assert validate_response.status_code == 200
    assert submit_response.status_code == 422
    assert submit_response.json() == validate_response.json()


def test_submit_reports_database_critical_missing_fields(active_user) -> None:
    experiment_id = create_experiment_for_test(
        active_user.email,
        objective="Database critical missing fields",
    )

    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={"payload_json": {"items": [{"role": "A", "mass_mg": 5}]}},
        headers=auth_headers(active_user.email),
    )
    assert precursors_response.status_code == 200

    substrates_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={"payload_json": {"items": [{"brand": "MTI"}]}},
        headers=auth_headers(active_user.email),
    )
    assert substrates_response.status_code == 200

    furnace_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/furnace_program",
        json={
            "payload_json": {
                "zones": [
                    {
                        "zone_index": 1,
                        "temperature_program": [{"time_min": 0}],
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert furnace_response.status_code == 200

    gas_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/gas_program",
        json={
            "payload_json": {
                "segments": [
                    {
                        "stage": "growth",
                        "start_min": 0,
                        "end_min": 45,
                        "flow_sccm": 80,
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert gas_response.status_code == 200

    characterization_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/characterization",
        json={"payload_json": {"methods": [{"enabled": True, "result": "peak visible"}]}},
        headers=auth_headers(active_user.email),
    )
    assert characterization_response.status_code == 200

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 422
    errors = submit_response.json()["errors"]
    assert_issue_exists(
        errors,
        module_key="precursors",
        field_path="items[0].type",
        message_contains="required",
    )
    assert_issue_exists(
        errors,
        module_key="precursors",
        field_path="items[0].method",
        message_contains="required",
    )
    assert_issue_exists(
        errors,
        module_key="substrates",
        field_path="items[0].role",
        message_contains="required",
    )
    assert_issue_exists(
        errors,
        module_key="substrates",
        field_path="items[0].type",
        message_contains="required",
    )
    assert_issue_exists(
        errors,
        module_key="furnace_program",
        field_path="zones[0].temperature_program[0].temperature_C",
        message_contains="required",
    )
    assert_issue_exists(
        errors,
        module_key="gas_program",
        field_path="segments[0].gas",
        message_contains="required",
    )
    assert_issue_exists(
        errors,
        module_key="characterization",
        field_path="methods[0].method",
        message_contains="required",
    )


def test_put_and_get_experiment_module_payload(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Module save flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    put_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "A",
                        "type": "MoO3",
                        "brand": "Sigma",
                        "concentration": None,
                        "concentration_unit": "",
                        "method": "melting",
                        "melting_temperature_C": 90,
                        "spin_speed_rpm": None,
                        "pre_spin_speed_rpm": None,
                        "preparation_time_min": None,
                        "mass_mg": 5,
                        "batch_no": "MO-001",
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    get_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        headers=auth_headers(active_user.email),
    )
    list_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules",
        headers=auth_headers(active_user.email),
    )

    assert put_response.status_code == 200
    assert put_response.json()["module_key"] == "precursors"
    assert put_response.json()["schema_version"] == "cvd_v1"
    assert put_response.json()["payload_json"]["items"][0]["type"] == "MoO3"
    assert get_response.status_code == 200
    assert get_response.json()["payload_json"]["items"][0]["batch_no"] == "MO-001"
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1
    assert list_response.json()["items"][0]["module_key"] == "precursors"


def test_upsert_module_rejects_non_numeric_scientific_values(active_user) -> None:
    experiment_id = create_experiment_for_test(
        active_user.email,
        objective="Strict numeric module payloads",
    )

    invalid_payloads = [
        (
            "precursors",
            {"items": [{"role": "A", "type": "MoO3", "method": "powder", "mass_mg": "abc"}]},
            "mass_mg",
        ),
        (
            "gas_program",
            {
                "segments": [
                    {
                        "stage": "growth",
                        "start_min": 0,
                        "end_min": 45,
                        "gas": "Ar",
                        "flow_sccm": "abc",
                    }
                ]
            },
            "flow_sccm",
        ),
        (
            "furnace_program",
            {
                "zones": [
                    {
                        "zone_index": 1,
                        "temperature_program": [
                            {"time_min": 0, "temperature_C": "hot"},
                        ],
                    }
                ]
            },
            "temperature_C",
        ),
    ]

    for module_key, payload_json, rejected_field in invalid_payloads:
        response = client.put(
            f"/api/v1/experiments/{experiment_id}/modules/{module_key}",
            json={"payload_json": payload_json},
            headers=auth_headers(active_user.email),
        )

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert any(
            rejected_field in ".".join(str(part) for part in error["loc"]) for error in detail
        )

    extension_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/environment",
        json={
            "payload_json": {
                "sample_env": "clean",
                "indoor_temperature_C": 25,
                "legacy_extension": {"operator_note": "keep this field"},
            }
        },
        headers=auth_headers(active_user.email),
    )

    assert extension_response.status_code == 200
    assert extension_response.json()["payload_json"]["legacy_extension"] == {
        "operator_note": "keep this field",
    }


def test_put_and_get_process_observation_module_payload(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Observation save flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    put_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/process_observation",
        json={
            "payload_json": {
                "color_change": "center area darkened",
                "abnormal_events": ["minor condensate"],
                "note": "growth stable after 15 min",
            }
        },
        headers=auth_headers(active_user.email),
    )
    get_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules/process_observation",
        headers=auth_headers(active_user.email),
    )

    assert put_response.status_code == 200
    assert get_response.status_code == 200
    assert get_response.json()["payload_json"]["color_change"] == "center area darkened"


def test_submit_rejects_missing_required_modules(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Module validation flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422
    assert_issue_exists(
        response.json()["errors"],
        module_key="precursors",
        field_path="items",
        message_contains="required",
    )
    assert_issue_exists(
        response.json()["errors"],
        module_key="furnace_program",
        field_path="zones",
        message_contains="required",
    )


def test_submit_rejects_invalid_furnace_and_gas_program(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Module validation flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={"payload_json": {"items": [{"role": "A", "type": "MoO3", "method": "powder"}]}},
        headers=auth_headers(active_user.email),
    )
    assert precursors_response.status_code == 200

    furnace_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/furnace_program",
        json={
            "payload_json": {
                "zones": [
                    {
                        "zone_index": 1,
                        "precursor_placed": True,
                        "temperature_program": [
                            {"time_min": 30, "temperature_C": 750},
                            {"time_min": 20, "temperature_C": 700},
                        ],
                        "note": "",
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert furnace_response.status_code == 200

    gas_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/gas_program",
        json={
            "payload_json": {
                "pre_washing_gas": "Ar+H2",
                "segments": [
                    {
                        "stage": "growth",
                        "start_min": 0,
                        "end_min": 10,
                        "gas": "Ar",
                        "components": [{"name": "Ar", "fraction": 1}],
                        "flow_sccm": 80,
                    },
                    {
                        "stage": "cooldown",
                        "start_min": 5,
                        "end_min": 10,
                        "gas": "Ar+H2",
                        "components": [{"name": "Ar", "fraction": 0.95}],
                        "flow_sccm": 100,
                    },
                ],
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert gas_response.status_code == 200

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 422
    assert_issue_exists(
        submit_response.json()["errors"],
        module_key="furnace_program",
        field_path="zones[0].temperature_program",
        message_contains="strictly increasing",
    )
    assert_issue_exists(
        submit_response.json()["errors"],
        module_key="gas_program",
        field_path="segments",
        message_contains="overlap",
    )


def test_upsert_rejects_malformed_furnace_zone_payload_without_500(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Malformed furnace payload",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={"payload_json": {"items": [{"role": "A", "type": "MoO3", "method": "powder"}]}},
        headers=auth_headers(active_user.email),
    )
    assert precursors_response.status_code == 200

    furnace_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/furnace_program",
        json={"payload_json": {"zones": ["bad-zone"]}},
        headers=auth_headers(active_user.email),
    )

    assert furnace_response.status_code == 422
    detail = furnace_response.json()["detail"]
    assert any("zones.0" in ".".join(str(part) for part in error["loc"]) for error in detail)


def test_upsert_rejects_malformed_precursor_payload_without_500(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Malformed precursor payload",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={"payload_json": {"items": ["bad-precursor"]}},
        headers=auth_headers(active_user.email),
    )

    assert precursors_response.status_code == 422
    detail = precursors_response.json()["detail"]
    assert any("items.0" in ".".join(str(part) for part in error["loc"]) for error in detail)


def test_submit_allows_missing_gas_program(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Gas optional flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={"payload_json": {"items": [{"role": "A", "type": "MoO3", "method": "powder"}]}},
        headers=auth_headers(active_user.email),
    )
    assert precursors_response.status_code == 200
    furnace_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/furnace_program",
        json={
            "payload_json": {
                "zones": [
                    {
                        "zone_index": 1,
                        "precursor_placed": True,
                        "temperature_program": [
                            {"time_min": 0, "temperature_C": 25},
                            {"time_min": 30, "temperature_C": 750},
                        ],
                        "note": "",
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert furnace_response.status_code == 200

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 200


def test_clone_resets_observation_characterization_and_result_summary_modules(
    active_user,
    admin_user,
) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Clone module filtering",
        },
        headers=auth_headers(admin_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_required_modules(experiment_id, admin_user.email)

    process_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/process_observation",
        json={
            "payload_json": {
                "color_change": "darkened",
                "abnormal_events": ["condensate"],
            }
        },
        headers=auth_headers(admin_user.email),
    )
    assert process_response.status_code == 200

    characterization_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/characterization",
        json={
            "payload_json": {
                "methods": [
                    {
                        "method": "Raman",
                        "enabled": True,
                        "excitation_nm": 532,
                        "note": "center point",
                        "result": "peak visible",
                    }
                ],
            }
        },
        headers=auth_headers(admin_user.email),
    )
    assert characterization_response.status_code == 200
    result_summary_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/result_summary",
        json={
            "payload_json": {
                "summary_result": "continuous film",
                "quality_label": "success",
                "next_step": "repeat recipe",
            }
        },
        headers=auth_headers(admin_user.email),
    )
    assert result_summary_response.status_code == 200

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(admin_user.email),
    )
    assert submit_response.status_code == 200
    lock_response = client.post(
        f"/api/v1/experiments/{experiment_id}/lock",
        headers=auth_headers(admin_user.email),
    )
    assert lock_response.status_code == 200

    clone_response = client.post(
        f"/api/v1/experiments/{experiment_id}/clone",
        headers=auth_headers(active_user.email),
    )
    assert clone_response.status_code == 201
    clone_id = clone_response.json()["id"]

    cloned_process_response = client.get(
        f"/api/v1/experiments/{clone_id}/modules/process_observation",
        headers=auth_headers(active_user.email),
    )
    cloned_characterization_response = client.get(
        f"/api/v1/experiments/{clone_id}/modules/characterization",
        headers=auth_headers(active_user.email),
    )
    cloned_result_summary_response = client.get(
        f"/api/v1/experiments/{clone_id}/modules/result_summary",
        headers=auth_headers(active_user.email),
    )

    assert cloned_process_response.status_code == 404
    assert cloned_characterization_response.status_code == 200
    assert (
        cloned_characterization_response.json()["payload_json"]["methods"][0]["method"] == "Raman"
    )
    assert cloned_characterization_response.json()["payload_json"]["methods"][0]["note"] == (
        "center point"
    )
    assert cloned_characterization_response.json()["payload_json"]["methods"][0]["result"] == ""
    assert cloned_result_summary_response.status_code == 200
    assert cloned_result_summary_response.json()["payload_json"]["quality_label"] == "unknown"
    assert cloned_result_summary_response.json()["payload_json"]["next_step"] == ""
    assert cloned_result_summary_response.json()["payload_json"]["summary_result"] == ""


def test_invalidate_requires_reason(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Invalidate flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/invalidate",
        json={"reason": ""},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422


def test_invalidate_moves_experiment_to_invalid(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Invalidate flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/invalidate",
        json={"reason": "Contaminated substrate"},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "invalid"


def test_invalidate_rejects_locked_experiment(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Locked records are clone-only",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_required_modules(experiment_id, active_user.email)

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )
    assert submit_response.status_code == 200
    lock_response = client.post(
        f"/api/v1/experiments/{experiment_id}/lock",
        headers=auth_headers(active_user.email),
    )
    assert lock_response.status_code == 200

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/invalidate",
        json={"reason": "Do not mutate locked records"},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Locked experiments can only be cloned"


def test_invalidate_rejects_already_invalid_experiment(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Invalidate once only",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    first_response = client.post(
        f"/api/v1/experiments/{experiment_id}/invalidate",
        json={"reason": "Contaminated substrate"},
        headers=auth_headers(active_user.email),
    )
    assert first_response.status_code == 200

    second_response = client.post(
        f"/api/v1/experiments/{experiment_id}/invalidate",
        json={"reason": "Overwrite reason"},
        headers=auth_headers(active_user.email),
    )

    assert second_response.status_code == 409
    assert second_response.json()["detail"] == "Invalid experiments cannot be changed"

    detail_response = client.get(
        f"/api/v1/experiments/{experiment_id}",
        headers=auth_headers(active_user.email),
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["invalid_reason"] == "Contaminated substrate"


def test_list_experiments_hides_invalid_by_default(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Invalid hidden",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    run_code = create_response.json()["run_code"]

    invalidate_response = client.post(
        f"/api/v1/experiments/{experiment_id}/invalidate",
        json={"reason": "Bad wafer"},
        headers=auth_headers(active_user.email),
    )
    assert invalidate_response.status_code == 200

    list_response = client.get(
        "/api/v1/experiments",
        headers=auth_headers(active_user.email),
    )
    invalid_list_response = client.get(
        "/api/v1/experiments?status=invalid",
        headers=auth_headers(active_user.email),
    )

    assert list_response.status_code == 200
    assert invalid_list_response.status_code == 200
    assert run_code not in {item["run_code"] for item in list_response.json()["items"]}
    assert run_code in {item["run_code"] for item in invalid_list_response.json()["items"]}


def test_list_experiments_supports_multiple_status_filters(active_user) -> None:
    draft_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Draft source",
        },
        headers=auth_headers(active_user.email),
    )
    submitted_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-23",
            "objective": "Submitted source",
        },
        headers=auth_headers(active_user.email),
    )
    submitted_id = submitted_response.json()["id"]
    populate_required_modules(submitted_id, active_user.email)
    submit_response = client.post(
        f"/api/v1/experiments/{submitted_id}/submit",
        headers=auth_headers(active_user.email),
    )

    list_response = client.get(
        "/api/v1/experiments?mine=true&status=draft,submitted",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 200
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 2
    assert list_response.json()["page"] == 1
    assert list_response.json()["page_size"] == 20
    assert {item["status"] for item in list_response.json()["items"]} == {"draft", "submitted"}
    assert {item["run_code"] for item in list_response.json()["items"]} == {
        draft_response.json()["run_code"],
        submitted_response.json()["run_code"],
    }


def test_list_experiments_supports_material_system_and_query_filters(active_user) -> None:
    target_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoSe2",
            "experiment_date": "2026-04-23",
            "objective": "Target objective window",
        },
        headers=auth_headers(active_user.email),
    )
    other_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-22",
            "objective": "Noise objective",
        },
        headers=auth_headers(active_user.email),
    )

    material_response = client.get(
        "/api/v1/experiments?mine=true&material_system=MoSe2",
        headers=auth_headers(active_user.email),
    )
    query_response = client.get(
        "/api/v1/experiments?mine=true&q=target",
        headers=auth_headers(active_user.email),
    )

    assert other_response.status_code == 201
    assert material_response.status_code == 200
    assert query_response.status_code == 200
    assert [item["run_code"] for item in material_response.json()["items"]] == [
        target_response.json()["run_code"]
    ]
    assert [item["run_code"] for item in query_response.json()["items"]] == [
        target_response.json()["run_code"]
    ]


def test_list_experiments_rejects_invalid_status_filter(active_user) -> None:
    response = client.get(
        "/api/v1/experiments?mine=true&status=submitted,unknown",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Invalid experiment status filter"


def test_list_experiments_supports_pagination_and_reports_metadata(active_user) -> None:
    for index in range(3):
        create_response = client.post(
            "/api/v1/experiments",
            json={
                "experiment_type": "cvd_2zone",
                "material_system": f"Material-{index}",
                "experiment_date": "2026-04-23",
                "objective": f"Pagination {index}",
            },
            headers=auth_headers(active_user.email),
        )
        assert create_response.status_code == 201

    page_one_response = client.get(
        "/api/v1/experiments?mine=true&page=1&page_size=1",
        headers=auth_headers(active_user.email),
    )
    page_two_response = client.get(
        "/api/v1/experiments?mine=true&page=2&page_size=1",
        headers=auth_headers(active_user.email),
    )

    assert page_one_response.status_code == 200
    assert page_two_response.status_code == 200
    assert page_one_response.json()["total"] == 3
    assert page_one_response.json()["page"] == 1
    assert page_one_response.json()["page_size"] == 1
    assert len(page_one_response.json()["items"]) == 1
    assert len(page_two_response.json()["items"]) == 1
    assert page_two_response.json()["page"] == 2
    assert page_two_response.json()["page_size"] == 1
    assert (
        page_one_response.json()["items"][0]["run_code"]
        != page_two_response.json()["items"][0]["run_code"]
    )


def test_list_experiments_returns_latest_clone_source_first(active_user) -> None:
    submitted_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-20",
            "objective": "Older source",
        },
        headers=auth_headers(active_user.email),
    )
    submitted_id = submitted_response.json()["id"]
    populate_required_modules(submitted_id, active_user.email)
    submit_first_response = client.post(
        f"/api/v1/experiments/{submitted_id}/submit",
        headers=auth_headers(active_user.email),
    )
    time.sleep(1)

    locked_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-23",
            "objective": "Latest source",
        },
        headers=auth_headers(active_user.email),
    )
    locked_id = locked_response.json()["id"]
    populate_required_modules(locked_id, active_user.email)
    submit_second_response = client.post(
        f"/api/v1/experiments/{locked_id}/submit",
        headers=auth_headers(active_user.email),
    )
    lock_response = client.post(
        f"/api/v1/experiments/{locked_id}/lock",
        headers=auth_headers(active_user.email),
    )

    list_response = client.get(
        "/api/v1/experiments?mine=true&status=submitted,locked&page=1&page_size=1",
        headers=auth_headers(active_user.email),
    )

    assert submit_first_response.status_code == 200
    assert submit_second_response.status_code == 200
    assert lock_response.status_code == 200
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 2
    assert list_response.json()["items"][0]["run_code"] == locked_response.json()["run_code"]


def test_get_module_backfills_stage3_defaults_for_legacy_payload(active_user, db_session) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Legacy payload defaults",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = UUID(create_response.json()["id"])

    db_session.add_all(
        [
            ExperimentModulePayload(
                experiment_run_id=experiment_id,
                module_key=ExperimentModuleKey.ENVIRONMENT.value,
                payload_json={"indoor_temperature_C": 22, "sample_env": "clean"},
            ),
            ExperimentModulePayload(
                experiment_run_id=experiment_id,
                module_key=ExperimentModuleKey.PRECHECK.value,
                payload_json={"seal_intact": True, "risk_note": ""},
            ),
            ExperimentModulePayload(
                experiment_run_id=experiment_id,
                module_key=ExperimentModuleKey.PRECURSORS.value,
                payload_json={"items": [{"role": "A", "type": "MoO3", "method": "powder"}]},
            ),
            ExperimentModulePayload(
                experiment_run_id=experiment_id,
                module_key=ExperimentModuleKey.SUBSTRATES.value,
                payload_json={
                    "items": [
                        {
                            "role": "top",
                            "type": "SiO2/Si",
                            "treatment_method": "annealing",
                        }
                    ]
                },
            ),
            ExperimentModulePayload(
                experiment_run_id=experiment_id,
                module_key=ExperimentModuleKey.GAS_PROGRAM.value,
                payload_json={
                    "segments": [
                        {
                            "stage": "growth",
                            "start_min": 0,
                            "end_min": 45,
                            "gas": "Ar",
                            "flow_sccm": 80,
                        }
                    ]
                },
            ),
            ExperimentModulePayload(
                experiment_run_id=experiment_id,
                module_key=ExperimentModuleKey.CHARACTERIZATION.value,
                payload_json={"methods": [{"method": "Raman", "result": "peak"}]},
            ),
            ExperimentModulePayload(
                experiment_run_id=experiment_id,
                module_key=ExperimentModuleKey.RESULT_SUMMARY.value,
                payload_json={"summary_result": "legacy summary"},
            ),
        ]
    )
    db_session.commit()

    environment_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules/environment",
        headers=auth_headers(active_user.email),
    )
    precheck_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules/precheck",
        headers=auth_headers(active_user.email),
    )
    precursors_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        headers=auth_headers(active_user.email),
    )
    substrates_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        headers=auth_headers(active_user.email),
    )
    gas_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules/gas_program",
        headers=auth_headers(active_user.email),
    )
    characterization_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules/characterization",
        headers=auth_headers(active_user.email),
    )
    result_summary_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules/result_summary",
        headers=auth_headers(active_user.email),
    )

    assert environment_response.status_code == 200
    assert environment_response.json()["payload_json"]["indoor_humidity_percent"] is None
    assert precheck_response.status_code == 200
    assert precheck_response.json()["payload_json"]["hood_clean"] is None
    assert precheck_response.json()["payload_json"]["flange_blocked"] is None
    assert precheck_response.json()["payload_json"]["boat_contamination_level"] is None
    assert precheck_response.json()["payload_json"]["tube_contamination_level"] is None
    assert precursors_response.status_code == 200
    assert precursors_response.json()["payload_json"]["items"][0]["brand"] == ""
    assert substrates_response.status_code == 200
    assert substrates_response.json()["payload_json"]["items"][0]["treatment_params"] == {
        "temperature_C": None,
        "duration_min": None,
        "power_W": None,
        "gas": "",
    }
    assert gas_response.status_code == 200
    assert gas_response.json()["payload_json"]["segments"][0]["components"] == []
    assert gas_response.json()["payload_json"]["segments"][0]["note"] == ""
    assert characterization_response.status_code == 200
    assert characterization_response.json()["payload_json"]["methods"][0]["enabled"] is True
    assert characterization_response.json()["payload_json"]["methods"][0]["excitation_nm"] is None
    assert characterization_response.json()["payload_json"]["methods"][0]["note"] == ""
    assert result_summary_response.status_code == 200
    assert result_summary_response.json()["payload_json"]["quality_label"] == "unknown"
    assert result_summary_response.json()["payload_json"]["next_step"] == ""


def test_upsert_module_persists_stage3_fields_and_syncs_quality_label(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoSe2",
            "experiment_date": "2026-04-23",
            "objective": "Persist stage3 fields",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    environment_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/environment",
        json={
            "payload_json": {
                "indoor_temperature_C": 23.5,
                "indoor_humidity_percent": 41,
                "sample_env": "clean",
                "abnormal_note": "",
            }
        },
        headers=auth_headers(active_user.email),
    )
    precheck_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precheck",
        json={
            "payload_json": {
                "seal_intact": True,
                "risk_note": "",
                "hood_clean": True,
                "flange_blocked": False,
                "boat_contamination_level": "low",
                "tube_contamination_level": "medium",
            }
        },
        headers=auth_headers(active_user.email),
    )
    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "A",
                        "type": "MoO3",
                        "brand": "Alfa",
                        "batch_no": "MO-01",
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    substrates_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "top",
                        "type": "SiO2/Si",
                        "brand": "Brand A",
                        "treatment_method": "plasma_cleaning",
                        "treatment_params": {
                            "temperature_C": 120,
                            "duration_min": 10,
                            "power_W": 30,
                            "gas": "Ar",
                        },
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    gas_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/gas_program",
        json={
            "payload_json": {
                "segments": [
                    {
                        "stage": "growth",
                        "start_min": 0,
                        "end_min": 35,
                        "gas": "Ar",
                        "flow_sccm": 50,
                        "components": [{"name": "Ar", "fraction": 1}],
                        "note": "stable flow",
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    characterization_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/characterization",
        json={
            "payload_json": {
                "methods": [
                    {
                        "method": "Raman",
                        "enabled": False,
                        "excitation_nm": 532,
                        "note": "wafer center",
                        "result": "E2g present",
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    result_summary_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/result_summary",
        json={
            "payload_json": {
                "summary_result": "partial film",
                "quality_label": "partial",
                "next_step": "repeat under lower pressure",
            }
        },
        headers=auth_headers(active_user.email),
    )
    experiment_response = client.get(
        f"/api/v1/experiments/{experiment_id}",
        headers=auth_headers(active_user.email),
    )

    assert environment_response.status_code == 200
    assert environment_response.json()["payload_json"]["indoor_humidity_percent"] == 41
    assert precheck_response.status_code == 200
    assert precheck_response.json()["payload_json"]["tube_contamination_level"] == "medium"
    assert precursors_response.status_code == 200
    assert precursors_response.json()["payload_json"]["items"][0]["batch_no"] == "MO-01"
    assert substrates_response.status_code == 200
    assert substrates_response.json()["payload_json"]["items"][0]["treatment_params"] == {
        "temperature_C": 120,
        "duration_min": 10,
        "power_W": 30,
        "gas": "Ar",
    }
    assert gas_response.status_code == 200
    assert gas_response.json()["payload_json"]["segments"][0]["note"] == "stable flow"
    assert characterization_response.status_code == 200
    assert characterization_response.json()["payload_json"]["methods"][0]["enabled"] is False
    assert characterization_response.json()["payload_json"]["methods"][0]["excitation_nm"] == 532
    assert result_summary_response.status_code == 200
    assert result_summary_response.json()["payload_json"]["quality_label"] == "partial"
    assert result_summary_response.json()["payload_json"]["next_step"] == (
        "repeat under lower pressure"
    )
    assert experiment_response.status_code == 200
    assert experiment_response.json()["quality_label"] == "partial"


def test_clone_normalizes_legacy_payloads_before_copy(active_user, db_session) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-23",
            "objective": "Clone legacy payloads",
        },
        headers=auth_headers(active_user.email),
    )
    source_id = UUID(create_response.json()["id"])

    db_session.add_all(
        [
            ExperimentModulePayload(
                experiment_run_id=source_id,
                module_key=ExperimentModuleKey.ENVIRONMENT.value,
                payload_json={
                    "sample_env": "clean",
                    "indoor_temperature_C": 24,
                    "indoor_humidity_percent": 55,
                    "abnormal_note": "legacy issue",
                },
            ),
            ExperimentModulePayload(
                experiment_run_id=source_id,
                module_key=ExperimentModuleKey.PRECHECK.value,
                payload_json={
                    "seal_intact": False,
                    "risk_note": "legacy leak",
                    "hood_clean": True,
                    "flange_blocked": True,
                    "boat_contamination_level": "high",
                    "tube_contamination_level": "high",
                },
            ),
            ExperimentModulePayload(
                experiment_run_id=source_id,
                module_key=ExperimentModuleKey.PRECURSORS.value,
                payload_json={"items": [{"role": "A", "type": "WO3", "method": "powder"}]},
            ),
            ExperimentModulePayload(
                experiment_run_id=source_id,
                module_key=ExperimentModuleKey.SUBSTRATES.value,
                payload_json={
                    "items": [{"role": "top", "type": "SiO2/Si", "treatment_method": "annealing"}]
                },
            ),
            ExperimentModulePayload(
                experiment_run_id=source_id,
                module_key=ExperimentModuleKey.FURNACE_PROGRAM.value,
                payload_json={
                    "zones": [
                        {
                            "zone_index": 1,
                            "precursor_placed": True,
                            "temperature_program": [
                                {"time_min": 0, "temperature_C": 25},
                                {"time_min": 30, "temperature_C": 850},
                            ],
                        }
                    ]
                },
            ),
            ExperimentModulePayload(
                experiment_run_id=source_id,
                module_key=ExperimentModuleKey.GAS_PROGRAM.value,
                payload_json={
                    "segments": [
                        {
                            "stage": "growth",
                            "start_min": 0,
                            "end_min": 45,
                            "gas": "Ar",
                            "flow_sccm": 80,
                        }
                    ]
                },
            ),
        ]
    )
    db_session.commit()

    submit_response = client.post(
        f"/api/v1/experiments/{source_id}/submit",
        headers=auth_headers(active_user.email),
    )
    clone_response = client.post(
        f"/api/v1/experiments/{source_id}/clone",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 200
    assert clone_response.status_code == 201
    clone_id = clone_response.json()["id"]

    cloned_environment_response = client.get(
        f"/api/v1/experiments/{clone_id}/modules/environment",
        headers=auth_headers(active_user.email),
    )
    cloned_precursors_response = client.get(
        f"/api/v1/experiments/{clone_id}/modules/precursors",
        headers=auth_headers(active_user.email),
    )
    cloned_precheck_response = client.get(
        f"/api/v1/experiments/{clone_id}/modules/precheck",
        headers=auth_headers(active_user.email),
    )
    cloned_substrates_response = client.get(
        f"/api/v1/experiments/{clone_id}/modules/substrates",
        headers=auth_headers(active_user.email),
    )
    cloned_gas_response = client.get(
        f"/api/v1/experiments/{clone_id}/modules/gas_program",
        headers=auth_headers(active_user.email),
    )

    assert cloned_environment_response.status_code == 200
    assert cloned_environment_response.json()["payload_json"]["sample_env"] == "clean"
    assert cloned_environment_response.json()["payload_json"]["abnormal_note"] == ""
    assert "indoor_temperature_C" not in cloned_environment_response.json()["payload_json"]
    assert cloned_environment_response.json()["payload_json"]["indoor_humidity_percent"] is None
    assert cloned_precursors_response.status_code == 200
    assert cloned_precursors_response.json()["payload_json"]["items"][0]["brand"] == ""
    assert cloned_precheck_response.status_code == 200
    assert cloned_precheck_response.json()["payload_json"]["seal_intact"] is None
    assert cloned_precheck_response.json()["payload_json"]["risk_note"] == ""
    assert cloned_precheck_response.json()["payload_json"]["hood_clean"] is None
    assert cloned_precheck_response.json()["payload_json"]["flange_blocked"] is None
    assert cloned_precheck_response.json()["payload_json"]["boat_contamination_level"] is None
    assert cloned_precheck_response.json()["payload_json"]["tube_contamination_level"] is None
    assert cloned_substrates_response.status_code == 200
    assert cloned_substrates_response.json()["payload_json"]["items"][0]["treatment_params"] == {
        "temperature_C": None,
        "duration_min": None,
        "power_W": None,
        "gas": "",
    }
    assert cloned_gas_response.status_code == 200
    assert cloned_gas_response.json()["payload_json"]["segments"][0]["components"] == []
    assert cloned_gas_response.json()["payload_json"]["segments"][0]["note"] == ""


def test_clone_allows_own_submitted_experiment_and_returns_derived_run_code(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Own submitted clone",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    source_run_code = create_response.json()["run_code"]
    populate_required_modules(experiment_id, active_user.email)
    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )

    clone_response = client.post(
        f"/api/v1/experiments/{experiment_id}/clone",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 200
    assert clone_response.status_code == 201
    assert clone_response.json()["derived_from_run_code"] == source_run_code


def test_clone_rejects_other_users_submitted_experiment(active_user, admin_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-23",
            "objective": "Submitted visibility",
        },
        headers=auth_headers(admin_user.email),
    )
    source_id = create_response.json()["id"]
    populate_required_modules(source_id, admin_user.email)
    submit_response = client.post(
        f"/api/v1/experiments/{source_id}/submit",
        headers=auth_headers(admin_user.email),
    )

    clone_response = client.post(
        f"/api/v1/experiments/{source_id}/clone",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 200
    assert clone_response.status_code == 403


def test_clone_allows_other_users_locked_experiment(active_user, admin_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-23",
            "objective": "Locked visibility",
        },
        headers=auth_headers(admin_user.email),
    )
    source_id = create_response.json()["id"]
    populate_required_modules(source_id, admin_user.email)
    submit_response = client.post(
        f"/api/v1/experiments/{source_id}/submit",
        headers=auth_headers(admin_user.email),
    )
    lock_response = client.post(
        f"/api/v1/experiments/{source_id}/lock",
        headers=auth_headers(admin_user.email),
    )

    clone_response = client.post(
        f"/api/v1/experiments/{source_id}/clone",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 200
    assert lock_response.status_code == 200
    assert clone_response.status_code == 201


def test_clone_rejects_draft_and_invalid_sources(active_user) -> None:
    draft_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Draft source",
        },
        headers=auth_headers(active_user.email),
    )
    invalid_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-23",
            "objective": "Invalid source",
        },
        headers=auth_headers(active_user.email),
    )
    invalid_id = invalid_response.json()["id"]
    invalidate_response = client.post(
        f"/api/v1/experiments/{invalid_id}/invalidate",
        json={"reason": "Bad wafer"},
        headers=auth_headers(active_user.email),
    )

    draft_clone_response = client.post(
        f"/api/v1/experiments/{draft_response.json()['id']}/clone",
        headers=auth_headers(active_user.email),
    )
    invalid_clone_response = client.post(
        f"/api/v1/experiments/{invalid_id}/clone",
        headers=auth_headers(active_user.email),
    )

    assert invalidate_response.status_code == 200
    assert draft_clone_response.status_code == 409
    assert invalid_clone_response.status_code == 409
