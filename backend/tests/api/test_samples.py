from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models.audit import AuditEvent
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


def populate_required_modules(experiment_id: str, email: str) -> None:
    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={"payload_json": {"items": [{"species": "MoO3", "method": "powder"}]}},
        headers=auth_headers(email),
    )
    assert precursors_response.status_code == 200

    furnace_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/furnace_program",
        json={
            "payload_json": {
                "furnace_info": {"zones_count": 1, "initial_temperatures_C": {"zone_1": 25}},
                "precursors": [],
                "steps": [
                    {
                        "step_index": 1,
                        "step_name": "升温",
                        "duration_min": 30,
                        "is_hold": False,
                        "temperatures_C": {"zone_1": 750},
                        "note": "",
                    },
                ],
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
                        "components": [{"name": "Ar", "fraction": 1, "flow_sccm": 80}],
                        "flow_sccm": 80,
                    }
                ],
            }
        },
        headers=auth_headers(email),
    )
    assert gas_response.status_code == 200


def populate_substrates_module(experiment_id: str, email: str) -> None:
    response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "top",
                        "type": "SiO2/Si",
                        "brand": "Brand A",
                        "size_mm": "5x10",
                        "treatment_method": "plasma_cleaning",
                        "position_mm": 1,
                    },
                    {
                        "role": "bottom",
                        "type": "SiO2/Si",
                        "brand": "Brand B",
                        "size_mm": "5x10",
                        "treatment_method": "plasma_cleaning",
                        "position_mm": -1,
                    },
                ]
            }
        },
        headers=auth_headers(email),
    )
    assert response.status_code == 200


