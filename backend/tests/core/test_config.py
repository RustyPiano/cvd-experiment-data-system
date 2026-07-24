import pytest
from pydantic import ValidationError

from app.core.config import Settings

VALID_PRODUCTION = {
    "APP_NAME": "CVD Backend",
    "APP_ENV": "production",
    "APP_DEBUG": False,
    "APP_HOST": "127.0.0.1",
    "APP_PORT": 8000,
    "DATABASE_URL": "sqlite+pysqlite:///config-test.sqlite3",
    "FILE_STORAGE_ROOT": "/tmp/cvd-config-test",
    "JWT_SECRET_KEY": "a" * 32,
    "JWT_ALGORITHM": "HS256",
    "JWT_ACCESS_TOKEN_EXPIRE_MINUTES": 60,
    "REGISTRATION_INVITE_CODE": "",
}


def test_valid_production_settings_disable_registration() -> None:
    settings = Settings(**VALID_PRODUCTION)

    assert settings.registration_invite_code in {"", None}


@pytest.mark.parametrize(
    "override",
    [
        {"APP_DEBUG": True},
        {"JWT_SECRET_KEY": "short"},
        {"JWT_SECRET_KEY": "YOUR_RANDOM_JWT_SECRET_OPENSSL_RAND_HEX_32"},
        {"JWT_SECRET_KEY": "change-me-generate-a-long-random-secret"},
        {"JWT_SECRET_KEY": "test-secret-key-that-is-public-and-long"},
        {"JWT_ALGORITHM": "none"},
        {"REGISTRATION_INVITE_CODE": "YOUR_INTERNAL_REGISTRATION_INVITE_CODE"},
        {"REGISTRATION_INVITE_CODE": "short"},
    ],
)
def test_production_settings_reject_unsafe_security_values(
    override: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        Settings(**{**VALID_PRODUCTION, **override})
