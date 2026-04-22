from jose import jwt

from app.core.config import get_settings
from app.core.security import create_access_token, get_password_hash, verify_password


def test_password_hash_round_trip() -> None:
    password = "StrongPassword123!"
    password_hash = get_password_hash(password)

    assert password_hash != password
    assert verify_password(password, password_hash) is True
    assert verify_password("wrong-password", password_hash) is False


def test_create_access_token_contains_subject_and_role() -> None:
    settings = get_settings()
    token = create_access_token(
        subject="user-id",
        email="user@example.com",
        role="admin",
    )

    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])

    assert payload["sub"] == "user-id"
    assert payload["email"] == "user@example.com"
    assert payload["role"] == "admin"
