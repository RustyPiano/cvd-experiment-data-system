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


def test_list_vocabularies_returns_seeded_active_entries(active_user) -> None:
    response = client.get(
        "/api/v1/vocabularies?vocab_key=material_system",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    values = {item["value"] for item in body["items"]}
    assert {"MoS2", "WS2", "graphene"} <= values
    assert all(item["is_active"] is True for item in body["items"])


def test_admin_can_create_and_update_vocabulary_entry(admin_user) -> None:
    create_response = client.post(
        "/api/v1/admin/vocabularies",
        json={
            "vocab_key": "substrate_type",
            "value": "quartz",
            "label_zh": "石英",
            "label_en": "Quartz",
            "sort_order": 99,
        },
        headers=auth_headers(admin_user.email),
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["vocab_key"] == "substrate_type"
    assert created["value"] == "quartz"
    assert created["is_active"] is True

    update_response = client.patch(
        f"/api/v1/admin/vocabularies/{created['id']}",
        json={
            "label_zh": "石英片",
            "is_active": False,
            "sort_order": 5,
        },
        headers=auth_headers(admin_user.email),
    )

    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["label_zh"] == "石英片"
    assert updated["is_active"] is False
    assert updated["sort_order"] == 5

    admin_list_response = client.get(
        "/api/v1/admin/vocabularies?vocab_key=substrate_type",
        headers=auth_headers(admin_user.email),
    )
    assert admin_list_response.status_code == 200
    values = {item["value"] for item in admin_list_response.json()["items"]}
    assert "quartz" in values


def test_update_vocabulary_rejects_duplicate_value(admin_user) -> None:
    first_response = client.post(
        "/api/v1/admin/vocabularies",
        json={
            "vocab_key": "substrate_type",
            "value": "quartz-a",
            "label_zh": "石英A",
            "label_en": "Quartz A",
            "sort_order": 10,
        },
        headers=auth_headers(admin_user.email),
    )
    second_response = client.post(
        "/api/v1/admin/vocabularies",
        json={
            "vocab_key": "substrate_type",
            "value": "quartz-b",
            "label_zh": "石英B",
            "label_en": "Quartz B",
            "sort_order": 11,
        },
        headers=auth_headers(admin_user.email),
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 201

    update_response = client.patch(
        f"/api/v1/admin/vocabularies/{second_response.json()['id']}",
        json={"value": "quartz-a"},
        headers=auth_headers(admin_user.email),
    )

    assert update_response.status_code == 409
    assert update_response.json()["detail"] == "Vocabulary entry already exists"


def test_non_admin_cannot_mutate_vocabulary_entries(active_user) -> None:
    response = client.post(
        "/api/v1/admin/vocabularies",
        json={
            "vocab_key": "gas",
            "value": "N2",
            "label_zh": "氮气",
            "label_en": "Nitrogen",
            "sort_order": 10,
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 403