def test_substrates_module_syncs_top_and_bottom_samples(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Sample sync flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    populate_substrates_module(experiment_id, active_user.email)

    list_response = client.get(
        f"/api/v1/samples?experiment_id={experiment_id}",
        headers=auth_headers(active_user.email),
    )

    assert list_response.status_code == 200
    body = list_response.json()
    assert body["total"] == 2
    roles = {item["role"]: item for item in body["items"]}
    assert roles["top"]["sample_code"].endswith("-TOP")
    assert roles["top"]["substrate_type"] == "SiO2/Si"
    assert roles["bottom"]["sample_code"].endswith("-BOTTOM")
    assert roles["bottom"]["brand"] == "Brand B"


def test_substrates_module_syncs_empty_relative_position_as_null(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Relative position none flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "top",
                        "type": "硅片单抛N<100>",
                        "brand": "华赫硅材料",
                        "size_mm": "5x10",
                        "treatment_method": "none",
                        "position_mm": None,
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert response.status_code == 200

    list_response = client.get(
        f"/api/v1/samples?experiment_id={experiment_id}&role=top",
        headers=auth_headers(active_user.email),
    )

    assert list_response.status_code == 200
    assert list_response.json()["items"][0]["position_mm"] is None


def test_substrates_module_removes_deleted_bottom_sample(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Sample removal flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_substrates_module(experiment_id, active_user.email)

    update_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "top",
                        "type": "SiO2/Si",
                        "brand": "Brand A",
                        "size_mm": "5x10",
                        "treatment_method": "plasma_cleaning",
                        "position_mm": 1,
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert update_response.status_code == 200

    list_response = client.get(
        f"/api/v1/samples?experiment_id={experiment_id}",
        headers=auth_headers(active_user.email),
    )

    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1
    assert list_response.json()["items"][0]["role"] == "top"


def test_substrate_sync_soft_deletes_removed_samples(active_user, db_session) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Sample retention flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_substrates_module(experiment_id, active_user.email)

    initial_list_response = client.get(
        f"/api/v1/samples?experiment_id={experiment_id}",
        headers=auth_headers(active_user.email),
    )
    assert initial_list_response.status_code == 200
    bottom_sample = next(
        item for item in initial_list_response.json()["items"] if item["role"] == "bottom"
    )

    update_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "top",
                        "type": "SiO2/Si",
                        "brand": "Brand A",
                        "size_mm": "5x10",
                        "treatment_method": "plasma_cleaning",
                        "position_mm": 1,
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert update_response.status_code == 200

    list_response = client.get(
        f"/api/v1/samples?experiment_id={experiment_id}",
        headers=auth_headers(active_user.email),
    )
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1
    assert list_response.json()["items"][0]["role"] == "top"

    db_session.expire_all()
    retained_sample = db_session.get(Sample, UUID(bottom_sample["id"]))
    assert retained_sample is not None
    assert retained_sample.deleted_at is not None
    assert retained_sample.deleted_by_id == active_user.id

    audit_event = db_session.scalar(
        select(AuditEvent)
        .where(
            AuditEvent.entity_type == "sample",
            AuditEvent.entity_id == retained_sample.id,
            AuditEvent.reason == "substrates_sync_removed",
        )
        .order_by(AuditEvent.created_at.desc())
    )
    assert audit_event is not None
    assert audit_event.action == "soft_delete"
    assert audit_event.before_json["deleted_at"] is None
    assert audit_event.after_json["deleted_at"] is not None
    assert audit_event.after_json["deleted_by_id"] == str(active_user.id)


def test_substrate_sync_restores_soft_deleted_sample_when_role_returns(
    active_user,
    db_session,
) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Sample restore flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_substrates_module(experiment_id, active_user.email)

    initial_list_response = client.get(
        f"/api/v1/samples?experiment_id={experiment_id}",
        headers=auth_headers(active_user.email),
    )
    bottom_sample = next(
        item for item in initial_list_response.json()["items"] if item["role"] == "bottom"
    )

    remove_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "top",
                        "type": "SiO2/Si",
                        "brand": "Brand A",
                        "size_mm": "5x10",
                        "treatment_method": "plasma_cleaning",
                        "position_mm": 1,
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert remove_response.status_code == 200

    restore_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "top",
                        "type": "SiO2/Si",
                        "brand": "Brand A",
                        "size_mm": "5x10",
                        "treatment_method": "plasma_cleaning",
                        "position_mm": 1,
                    },
                    {
                        "role": "bottom",
                        "type": "Quartz",
                        "brand": "Brand C",
                        "size_mm": "10x10",
                        "treatment_method": "annealing",
                        "position_mm": -2,
                    },
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert restore_response.status_code == 200

    restored_list_response = client.get(
        f"/api/v1/samples?experiment_id={experiment_id}",
        headers=auth_headers(active_user.email),
    )
    restored_bottom = next(
        item for item in restored_list_response.json()["items"] if item["role"] == "bottom"
    )
    assert restored_bottom["id"] == bottom_sample["id"]
    assert restored_bottom["brand"] == "Brand C"

    db_session.expire_all()
    retained_sample = db_session.get(Sample, UUID(bottom_sample["id"]))
    assert retained_sample is not None
    assert retained_sample.deleted_at is None
    assert retained_sample.deleted_by_id is None


def test_manual_top_bottom_create_restores_soft_deleted_sample(active_user, db_session) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Manual sample restore flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_substrates_module(experiment_id, active_user.email)

    initial_list_response = client.get(
        f"/api/v1/samples?experiment_id={experiment_id}",
        headers=auth_headers(active_user.email),
    )
    bottom_sample = next(
        item for item in initial_list_response.json()["items"] if item["role"] == "bottom"
    )

    remove_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "top",
                        "type": "SiO2/Si",
                        "brand": "Brand A",
                        "size_mm": "5x10",
                        "treatment_method": "plasma_cleaning",
                        "position_mm": 1,
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert remove_response.status_code == 200

    restore_response = client.post(
        f"/api/v1/experiments/{experiment_id}/samples",
        json={
            "role": "bottom",
            "substrate_type": "Quartz",
            "brand": "Brand Manual",
            "size_mm": "10x10",
            "treatment": "annealing",
            "position_mm": -2,
            "storage_location": "drawer-restored",
            "metadata_json": {"quality": "restored"},
        },
        headers=auth_headers(active_user.email),
    )

    assert restore_response.status_code == 201
    assert restore_response.json()["id"] == bottom_sample["id"]
    assert restore_response.json()["brand"] == "Brand Manual"
    assert restore_response.json()["deleted_at"] is None
    assert restore_response.json()["is_deleted"] is False

    db_session.expire_all()
    retained_sample = db_session.get(Sample, UUID(bottom_sample["id"]))
    assert retained_sample is not None
    assert retained_sample.deleted_at is None
    assert retained_sample.deleted_by_id is None


def test_substrates_module_rejects_duplicate_roles(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Duplicate substrate roles",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {"role": "top", "type": "SiO2/Si"},
                    {"role": "top", "type": "Quartz"},
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Duplicate substrate role in payload"


def test_substrates_module_rejects_invalid_position_value(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Invalid substrate position",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "top",
                        "type": "SiO2/Si",
                        "brand": "Brand A",
                        "size_mm": "5x10",
                        "treatment_method": "plasma_cleaning",
                        "position_mm": "bad-position",
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any(
        "items.0.position_mm" in ".".join(str(part) for part in error["loc"]) for error in detail
    )


def test_create_product_samples_generates_incremental_codes(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Product sample flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    first_response = client.post(
        f"/api/v1/experiments/{experiment_id}/samples",
        json={"role": "product", "storage_location": "drawer-1"},
        headers=auth_headers(active_user.email),
    )
    second_response = client.post(
        f"/api/v1/experiments/{experiment_id}/samples",
        json={"role": "product", "storage_location": "drawer-2"},
        headers=auth_headers(active_user.email),
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 201
    assert first_response.json()["sample_code"].endswith("-PRODUCT-A")
    assert second_response.json()["sample_code"].endswith("-PRODUCT-B")


def test_patch_sample_updates_owned_draft_sample(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Sample update flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    sample_response = client.post(
        f"/api/v1/experiments/{experiment_id}/samples",
        json={"role": "product", "storage_location": "drawer-1"},
        headers=auth_headers(active_user.email),
    )
    sample_id = sample_response.json()["id"]

    patch_response = client.patch(
        f"/api/v1/samples/{sample_id}",
        json={"storage_location": "drawer-2", "metadata_json": {"quality": "good"}},
        headers=auth_headers(active_user.email),
    )

    assert patch_response.status_code == 200
    assert patch_response.json()["storage_location"] == "drawer-2"
    assert patch_response.json()["metadata_json"]["quality"] == "good"


def test_patch_sample_rejects_null_metadata_json(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Null metadata flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    sample_response = client.post(
        f"/api/v1/experiments/{experiment_id}/samples",
        json={"role": "product", "storage_location": "drawer-1"},
        headers=auth_headers(active_user.email),
    )
    sample_id = sample_response.json()["id"]

    patch_response = client.patch(
        f"/api/v1/samples/{sample_id}",
        json={"metadata_json": None},
        headers=auth_headers(active_user.email),
    )

    assert patch_response.status_code == 422


def test_substrate_resync_preserves_user_metadata(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Metadata preservation flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_substrates_module(experiment_id, active_user.email)

    list_response = client.get(
        f"/api/v1/samples?experiment_id={experiment_id}",
        headers=auth_headers(active_user.email),
    )
    top_sample = next(item for item in list_response.json()["items"] if item["role"] == "top")

    patch_response = client.patch(
        f"/api/v1/samples/{top_sample['id']}",
        json={"metadata_json": {"quality": "good"}},
        headers=auth_headers(active_user.email),
    )
    assert patch_response.status_code == 200

    repopulate_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "top",
                        "type": "SiO2/Si",
                        "brand": "Brand A2",
                        "size_mm": "5x10",
                        "treatment_method": "plasma_cleaning",
                        "position_mm": 2,
                    },
                    {
                        "role": "bottom",
                        "type": "SiO2/Si",
                        "brand": "Brand B",
                        "size_mm": "5x10",
                        "treatment_method": "plasma_cleaning",
                        "position_mm": -1,
                    },
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert repopulate_response.status_code == 200

    detail_response = client.get(
        f"/api/v1/samples/{top_sample['id']}",
        headers=auth_headers(active_user.email),
    )

    assert detail_response.status_code == 200
    assert detail_response.json()["brand"] == "Brand A2"
    assert detail_response.json()["metadata_json"]["quality"] == "good"


def test_substrate_sync_persists_treatment_params_metadata(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Treatment params sync",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    first_sync_response = client.put(
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
                            "duration_min": 8,
                            "power_W": 30,
                            "gas": "Ar",
                        },
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert first_sync_response.status_code == 200

    list_response = client.get(
        f"/api/v1/samples?experiment_id={experiment_id}",
        headers=auth_headers(active_user.email),
    )
    top_sample = list_response.json()["items"][0]
    patch_response = client.patch(
        f"/api/v1/samples/{top_sample['id']}",
        json={"metadata_json": {"quality": "good"}},
        headers=auth_headers(active_user.email),
    )
    assert patch_response.status_code == 200

    resync_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "top",
                        "type": "SiO2/Si",
                        "brand": "Brand A2",
                        "treatment_method": "plasma_cleaning",
                        "treatment_params": {
                            "temperature_C": 150,
                            "duration_min": 12,
                            "power_W": 45,
                            "gas": "O2",
                        },
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert resync_response.status_code == 200

    detail_response = client.get(
        f"/api/v1/samples/{top_sample['id']}",
        headers=auth_headers(active_user.email),
    )

    assert detail_response.status_code == 200
    assert detail_response.json()["metadata_json"]["quality"] == "good"
    assert detail_response.json()["metadata_json"]["treatment_params"] == {
        "temperature_C": 150,
        "duration_min": 12,
        "power_W": 45,
        "gas": "O2",
    }


def test_substrate_removal_rejects_when_file_is_linked(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Substrate dependency protection",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_substrates_module(experiment_id, active_user.email)

    list_response = client.get(
        f"/api/v1/samples?experiment_id={experiment_id}",
        headers=auth_headers(active_user.email),
    )
    top_sample = next(item for item in list_response.json()["items"] if item["role"] == "top")

    file_response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"sample_id": top_sample["id"], "method": "OM"},
        files={"file": ("linked.txt", b"linked", "text/plain")},
    )
    assert file_response.status_code == 201
    file_id = file_response.json()["id"]

    update_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "bottom",
                        "type": "SiO2/Si",
                        "brand": "Brand B",
                        "size_mm": "5x10",
                        "treatment_method": "plasma_cleaning",
                        "position_mm": -1,
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )

    assert update_response.status_code == 422
    assert (
        update_response.json()["detail"]
        == "Cannot remove substrate sample while dependent records exist"
    )

    file_detail_response = client.get(
        f"/api/v1/files/{file_id}",
        headers=auth_headers(active_user.email),
    )
    assert file_detail_response.status_code == 200
    assert file_detail_response.json()["sample_id"] == top_sample["id"]


def test_substrate_removal_rejects_when_child_sample_depends_on_it(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Substrate lineage protection",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_substrates_module(experiment_id, active_user.email)

    list_response = client.get(
        f"/api/v1/samples?experiment_id={experiment_id}",
        headers=auth_headers(active_user.email),
    )
    top_sample = next(item for item in list_response.json()["items"] if item["role"] == "top")

    child_response = client.post(
        f"/api/v1/experiments/{experiment_id}/samples",
        json={"role": "product", "parent_sample_id": top_sample["id"]},
        headers=auth_headers(active_user.email),
    )
    assert child_response.status_code == 201

    update_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "bottom",
                        "type": "SiO2/Si",
                        "brand": "Brand B",
                        "size_mm": "5x10",
                        "treatment_method": "plasma_cleaning",
                        "position_mm": -1,
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )

    assert update_response.status_code == 422
    assert (
        update_response.json()["detail"]
        == "Cannot remove substrate sample while dependent records exist"
    )


def test_clone_locked_experiment_copies_samples_with_new_codes(active_user, admin_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-23",
            "objective": "Sample clone flow",
        },
        headers=auth_headers(admin_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_required_modules(experiment_id, admin_user.email)
    populate_substrates_module(experiment_id, admin_user.email)

    sample_response = client.post(
        f"/api/v1/experiments/{experiment_id}/samples",
        json={"role": "product", "storage_location": "drawer-1"},
        headers=auth_headers(admin_user.email),
    )
    assert sample_response.status_code == 201

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
    clone_run_code = clone_response.json()["run_code"]

    list_response = client.get(
        f"/api/v1/samples?experiment_id={clone_id}",
        headers=auth_headers(active_user.email),
    )

    assert list_response.status_code == 200
    assert list_response.json()["total"] == 2
    expected_prefix = clone_run_code.replace("CVD", "S", 1)
    for item in list_response.json()["items"]:
        assert item["sample_code"].startswith(expected_prefix)
        assert item["role"] in {"top", "bottom"}


def test_create_sample_rejects_cross_experiment_parent(active_user, admin_user) -> None:
    own_experiment_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Parent sample flow",
        },
        headers=auth_headers(active_user.email),
    )
    own_experiment_id = own_experiment_response.json()["id"]
    parent_response = client.post(
        f"/api/v1/experiments/{own_experiment_id}/samples",
        json={"role": "product"},
        headers=auth_headers(active_user.email),
    )
    parent_id = parent_response.json()["id"]

    other_experiment_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-23",
            "objective": "Other experiment",
        },
        headers=auth_headers(admin_user.email),
    )
    other_experiment_id = other_experiment_response.json()["id"]

    child_response = client.post(
        f"/api/v1/experiments/{other_experiment_id}/samples",
        json={"role": "product", "parent_sample_id": parent_id},
        headers=auth_headers(admin_user.email),
    )

    assert child_response.status_code == 422
    assert child_response.json()["detail"] == "Parent sample must belong to the same experiment"


def test_create_product_sample_supports_aa_suffix_after_z(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Long suffix flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    sample_codes: list[str] = []
    for _ in range(27):
        response = client.post(
            f"/api/v1/experiments/{experiment_id}/samples",
            json={"role": "product"},
            headers=auth_headers(active_user.email),
        )
        assert response.status_code == 201
        sample_codes.append(response.json()["sample_code"])

    assert sample_codes[25].endswith("-PRODUCT-Z")
    assert sample_codes[26].endswith("-PRODUCT-AA")
