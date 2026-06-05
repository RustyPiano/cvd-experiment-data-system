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


def test_manual_setup_ignores_template_identity_flag(active_user) -> None:
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
            "is_same_as_template": True,
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["data"]["source_template_key"] is None
    assert response.json()["data"]["is_same_as_template"] is False


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


def test_confirm_setup_methods_rejects_stale_diagram_asset(active_user, db_session) -> None:
    from uuid import UUID

    from app.models.file_asset import FileAsset

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
    diagram = db_session.get(FileAsset, UUID(diagram_id))
    assert diagram is not None
    diagram.asset_role = "characterization_file"
    db_session.add(diagram)
    db_session.commit()

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/confirm",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422
    assert any(
        issue["module_key"] == "setup_methods" and issue["field_path"] == "diagram_file_asset_id"
        for issue in response.json()["errors"]
    )


def test_idempotent_upsert_preserves_confirmation(active_user) -> None:
    experiment_id = create_experiment(active_user.email)
    diagram_id = upload_setup_diagram(experiment_id, active_user.email)
    payload = {
        "setup_name_snapshot": "Manual setup",
        "apparatus_description_snapshot": "Tube furnace",
        "methods_text_snapshot": "Methods text",
        "sample_placement_description_snapshot": "Substrate downstream",
        "reaction_flow_description_snapshot": "Purge ramp hold cool",
        "unpublished_reason_snapshot": "Internal",
        "diagram_file_asset_id": diagram_id,
        "is_same_as_template": False,
        "semantic_context": {"temperature_reference": "setpoint"},
    }
    headers = auth_headers(active_user.email)

    upsert_response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json=payload,
        headers=headers,
    )
    assert upsert_response.status_code == 200
    confirm_response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/confirm",
        headers=headers,
    )
    assert confirm_response.status_code == 200
    confirmed_snapshot = confirm_response.json()["data"]

    response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json=payload,
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["data"]["confirmed_by_id"] == confirmed_snapshot["confirmed_by_id"]
    assert response.json()["data"]["confirmed_at"] == confirmed_snapshot["confirmed_at"]


def test_experiment_audit_endpoint_includes_setup_method_events(active_user) -> None:
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
    confirm_response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/confirm",
        headers=auth_headers(active_user.email),
    )
    assert confirm_response.status_code == 200
    setup_id = confirm_response.json()["data"]["id"]

    response = client.get(
        f"/api/v1/experiments/{experiment_id}/audit-events",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    setup_events = [
        item
        for item in response.json()["items"]
        if item["entity_type"] == "experiment_setup_snapshot"
    ]
    assert [item["action"] for item in setup_events] == ["upsert", "confirm"]
    assert {item["entity_id"] for item in setup_events} == {setup_id}


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


def test_confirm_setup_methods_allows_missing_apparatus_description(active_user) -> None:
    # Apparatus prose is an optional enrichment; the diagram is the required field.
    experiment_id = create_experiment(active_user.email)
    diagram_id = upload_setup_diagram(experiment_id, active_user.email)
    upsert_response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "Manual setup",
            "apparatus_description_snapshot": "",
            "methods_text_snapshot": "Methods text",
            "sample_placement_description_snapshot": "",
            "reaction_flow_description_snapshot": "",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": diagram_id,
            "is_same_as_template": False,
        },
        headers=auth_headers(active_user.email),
    )
    assert upsert_response.status_code == 200

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/confirm",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["data"]["confirmed_by_id"] is not None


def test_create_setup_methods_from_library_freezes_content_and_diagram(active_user) -> None:
    headers = auth_headers(active_user.email)
    entry = client.post(
        "/api/v1/setup-library",
        json={
            "name": "Two-zone fast CVD",
            "apparatus_description": "Two-zone tube furnace",
            "methods_text": "Purge, ramp, hold, cool",
            "reference_paper_url": "https://example.com/paper",
        },
        headers=headers,
    ).json()
    client.post(
        f"/api/v1/setup-library/{entry['id']}/diagram",
        files={"file": ("apparatus.png", b"PNGDATA", "image/png")},
        headers=headers,
    )

    experiment_id = create_experiment(active_user.email)
    response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/from-library",
        json={"setup_library_id": entry["id"]},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert response.json()["warnings"] == []
    assert data["source_setup_library_id"] == entry["id"]
    assert data["setup_name_snapshot"] == "Two-zone fast CVD"
    assert data["methods_text_snapshot"] == "Purge, ramp, hold, cool"
    assert data["is_same_as_template"] is True
    assert data["diagram_file_asset_id"] is not None

    # The frozen diagram is a per-experiment setup_diagram file that submit accepts.
    files = client.get(
        f"/api/v1/files?experiment_id={experiment_id}&asset_role=setup_diagram",
        headers=headers,
    ).json()
    assert any(item["id"] == data["diagram_file_asset_id"] for item in files["items"])


def test_create_setup_methods_from_library_without_diagram_warns(active_user) -> None:
    headers = auth_headers(active_user.email)
    entry = client.post(
        "/api/v1/setup-library",
        json={"name": "No diagram setup", "methods_text": "m", "unpublished_reason": "wip"},
        headers=headers,
    ).json()

    experiment_id = create_experiment(active_user.email)
    response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/from-library",
        json={"setup_library_id": entry["id"]},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["data"]["diagram_file_asset_id"] is None
    assert any(
        issue["field_path"] == "diagram_file_asset_id" for issue in response.json()["warnings"]
    )


