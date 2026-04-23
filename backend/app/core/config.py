from functools import lru_cache

from pydantic import Field
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

    @property
    def cors_allow_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
