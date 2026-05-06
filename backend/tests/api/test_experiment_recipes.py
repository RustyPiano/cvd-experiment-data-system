from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.main import app
from app.models.audit import AuditEvent
from app.models.experiment import ExperimentRun
from app.models.module_payload import ExperimentModulePayload
from app.models.recipe import Recipe
from app.models.sample import Sample

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


def create_recipe_row(
    db_session,
    *,
    created_by,
    default_payload_json: dict,
    material_system: str | None = "MoS2",
    is_active: bool = True,
) -> Recipe:
    recipe = Recipe(
        name="MoS2 recipe",
        material_system=material_system,
        default_payload_json=default_payload_json,
        description="Recipe description",
        created_by=created_by.id,
        is_active=is_active,
    )
    db_session.add(recipe)
    db_session.commit()
    db_session.refresh(recipe)
    return recipe


def allowed_recipe_payload() -> dict:
    return {
        "precursors": {
            "items": [
                {
                    "species": "MoO3",
                    "brand": "Sigma",
                    "method": "powder",
                    "batch_no": "LOT-42",
                    "mass_mg": 12.5,
                }
            ]
        },
        "substrates": {
            "items": [
                {
                    "role": "bottom",
                    "type": "sapphire",
                    "brand": "MTI",
                    "size_mm": "10x10",
                    "position_mm": 2.0,
                }
            ]
        },
        "furnace_program": {
            "furnace_info": {"zones_count": 1, "initial_temperatures_C": {"zone_1": 25}},
            "precursors": [],
            "steps": [
                {
                    "step_index": 1,
                    "step_name": "升温",
                    "duration_min": 30.0,
                    "is_hold": False,
                    "temperatures_C": {"zone_1": 750.0},
                    "note": "growth zone",
                },
            ],
        },
        "gas_program": {
            "pre_washing_gas": "Ar",
            "segments": [
                {
                    "stage": "growth",
                    "start_min": 0.0,
                    "end_min": 45.0,
                    "gas": "Ar",
                    "flow_sccm": 80.0,
                    "components": [{"name": "Ar", "fraction": 1.0, "flow_sccm": 80.0}],
                }
            ],
        },
        "characterization": {
            "methods": [{"method": "Raman", "result": "template", "enabled": True}]
        },
    }


def module_payloads_for(db_session, experiment_id: str) -> dict[str, dict]:
    db_session.expire_all()
    rows = db_session.scalars(
        select(ExperimentModulePayload).where(
            ExperimentModulePayload.experiment_run_id == UUID(experiment_id)
        )
    ).all()
    return {row.module_key: row.payload_json for row in rows}


def audit_actions_for(db_session, *, entity_type: str, entity_id: str) -> list[str]:
    db_session.expire_all()
    rows = db_session.scalars(
        select(AuditEvent)
        .where(AuditEvent.entity_type == entity_type, AuditEvent.entity_id == UUID(entity_id))
        .order_by(AuditEvent.created_at.asc())
    ).all()
    return [row.action for row in rows]


def samples_for(db_session, experiment_id: str) -> dict[str, Sample]:
    db_session.expire_all()
    rows = db_session.scalars(
        select(Sample).where(Sample.experiment_run_id == UUID(experiment_id))
    ).all()
    return {row.role: row for row in rows}


def table_count(db_session, model: type) -> int:
    db_session.expire_all()
    return db_session.scalar(select(func.count()).select_from(model)) or 0


def create_experiment(email: str, *, status_ready: bool = False) -> str:
    response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-24",
            "objective": "Save as recipe source",
        },
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    experiment_id = response.json()["id"]
    if status_ready:
        upsert_modules(experiment_id, email)
        submit_response = client.post(
            f"/api/v1/experiments/{experiment_id}/submit",
            headers=auth_headers(email),
        )
        assert submit_response.status_code == 200
    return experiment_id


def upsert_modules(experiment_id: str, email: str) -> None:
    for module_key, payload_json in allowed_recipe_payload().items():
        response = client.put(
            f"/api/v1/experiments/{experiment_id}/modules/{module_key}",
            json={"payload_json": payload_json},
            headers=auth_headers(email),
        )
        assert response.status_code == 200

    for module_key, payload_json in {
        "environment": {"sample_env": "glovebox", "abnormal_note": "do not save"},
        "precheck": {"seal_intact": True, "risk_note": "do not save"},
        "process_observation": {"color_change": "blue", "note": "do not save"},
        "result_summary": {
            "summary_result": "Successful growth",
            "quality_label": "success",
            "next_step": "do not save",
        },
    }.items():
        response = client.put(
            f"/api/v1/experiments/{experiment_id}/modules/{module_key}",
            json={"payload_json": payload_json},
            headers=auth_headers(email),
        )
        assert response.status_code == 200


