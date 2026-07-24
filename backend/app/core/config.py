from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = Field(alias="APP_NAME")
    app_env: str = Field(alias="APP_ENV")
    app_debug: bool = Field(alias="APP_DEBUG")
    app_host: str = Field(alias="APP_HOST")
    app_port: int = Field(alias="APP_PORT")
    database_url: str = Field(alias="DATABASE_URL")
    file_storage_root: str = Field(alias="FILE_STORAGE_ROOT")
    file_upload_max_bytes: int = Field(default=52_428_800, alias="FILE_UPLOAD_MAX_BYTES")
    cors_allow_origins: str = Field(
        default=(
            "http://localhost:5173,"
            "http://127.0.0.1:5173,"
            "http://localhost:4173,"
            "http://127.0.0.1:4173"
        ),
        alias="CORS_ALLOW_ORIGINS",
    )
    jwt_secret_key: str = Field(alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(alias="JWT_ALGORITHM")
    jwt_access_token_expire_minutes: int = Field(alias="JWT_ACCESS_TOKEN_EXPIRE_MINUTES")
    registration_invite_code: str | None = Field(default=None, alias="REGISTRATION_INVITE_CODE")
    experiment_timezone: str = Field(default="Asia/Shanghai", alias="EXPERIMENT_TIMEZONE")

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.app_env.strip().lower() != "production":
            return self
        if self.app_debug:
            raise ValueError("APP_DEBUG must be false in production")

        secret = self.jwt_secret_key.strip()
        if len(secret) < 32 or secret.lower().startswith(("your_", "change-me", "test")):
            raise ValueError("JWT_SECRET_KEY is unsafe for production")
        if self.jwt_algorithm.strip().upper() != "HS256":
            raise ValueError("JWT_ALGORITHM must be HS256 in production")

        invite_code = (self.registration_invite_code or "").strip()
        if invite_code and (
            not 8 <= len(invite_code) <= 128
            or invite_code.lower().startswith(("your_", "change-me", "test"))
        ):
            raise ValueError("REGISTRATION_INVITE_CODE is unsafe for production")
        self.jwt_secret_key = secret
        self.jwt_algorithm = "HS256"
        self.registration_invite_code = invite_code or None
        return self

    @property
    def cors_allow_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
