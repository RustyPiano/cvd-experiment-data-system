from io import BytesIO

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.main import app

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


def create_experiment(email: str, *, objective: str = "Export flow") -> str:
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
                "segments": [
                    {
                        "stage": "growth",
                        "start_min": 0,
                        "end_min": 45,
                        "gas": "Ar",
                        "components": [{"name": "Ar", "fraction": 1}],
                        "flow_sccm": 80,
                    }
                ]
            }
        },
        headers=auth_headers(email),
    )
    assert gas_response.status_code == 200


def create_product_sample(experiment_id: str, email: str) -> str:
    response = client.post(
        f"/api/v1/experiments/{experiment_id}/samples",
        json={"role": "product", "storage_location": "drawer-1"},
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    return response.json()["id"]


def sync_top_substrate_sample(experiment_id: str, email: str) -> str:
    substrates_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "top",
                        "type": "SiO2/Si",
                        "brand": "MTI",
                        "size_mm": "10x10",
                        "treatment_method": "acetone",
                        "position_mm": 12.5,
                    }
                ]
            }
        },
        headers=auth_headers(email),
    )
    assert substrates_response.status_code == 200

    samples_response = client.get(
        f"/api/v1/samples?experiment_id={experiment_id}&role=top",
        headers=auth_headers(email),
    )
    assert samples_response.status_code == 200
    samples = samples_response.json()["items"]
    assert len(samples) == 1
    return samples[0]["id"]


def test_export_includes_related_sample_and_file_audit_events(active_user) -> None:
    experiment_id = create_experiment(active_user.email)
    sample_id = sync_top_substrate_sample(experiment_id, active_user.email)

    sample_update_response = client.patch(
        f"/api/v1/samples/{sample_id}",
        json={"storage_location": "box-a1"},
        headers=auth_headers(active_user.email),
    )
    assert sample_update_response.status_code == 200

    file_response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={
            "sample_id": sample_id,
            "method": "Raman",
            "file_category": "raw",
            "note": "linked spectrum",
        },
        files={"file": ("linked-raman.txt", b"peak=404", "text/plain")},
    )
    assert file_response.status_code == 201
    file_id = file_response.json()["id"]

    export_response = client.get(
        f"/api/v1/experiments/{experiment_id}/export",
        headers=auth_headers(active_user.email),
    )

    assert export_response.status_code == 200
    audit_events = export_response.json()["audit_events"]
    entity_types = {event["entity_type"] for event in audit_events}
    assert {"experiment_run", "sample", "file_asset"} <= entity_types
    assert any(event["entity_type"] != "experiment_run" for event in audit_events)

    sample_events = [
        event
        for event in audit_events
        if event["entity_type"] == "sample" and event["entity_id"] == sample_id
    ]
    assert {"create", "update"} <= {event["action"] for event in sample_events}

    file_events = [
        event
        for event in audit_events
        if event["entity_type"] == "file_asset" and event["entity_id"] == file_id
    ]
    assert {"create"} <= {event["action"] for event in file_events}