def test_from_library_twice_replaces_diagram_without_orphans(active_user) -> None:
    headers = auth_headers(active_user.email)

    def make_entry_with_diagram(name: str) -> str:
        entry = client.post(
            "/api/v1/setup-library",
            json={"name": name, "methods_text": "m", "unpublished_reason": "wip"},
            headers=headers,
        ).json()
        client.post(
            f"/api/v1/setup-library/{entry['id']}/diagram",
            files={"file": (f"{name}.png", name.encode(), "image/png")},
            headers=headers,
        )
        return entry["id"]

    entry1 = make_entry_with_diagram("first")
    entry2 = make_entry_with_diagram("second")
    experiment_id = create_experiment(active_user.email)

    first = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/from-library",
        json={"setup_library_id": entry1},
        headers=headers,
    ).json()["data"]
    second = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/from-library",
        json={"setup_library_id": entry2},
        headers=headers,
    ).json()["data"]

    assert first["diagram_file_asset_id"] != second["diagram_file_asset_id"]

    # The first copy is soft-deleted: exactly one active setup_diagram file remains.
    files = client.get(
        f"/api/v1/files?experiment_id={experiment_id}&asset_role=setup_diagram",
        headers=headers,
    ).json()
    active_ids = [item["id"] for item in files["items"]]
    assert active_ids == [second["diagram_file_asset_id"]]


def test_upsert_after_from_library_preserves_provenance_on_deviation(active_user) -> None:
    """Recording a deviation goes through the full-payload PUT upsert; the library
    provenance and the user-set is_same_as_template flag must survive the round-trip."""
    headers = auth_headers(active_user.email)
    entry = client.post(
        "/api/v1/setup-library",
        json={
            "name": "Two-zone fast CVD",
            "apparatus_description": "Two-zone tube furnace",
            "methods_text": "Purge, ramp, hold, cool",
            "reference_paper_url": "https://example.com/paper",
        },
        headers=headers,
    ).json()
    client.post(
        f"/api/v1/setup-library/{entry['id']}/diagram",
        files={"file": ("apparatus.png", b"PNGDATA", "image/png")},
        headers=headers,
    )

    experiment_id = create_experiment(active_user.email)
    frozen = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/from-library",
        json={"setup_library_id": entry["id"]},
        headers=headers,
    ).json()["data"]

    # Mirror the frontend's toSetupMethodsPayload: resend the frozen content while
    # toggling the deviation (is_same_as_template -> False) and adding a note.
    response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": frozen["setup_name_snapshot"],
            "institution_snapshot": frozen["institution_snapshot"],
            "apparatus_description_snapshot": frozen["apparatus_description_snapshot"],
            "methods_text_snapshot": frozen["methods_text_snapshot"],
            "sample_placement_description_snapshot": frozen[
                "sample_placement_description_snapshot"
            ],
            "reaction_flow_description_snapshot": frozen["reaction_flow_description_snapshot"],
            "reference_paper_url_snapshot": frozen["reference_paper_url_snapshot"],
            "unpublished_reason_snapshot": frozen["unpublished_reason_snapshot"],
            "diagram_file_asset_id": frozen["diagram_file_asset_id"],
            "is_same_as_template": False,
            "deviation_note": "Raised hold temperature by 20C this run",
            "semantic_context": {},
            "source_setup_library_id": entry["id"],
            "setup_key_snapshot": frozen["setup_key_snapshot"],
        },
        headers=headers,
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["source_setup_library_id"] == entry["id"]
    assert data["is_same_as_template"] is False
    assert data["deviation_note"] == "Raised hold temperature by 20C this run"
    # Content stays intact — the read-only preview must not be blanked by the upsert.
    assert data["methods_text_snapshot"] == "Purge, ramp, hold, cool"
    assert data["diagram_file_asset_id"] == frozen["diagram_file_asset_id"]


def test_clone_snapshot_preserves_library_provenance(active_user, db_session) -> None:
    import uuid
    from datetime import date

    from app.models.experiment import ExperimentRun
    from app.models.setup_methods import ExperimentSetupSnapshot
    from app.services.setup_methods_service import SetupMethodsService

    def make_experiment(run_code: str) -> ExperimentRun:
        experiment = ExperimentRun(
            run_code=run_code,
            owner_id=active_user.id,
            experiment_type="cvd_2zone",
            material_system="MoS2",
            experiment_date=date(2026, 6, 5),
            objective="clone provenance",
        )
        db_session.add(experiment)
        db_session.commit()
        db_session.refresh(experiment)
        return experiment

    source = make_experiment("CVD-2026-CLONE-SRC")
    target = make_experiment("CVD-2026-CLONE-DST")
    library_id = uuid.uuid4()
    db_session.add(
        ExperimentSetupSnapshot(
            experiment_run_id=source.id,
            source_setup_library_id=library_id,
            setup_key_snapshot="manual:abcdef1234567890",
            setup_name_snapshot="Referenced setup",
            setup_version_snapshot=1,
            apparatus_description_snapshot="",
            methods_text_snapshot="Methods",
            sample_placement_description_snapshot="",
            reaction_flow_description_snapshot="",
            unpublished_reason_snapshot="Internal",
            diagram_file_asset_id=None,
            is_same_as_template=True,
            snapshot_hash="a" * 64,
            metadata_json={"semantic_context": {}},
        )
    )
    db_session.commit()

    cloned = SetupMethodsService(db_session).clone_snapshot(
        source_experiment=source,
        target_experiment=target,
        current_user=active_user,
    )
    db_session.commit()

    assert cloned is not None
    assert cloned.source_setup_library_id == library_id


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
        "message": "Deviation note is required when setup differs from the referenced setup",
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
