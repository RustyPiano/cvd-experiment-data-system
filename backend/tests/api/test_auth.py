from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.repositories.user_repository import UserRepository

client = TestClient(app)
REGISTER_PAYLOAD = {
    "email": "new.member@example.com",
    "name": "New Member",
    "password": "Password123!",
    "password_confirmation": "Password123!",
    "invite_code": "lab-invite",
}


def test_login_rejects_unknown_user() -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "missing@example.com", "password": "bad-password"},
    )

    assert response.status_code == 401


def test_register_creates_member_and_returns_access_token(monkeypatch, db_session) -> None:
    monkeypatch.setenv("REGISTRATION_INVITE_CODE", "lab-invite")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/auth/register",
        json={**REGISTER_PAYLOAD, "email": " New.Member@Example.COM ", "name": " New Member "},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 3600
    assert body["access_token"]
    assert body["user"]["email"] == "new.member@example.com"
    assert body["user"]["name"] == "New Member"
    assert body["user"]["role"] == "member"
    assert body["user"]["is_active"] is True
    assert body["user"]["last_login_at"] is not None

    db_session.expire_all()
    created_user = UserRepository(db_session).get_by_email("new.member@example.com")
    assert created_user is not None
    assert created_user.password_hash.startswith("$argon2id$")
    assert created_user.last_login_at is not None

    me_response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "new.member@example.com"


def test_register_rejects_wrong_invite_code(monkeypatch) -> None:
    monkeypatch.setenv("REGISTRATION_INVITE_CODE", "lab-invite")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/auth/register",
        json={**REGISTER_PAYLOAD, "invite_code": "wrong-code"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Invalid invite code"


def test_register_rejects_when_invite_code_is_not_configured(monkeypatch) -> None:
    monkeypatch.delenv("REGISTRATION_INVITE_CODE", raising=False)
    get_settings.cache_clear()

    response = client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)

    assert response.status_code == 403
    assert response.json()["detail"] == "Invalid invite code"


def test_register_rejects_duplicate_email_after_normalization(monkeypatch, active_user) -> None:
    monkeypatch.setenv("REGISTRATION_INVITE_CODE", "lab-invite")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/auth/register",
        json={**REGISTER_PAYLOAD, "email": f" {active_user.email.upper()} "},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "User with this email already exists"


def test_register_rejects_existing_mixed_case_email(monkeypatch, active_user, db_session) -> None:
    active_user.email = "Mixed.User@Example.COM"
    db_session.add(active_user)
    db_session.commit()
    monkeypatch.setenv("REGISTRATION_INVITE_CODE", "lab-invite")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/auth/register",
        json={**REGISTER_PAYLOAD, "email": "mixed.user@example.com"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "User with this email already exists"


def test_register_rejects_password_confirmation_mismatch(monkeypatch) -> None:
    monkeypatch.setenv("REGISTRATION_INVITE_CODE", "lab-invite")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/auth/register",
        json={**REGISTER_PAYLOAD, "password_confirmation": "Different123!"},
    )

    assert response.status_code == 422


def test_register_rejects_short_password(monkeypatch) -> None:
    monkeypatch.setenv("REGISTRATION_INVITE_CODE", "lab-invite")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/auth/register",
        json={**REGISTER_PAYLOAD, "password": "short", "password_confirmation": "short"},
    )

    assert response.status_code == 422


def test_login_returns_access_token_for_valid_credentials(active_user, db_session) -> None:
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

    db_session.expire_all()
    updated_user = UserRepository(db_session).get_by_email(active_user.email)
    assert updated_user is not None
    assert updated_user.last_login_at is not None
    assert updated_user.password_hash.startswith("$argon2id$")


def test_login_rejects_legacy_bcrypt_hash(active_user, db_session) -> None:
    active_user.password_hash = "$2b$12$7a/xl.p986hByjdM6mJSuOLYQiXeAHBHghoy4b7pyMweQl0muAY1m"
    db_session.add(active_user)
    db_session.commit()
    db_session.refresh(active_user)
    assert active_user.password_hash.startswith("$2")

    response = client.post(
        "/api/v1/auth/login",
        json={"email": active_user.email, "password": "Password123!"},
    )

    assert response.status_code == 401
    db_session.expire_all()
    updated_user = UserRepository(db_session).get_by_email(active_user.email)
    assert updated_user is not None
    assert updated_user.password_hash.startswith("$2")


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


def test_logout_requires_token() -> None:
    response = client.post("/api/v1/auth/logout")

    assert response.status_code == 401


def test_logout_returns_no_content_for_authenticated_user(active_user) -> None:
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": active_user.email, "password": "Password123!"},
    )
    token = login_response.json()["access_token"]

    response = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 204
    assert response.content == b""