def test_export_experiment_aggregates_modules_samples_files_and_audit(active_user) -> None:
    experiment_id = create_experiment(active_user.email)

    substrates_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "top",
                        "type": "SiO2/Si",
                        "brand": "MTI",
                        "size_mm": "10x10",
                        "treatment_method": "acetone",
                        "position_mm": 12.5,
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert substrates_response.status_code == 200
    populate_required_modules(experiment_id, active_user.email)
    sample_id = create_product_sample(experiment_id, active_user.email)

    keep_file_response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={
            "sample_id": sample_id,
            "method": "Raman",
            "file_category": "raw",
            "note": "primary spectrum",
        },
        files={"file": ("raman.txt", b"peak=404", "text/plain")},
    )
    assert keep_file_response.status_code == 201

    deleted_file_response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "OM"},
        files={"file": ("draft-note.txt", b"remove-me", "text/plain")},
    )
    assert deleted_file_response.status_code == 201
    delete_response = client.delete(
        f"/api/v1/files/{deleted_file_response.json()['id']}",
        headers=auth_headers(active_user.email),
    )
    assert delete_response.status_code == 204

    export_response = client.get(
        f"/api/v1/experiments/{experiment_id}/export",
        headers=auth_headers(active_user.email),
    )

    assert export_response.status_code == 200
    body = export_response.json()
    assert body["export_version"] == "cvd_export_v1"
    assert body["experiment"]["id"] == experiment_id
    assert body["features"] == []
    assert body["provenance"] == {
        "derived_from_run_id": None,
        "derived_from_run_code": None,
    }
    assert body["counts"] == {
        "modules": 4,
        "samples": 2,
        "files": 1,
        "audit_events": 11,
    }
    assert {item["module_key"] for item in body["modules"]} == {
        "substrates",
        "precursors",
        "furnace_program",
        "gas_program",
    }
    assert {item["sample_code"] for item in body["samples"]} == {
        "S-2026-0001-TOP",
        "S-2026-0001-PRODUCT-A",
    }
    assert [item["original_name"] for item in body["files"]] == ["raman.txt"]
    assert body["files"][0]["sample_id"] == sample_id
    assert body["files"][0]["method"] == "Raman"
    assert "upload_file" in {item["action"] for item in body["audit_events"]}
    assert "delete_file" in {item["action"] for item in body["audit_events"]}


def test_export_experiment_excel_returns_openable_workbook(active_user) -> None:
    experiment_id = create_experiment(active_user.email, objective="Excel export flow")
    populate_required_modules(experiment_id, active_user.email)

    file_response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "OM", "file_category": "processed"},
        files={"file": ("image.png", b"png-bytes", "image/png")},
    )
    assert file_response.status_code == 201

    export_response = client.get(
        f"/api/v1/experiments/{experiment_id}/export/excel",
        headers=auth_headers(active_user.email),
    )

    assert export_response.status_code == 200
    assert (
        export_response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    workbook = load_workbook(filename=BytesIO(export_response.content))
    assert workbook.sheetnames == [
        "Basic Info",
        "Environment & Precheck",
        "Precursors",
        "Substrates",
        "Furnace Program",
        "Gas Program",
        "Characterization",
        "Files",
        "Audit",
    ]
    assert workbook["Basic Info"]["A1"].value == "Field"
    assert workbook["Basic Info"]["B2"].value == "CVD-2026-0001"
    assert workbook["Files"]["A2"].value == "image.png"
    assert workbook["Files"]["B2"].value == "OM"
    assert workbook["Files"]["C2"].value == "processed"


def test_viewer_can_export_locked_experiment_but_not_other_users_draft(
    admin_user, viewer_user
) -> None:
    locked_experiment_id = create_experiment(admin_user.email, objective="Visible export")
    populate_required_modules(locked_experiment_id, admin_user.email)

    submit_response = client.post(
        f"/api/v1/experiments/{locked_experiment_id}/submit",
        headers=auth_headers(admin_user.email),
    )
    assert submit_response.status_code == 200

    lock_response = client.post(
        f"/api/v1/experiments/{locked_experiment_id}/lock",
        headers=auth_headers(admin_user.email),
    )
    assert lock_response.status_code == 200

    visible_response = client.get(
        f"/api/v1/experiments/{locked_experiment_id}/export",
        headers=auth_headers(viewer_user.email),
    )
    assert visible_response.status_code == 200
    assert visible_response.json()["experiment"]["status"] == "locked"

    draft_experiment_id = create_experiment(admin_user.email, objective="Hidden draft export")
    hidden_response = client.get(
        f"/api/v1/experiments/{draft_experiment_id}/export",
        headers=auth_headers(viewer_user.email),
    )

    assert hidden_response.status_code == 404
