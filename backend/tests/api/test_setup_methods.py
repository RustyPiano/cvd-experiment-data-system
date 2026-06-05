from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def login(email: str, password: str = "Password123!") -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {login(email)}"}


def create_experiment(email: str) -> str:
    response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-06-05",
            "objective": "setup methods API",
        },
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    return response.json()["id"]


def upload_setup_diagram(experiment_id: str, email: str) -> str:
    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        files={"file": ("setup.png", b"diagram", "image/png")},
        data={"asset_role": "setup_diagram", "file_category": "raw"},
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_upsert_setup_methods_creates_snapshot(active_user) -> None:
    experiment_id = create_experiment(active_user.email)
    diagram_id = upload_setup_diagram(experiment_id, active_user.email)

    response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "Manual setup",
            "apparatus_description_snapshot": "Tube furnace",
            "methods_text_snapshot": "Methods text",
            "sample_placement_description_snapshot": "Substrate downstream",
            "reaction_flow_description_snapshot": "Purge ramp hold cool",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": diagram_id,
            "is_same_as_template": False,
            "semantic_context": {"temperature_reference": "setpoint"},
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["warnings"] == []
    assert body["data"]["setup_name_snapshot"] == "Manual setup"
    assert body["data"]["setup_key_snapshot"].startswith("manual:")
    assert body["data"]["semantic_context"] == {"temperature_reference": "setpoint"}
    assert body["data"]["confirmed_at"] is None

    get_response = client.get(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        headers=auth_headers(active_user.email),
    )
    assert get_response.status_code == 200
    assert get_response.json()["semantic_context"] == {"temperature_reference": "setpoint"}


def test_upsert_setup_methods_allows_incomplete_draft_autosave(active_user) -> None:
    experiment_id = create_experiment(active_user.email)

    response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "",
            "apparatus_description_snapshot": "",
            "methods_text_snapshot": "",
            "sample_placement_description_snapshot": "",
            "reaction_flow_description_snapshot": "",
            "reference_paper_url_snapshot": None,
            "unpublished_reason_snapshot": None,
            "diagram_file_asset_id": None,
            "is_same_as_template": False,
            "semantic_context": {},
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["data"]["confirmed_at"] is None


def test_confirm_setup_methods_sets_confirmation(active_user) -> None:
    experiment_id = create_experiment(active_user.email)
    diagram_id = upload_setup_diagram(experiment_id, active_user.email)
    client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "Manual setup",
            "apparatus_description_snapshot": "Tube furnace",
            "methods_text_snapshot": "Methods text",
            "sample_placement_description_snapshot": "Substrate downstream",
            "reaction_flow_description_snapshot": "Purge ramp hold cool",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": diagram_id,
            "is_same_as_template": False,
        },
        headers=auth_headers(active_user.email),
    )

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/confirm",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["data"]["confirmed_by_id"] is not None
    assert response.json()["warnings"] == []


def test_confirm_setup_methods_rejects_incomplete_snapshot(active_user) -> None:
    experiment_id = create_experiment(active_user.email)
    upsert_response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "Manual setup",
            "apparatus_description_snapshot": "Tube furnace",
            "methods_text_snapshot": "Methods text",
            "sample_placement_description_snapshot": "Substrate downstream",
            "reaction_flow_description_snapshot": "Purge ramp hold cool",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": None,
            "is_same_as_template": False,
        },
        headers=auth_headers(active_user.email),
    )
    assert upsert_response.status_code == 200

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/confirm",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422
    assert response.json()["errors"] == [
        {
            "module_key": "setup_methods",
            "field_path": "diagram_file_asset_id",
            "message": "Setup diagram is required",
        }
    ]
    get_response = client.get(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        headers=auth_headers(active_user.email),
    )
    assert get_response.status_code == 200
    assert get_response.json()["confirmed_at"] is None


def test_create_setup_methods_from_template_writes_template_snapshot(active_user) -> None:
    experiment_id = create_experiment(active_user.email)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/from-template",
        json={"template_key": "group_fast_cvd", "template_version": 1},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["warnings"] == []
    assert body["data"]["source_template_key"] == "group_fast_cvd"
    assert body["data"]["source_template_version"] == 1
    assert body["data"]["setup_key_snapshot"] == "group_fast_cvd"
    assert body["data"]["setup_version_snapshot"] == 1
    assert body["data"]["snapshot_hash"]
    assert body["data"]["confirmed_at"] is None
    assert body["data"]["semantic_context"] == {"temperature_reference": "furnace program setpoint"}


