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


def create_run(email: str, *, formula: str = "MoS2") -> dict:
    response = client.post(
        "/api/v1/v2/experiments",
        json={
            "started_at": "2026-04-23T10:00:00+08:00",
            "synthesis_method": "CVD",
            "operator": email,
            "chemical_formula": formula,
            "objective": "Manual sample CRUD",
        },
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    return response.json()


def create_sample(run_id: str, email: str, payload: dict | None = None) -> dict:
    response = client.post(
        f"/api/v1/experiments/{run_id}/samples",
        json=payload or {"role": "product"},
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    return response.json()


def test_manual_sample_create_list_and_detail(active_user) -> None:
    run = create_run(active_user.email, formula="WSe2")
    sample = create_sample(
        run["id"],
        active_user.email,
        {
            "role": "product",
            "storage_location": "drawer-1",
            "metadata_json": {"quality": "good"},
        },
    )

    list_response = client.get(
        f"/api/v1/samples?experiment_id={run['id']}",
        headers=auth_headers(active_user.email),
    )
    detail_response = client.get(
        f"/api/v1/samples/{sample['id']}",
        headers=auth_headers(active_user.email),
    )

    assert list_response.status_code == 200
    assert list_response.json()["items"] == [detail_response.json()]
    assert detail_response.json()["run_code"] == run["run_code"]
    assert detail_response.json()["material_system"] == "WSe2"


def test_patch_sample_updates_owned_draft_sample(active_user) -> None:
    run = create_run(active_user.email)
    sample = create_sample(run["id"], active_user.email)

    response = client.patch(
        f"/api/v1/samples/{sample['id']}",
        json={"storage_location": "drawer-2", "metadata_json": {"quality": "good"}},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["storage_location"] == "drawer-2"
    assert response.json()["metadata_json"] == {"quality": "good"}


def test_patch_sample_rejects_null_metadata_json(active_user) -> None:
    run = create_run(active_user.email)
    sample = create_sample(run["id"], active_user.email)

    response = client.patch(
        f"/api/v1/samples/{sample['id']}",
        json={"metadata_json": None},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422


def test_create_sample_rejects_cross_experiment_parent(active_user, admin_user) -> None:
    parent_run = create_run(active_user.email)
    parent = create_sample(parent_run["id"], active_user.email)
    other_run = create_run(admin_user.email)

    response = client.post(
        f"/api/v1/experiments/{other_run['id']}/samples",
        json={"role": "product", "parent_sample_id": parent["id"]},
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Parent sample must belong to the same experiment"


def test_create_product_samples_generates_incremental_codes(active_user) -> None:
    run = create_run(active_user.email)

    first = create_sample(run["id"], active_user.email)
    second = create_sample(run["id"], active_user.email)

    assert first["sample_code"].endswith("-PRODUCT-A")
    assert second["sample_code"].endswith("-PRODUCT-B")
