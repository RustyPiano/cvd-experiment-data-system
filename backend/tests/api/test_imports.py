from io import BytesIO

import openpyxl
from fastapi.testclient import TestClient

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


def build_process_package_bytes() -> bytes:
    workbook = openpyxl.Workbook()
    worksheet = workbook.active
    headers = [
        "Order",
        "A",
        "B",
        "mass_A",
        "mass_B",
        "Substrate",
        "A_step1_temperature",
        "A_step1_time",
        "A_step2_temperature",
        "A_end_time",
        "B_step1_temperature",
        "B_end_time",
        "Ar_step1_time",
        "Ar_step1_flow",
        "Ar_step3_time",
        "Ar_end_flow",
    ]
    worksheet.append(headers)
    worksheet.append(
        [1, "S", "Na2MoO4", 6, 1, "SiO2", 25, 2, 180, 8, 25, 8, 1, 30, 20, 0]
    )
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_list_import_profiles(active_user) -> None:
    response = client.get(
        "/api/v1/imports/profiles",
        headers=auth_headers(active_user.email),
    )
    assert response.status_code == 200
    keys = {profile["key"] for profile in response.json()["profiles"]}
    assert "cvd_process_package_v1" in keys


def test_preview_then_commit_creates_draft_experiments(active_user) -> None:
    content = build_process_package_bytes()

    preview_response = client.post(
        "/api/v1/imports/preview",
        headers=auth_headers(active_user.email),
        data={"profile_key": "cvd_process_package_v1"},
        files={
            "file": (
                "package.xlsx",
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert preview_response.status_code == 200
    preview = preview_response.json()
    assert preview["profile_key"] == "cvd_process_package_v1"
    assert len(preview["drafts"]) == 1
    draft = preview["drafts"][0]
    precursor_species = [
        item["species"] for item in draft["module_payloads"]["precursors"]["items"]
    ]
    assert precursor_species == ["S", "Na2MoO4"]
    assert draft["module_payloads"]["substrates"]["items"][0]["type"] == "SiO2"

    commit_response = client.post(
        "/api/v1/imports/commit",
        headers=auth_headers(active_user.email),
        json={
            "profile_key": "cvd_process_package_v1",
            "drafts": preview["drafts"],
        },
    )
    assert commit_response.status_code == 201
    created = commit_response.json()["created"]
    assert len(created) == 1
    assert created[0]["source_row"] == 2
    experiment_id = created[0]["experiment_id"]

    modules_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules",
        headers=auth_headers(active_user.email),
    )
    assert modules_response.status_code == 200
    modules = {
        item["module_key"]: item["payload_json"]
        for item in modules_response.json()["items"]
    }
    assert [item["species"] for item in modules["precursors"]["items"]] == [
        "S",
        "Na2MoO4",
    ]
    zone_keys = {zone["zone_key"] for zone in modules["furnace_program"]["zones"]}
    assert {"zone_1", "zone_2"} <= zone_keys


def test_preview_rejects_unknown_profile(active_user) -> None:
    response = client.post(
        "/api/v1/imports/preview",
        headers=auth_headers(active_user.email),
        data={"profile_key": "does_not_exist"},
        files={"file": ("package.xlsx", build_process_package_bytes(), "application/octet-stream")},
    )
    assert response.status_code == 404
