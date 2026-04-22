from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_login_rejects_unknown_user() -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "missing@example.com", "password": "bad-password"},
    )

    assert response.status_code == 401


def test_login_returns_access_token_for_valid_credentials(active_user) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": active_user.email, "password": "Password123!"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 3600
    assert body["user"]["email"] == active_user.email
    assert body["user"]["role"] == active_user.role.value
    assert body["access_token"]


def test_login_rejects_inactive_user(inactive_user) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": inactive_user.email, "password": "Password123!"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Inactive user"


def test_me_requires_token() -> None:
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401


def test_me_returns_current_user(active_user) -> None:
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": active_user.email, "password": "Password123!"},
    )
    token = login_response.json()["access_token"]

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["email"] == active_user.email
