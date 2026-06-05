from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def login(email: str, password: str = "Password123!") -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {login(email)}"}


def test_list_setup_method_templates(active_user) -> None:
    response = client.get(
        "/api/v1/setup-method-templates",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert body["items"][0]["template_key"] == "group_fast_cvd"


def test_get_setup_method_template_resolves_current_version(active_user) -> None:
    response = client.get(
        "/api/v1/setup-method-templates/group_fast_cvd",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["template_version"] == 1