def test_create_from_recipe_creates_draft_with_recipe_id_and_allowed_modules(
    active_user,
    admin_user,
    db_session,
) -> None:
    recipe_payload = {
        **allowed_recipe_payload(),
        "environment": {"sample_env": "glovebox", "abnormal_note": "do not copy"},
        "precheck": {"seal_intact": True, "risk_note": "do not copy"},
        "process_observation": {"color_change": "blue", "note": "do not copy"},
        "result_summary": {"summary_result": "success", "quality_label": "success"},
    }
    recipe = create_recipe_row(
        db_session,
        created_by=admin_user,
        default_payload_json=recipe_payload,
        material_system="MoS2",
    )

    response = client.post(
        "/api/v1/experiments/from-recipe",
        json={
            "recipe_id": str(recipe.id),
            "experiment_date": "2026-04-25",
            "objective": "Growth from recipe",
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["recipe_id"] == str(recipe.id)
    assert body["material_system"] == "MoS2"
    assert body["objective"] == "Growth from recipe"
    assert body["experiment_date"] == "2026-04-25"
    assert body["owner_id"] == str(active_user.id)

    payloads = module_payloads_for(db_session, body["id"])
    assert set(payloads) == {
        "basic_info",
        "characterization",
        "furnace_program",
        "gas_program",
        "precursors",
        "substrates",
    }
    assert payloads["basic_info"] == {
        "operator_id": str(active_user.id),
        "experiment_type": "cvd_2zone",
        "material_system": "MoS2",
        "experiment_date": "2026-04-25",
        "objective": "Growth from recipe",
    }
    assert payloads["precursors"]["items"][0]["species"] == "MoO3"
    assert payloads["substrates"]["items"][0]["type"] == "sapphire"
    assert payloads["furnace_program"]["steps"][0]["temperatures_C"]["zone_1"] == 750.0
    assert payloads["gas_program"]["segments"][0]["flow_sccm"] == 80.0
    assert payloads["characterization"]["methods"][0]["method"] == "Raman"
    assert audit_actions_for(
        db_session,
        entity_type="experiment_run",
        entity_id=body["id"],
    ) == ["create_from_recipe"]


def test_create_from_recipe_syncs_substrate_samples(
    active_user,
    admin_user,
    db_session,
) -> None:
    recipe_payload = allowed_recipe_payload()
    recipe_payload["substrates"] = {
        "items": [
            {
                "role": "top",
                "type": "SiO2/Si",
                "brand": "Brand A",
                "size_mm": "5x10",
                "treatment_method": "plasma_cleaning",
                "position_mm": 1.0,
            },
            {
                "role": "bottom",
                "type": "sapphire",
                "brand": "Brand B",
                "size_mm": "10x10",
                "treatment_method": "annealing",
                "position_mm": -1.0,
            },
        ]
    }
    recipe = create_recipe_row(
        db_session,
        created_by=admin_user,
        default_payload_json=recipe_payload,
    )

    response = client.post(
        "/api/v1/experiments/from-recipe",
        json={"recipe_id": str(recipe.id), "experiment_date": "2026-04-25"},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 201
    samples = samples_for(db_session, response.json()["id"])
    assert set(samples) == {"top", "bottom"}
    assert samples["top"].sample_code.endswith("-TOP")
    assert samples["top"].substrate_type == "SiO2/Si"
    assert samples["top"].metadata_json["source_module"] == "substrates"
    assert samples["bottom"].sample_code.endswith("-BOTTOM")
    assert samples["bottom"].brand == "Brand B"


def test_create_from_recipe_rejects_duplicate_substrate_roles_without_partial_commit(
    active_user,
    admin_user,
    db_session,
) -> None:
    recipe_payload = allowed_recipe_payload()
    recipe_payload["substrates"] = {
        "items": [
            {"role": "top", "type": "SiO2/Si"},
            {"role": "top", "type": "sapphire"},
        ]
    }
    recipe = create_recipe_row(
        db_session,
        created_by=admin_user,
        default_payload_json=recipe_payload,
    )
    before_experiments = table_count(db_session, ExperimentRun)
    before_modules = table_count(db_session, ExperimentModulePayload)
    before_samples = table_count(db_session, Sample)
    before_audit_events = table_count(db_session, AuditEvent)

    response = client.post(
        "/api/v1/experiments/from-recipe",
        json={"recipe_id": str(recipe.id), "experiment_date": "2026-04-25"},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Duplicate substrate role in payload"
    assert table_count(db_session, ExperimentRun) == before_experiments
    assert table_count(db_session, ExperimentModulePayload) == before_modules
    assert table_count(db_session, Sample) == before_samples
    assert table_count(db_session, AuditEvent) == before_audit_events


def test_create_from_recipe_rejects_malformed_allowed_module_without_partial_commit(
    active_user,
    admin_user,
    db_session,
) -> None:
    recipe_payload = {
        **allowed_recipe_payload(),
        "precursors": [],
    }
    recipe = create_recipe_row(
        db_session,
        created_by=admin_user,
        default_payload_json=recipe_payload,
    )
    before_experiments = table_count(db_session, ExperimentRun)
    before_modules = table_count(db_session, ExperimentModulePayload)
    before_samples = table_count(db_session, Sample)
    before_audit_events = table_count(db_session, AuditEvent)

    response = client.post(
        "/api/v1/experiments/from-recipe",
        json={"recipe_id": str(recipe.id), "experiment_date": "2026-04-25"},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Recipe module payload for precursors must be an object"
    assert table_count(db_session, ExperimentRun) == before_experiments
    assert table_count(db_session, ExperimentModulePayload) == before_modules
    assert table_count(db_session, Sample) == before_samples
    assert table_count(db_session, AuditEvent) == before_audit_events


def test_create_from_recipe_rejects_missing_inactive_and_viewer(
    active_user,
    admin_user,
    viewer_user,
    db_session,
) -> None:
    inactive_recipe = create_recipe_row(
        db_session,
        created_by=admin_user,
        default_payload_json={},
        is_active=False,
    )

    missing_response = client.post(
        "/api/v1/experiments/from-recipe",
        json={"recipe_id": str(uuid4())},
        headers=auth_headers(active_user.email),
    )
    inactive_response = client.post(
        "/api/v1/experiments/from-recipe",
        json={"recipe_id": str(inactive_recipe.id)},
        headers=auth_headers(active_user.email),
    )
    viewer_response = client.post(
        "/api/v1/experiments/from-recipe",
        json={"recipe_id": str(inactive_recipe.id)},
        headers=auth_headers(viewer_user.email),
    )

    assert missing_response.status_code == 404
    assert inactive_response.status_code == 404
    assert viewer_response.status_code == 403


def test_save_submitted_experiment_as_recipe_extracts_allowed_modules_and_sanitizes_precursors(
    active_user,
    db_session,
) -> None:
    experiment_id = create_experiment(active_user.email, status_ready=True)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/save-as-recipe",
        json={"name": "Saved WS2 recipe", "description": "Reusable process"},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Saved WS2 recipe"
    assert body["description"] == "Reusable process"
    assert body["material_system"] == "WS2"
    assert body["created_by"] == str(active_user.id)
    assert body["is_active"] is True
    assert set(body["default_payload_json"]) == {
        "characterization",
        "furnace_program",
        "gas_program",
        "precursors",
        "substrates",
    }
    precursor = body["default_payload_json"]["precursors"]["items"][0]
    assert precursor["species"] == "MoO3"
    assert precursor["batch_no"] == ""
    assert precursor["mass_mg"] is None
    assert "environment" not in body["default_payload_json"]
    assert "precheck" not in body["default_payload_json"]
    assert "process_observation" not in body["default_payload_json"]
    assert "result_summary" not in body["default_payload_json"]

    assert "create" in audit_actions_for(
        db_session,
        entity_type="recipe",
        entity_id=body["id"],
    )
    assert "save_as_recipe" in audit_actions_for(
        db_session,
        entity_type="experiment_run",
        entity_id=experiment_id,
    )


def test_save_as_recipe_rejects_draft_and_viewer(
    active_user,
    viewer_user,
) -> None:
    draft_experiment_id = create_experiment(active_user.email)
    submitted_experiment_id = create_experiment(active_user.email, status_ready=True)

    draft_response = client.post(
        f"/api/v1/experiments/{draft_experiment_id}/save-as-recipe",
        json={"name": "Draft recipe"},
        headers=auth_headers(active_user.email),
    )
    viewer_response = client.post(
        f"/api/v1/experiments/{submitted_experiment_id}/save-as-recipe",
        json={"name": "Viewer recipe"},
        headers=auth_headers(viewer_user.email),
    )

    assert draft_response.status_code == 409
    assert viewer_response.status_code == 403