def test_template_core_field_change_auto_marks_deviation_and_blocks_confirm(active_user) -> None:
    experiment_id = create_experiment(active_user.email)
    template_response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/from-template",
        json={"template_key": "group_fast_cvd", "template_version": 1},
        headers=auth_headers(active_user.email),
    )
    assert template_response.status_code == 200
    original = template_response.json()["data"]

    update_response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": original["setup_name_snapshot"],
            "institution_snapshot": original["institution_snapshot"],
            "apparatus_description_snapshot": original["apparatus_description_snapshot"],
            "methods_text_snapshot": "Changed methods text",
            "sample_placement_description_snapshot": original[
                "sample_placement_description_snapshot"
            ],
            "reaction_flow_description_snapshot": original["reaction_flow_description_snapshot"],
            "reference_paper_url_snapshot": original["reference_paper_url_snapshot"],
            "unpublished_reason_snapshot": original["unpublished_reason_snapshot"],
            "diagram_file_asset_id": original["diagram_file_asset_id"],
            "is_same_as_template": True,
            "deviation_note": "",
            "semantic_context": original["semantic_context"],
        },
        headers=auth_headers(active_user.email),
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["is_same_as_template"] is False

    confirm_response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/confirm",
        headers=auth_headers(active_user.email),
    )

    assert confirm_response.status_code == 422
    assert {
        "module_key": "setup_methods",
        "field_path": "deviation_note",
        "message": "Deviation note is required when setup differs from template",
    } in confirm_response.json()["errors"]


def test_from_template_warning_response_uses_validation_issue_shape(
    active_user,
    monkeypatch,
) -> None:
    from app.schemas.experiment_validation import ExperimentValidationIssue
    from app.schemas.setup_methods import SetupMethodTemplateRead
    from app.services.setup_method_template_service import SetupMethodTemplateService
    from app.services.setup_methods_service import SetupMethodsService

    def fake_get_template(self, template_key, template_version=None):
        return SetupMethodTemplateRead(
            template_key="group_fast_cvd",
            template_version=1,
            name="组内快速 CVD",
            institution="group",
            apparatus_description="Two-zone tube furnace CVD setup used by the group.",
            methods_text="Template methods",
            sample_placement_description="Template placement",
            reaction_flow_description="Template flow",
            unpublished_reason="Internal group setup template",
            semantic_context={"temperature_reference": "furnace program setpoint"},
            has_packaged_diagram=True,
        )

    def fake_materialize_diagram(self, experiment, template, current_user):
        return None, ExperimentValidationIssue(
            module_key="setup_methods",
            field_path="diagram_file_asset_id",
            message="Setup diagram could not be materialized from template",
        )

    monkeypatch.setattr(SetupMethodTemplateService, "get_template", fake_get_template)
    monkeypatch.setattr(
        SetupMethodsService,
        "_materialize_template_diagram",
        fake_materialize_diagram,
    )
    experiment_id = create_experiment(active_user.email)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/from-template",
        json={"template_key": "group_fast_cvd", "template_version": 1},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["warnings"] == [
        {
            "module_key": "setup_methods",
            "field_path": "diagram_file_asset_id",
            "message": "Setup diagram could not be materialized from template",
        }
    ]


def test_setup_diagram_must_belong_to_same_experiment(active_user) -> None:
    first_id = create_experiment(active_user.email)
    second_id = create_experiment(active_user.email)
    diagram_id = upload_setup_diagram(first_id, active_user.email)

    response = client.put(
        f"/api/v1/experiments/{second_id}/setup-methods",
        json={
            "setup_name_snapshot": "Manual setup",
            "apparatus_description_snapshot": "Tube furnace",
            "methods_text_snapshot": "Methods text",
            "sample_placement_description_snapshot": "Substrate downstream",
            "reaction_flow_description_snapshot": "Purge ramp hold cool",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": diagram_id,
            "is_same_as_template": False,
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422


def test_delete_referenced_setup_diagram_is_blocked(active_user) -> None:
    experiment_id = create_experiment(active_user.email)
    diagram_id = upload_setup_diagram(experiment_id, active_user.email)
    upsert_response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "Manual setup",
            "apparatus_description_snapshot": "Tube furnace",
            "methods_text_snapshot": "Methods text",
            "sample_placement_description_snapshot": "Substrate downstream",
            "reaction_flow_description_snapshot": "Purge ramp hold cool",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": diagram_id,
            "is_same_as_template": False,
        },
        headers=auth_headers(active_user.email),
    )
    assert upsert_response.status_code == 200

    response = client.delete(
        f"/api/v1/files/{diagram_id}",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Setup diagram is referenced by setup methods"
