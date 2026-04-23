from datetime import UTC, datetime, timedelta

from jose import jwt
from pwdlib import PasswordHash, exceptions

from app.core.config import get_settings

password_hasher = PasswordHash.recommended()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return password_hasher.verify(plain_password, hashed_password)
    except exceptions.UnknownHashError:
        return False


def get_password_hash(password: str) -> str:
    return password_hasher.hash(password)


def create_access_token(*, subject: str) -> str:
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload = {"sub": subject, "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
