# ruff: noqa: E402

import os
import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, event
from sqlalchemy.orm import close_all_sessions
from sqlalchemy.pool import StaticPool

from alembic import command

os.environ.setdefault("APP_NAME", "CVD Backend")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("APP_DEBUG", "false")
os.environ.setdefault("APP_HOST", "127.0.0.1")
os.environ.setdefault("APP_PORT", "8000")
os.environ.setdefault(
    "DATABASE_URL",
    f"sqlite+pysqlite:///{Path(tempfile.gettempdir()) / 'cvd-backend-bootstrap.sqlite3'}",
)
os.environ.setdefault(
    "FILE_STORAGE_ROOT",
    str(Path(tempfile.gettempdir()) / "cvd-backend-bootstrap-storage"),
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60")

from app.core.config import get_settings
from app.db import session as db_session_module
from app.models.user import User, UserRole

ALEMBIC_INI_PATH = Path(__file__).resolve().parents[1] / "alembic.ini"
ALEMBIC_SCRIPT_PATH = Path(__file__).resolve().parents[1] / "alembic"
TEST_PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$TWrbwEsT0E6yxRKeErfQKg"
    "$/GrvltHsaQGPlsoqDqjROWNT7N+Gf4XiqVj22bbfWEk"
)


def _configure_test_engine(database_url: str):
    engine_kwargs: dict[str, object] = {"future": True}
    if database_url.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False}
        engine_kwargs["poolclass"] = StaticPool

    test_engine = create_engine(database_url, **engine_kwargs)

    if database_url.startswith("sqlite"):

        @event.listens_for(test_engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, connection_record) -> None:  # type: ignore[no-untyped-def]
            del connection_record
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    db_session_module.engine = test_engine
    db_session_module.SessionLocal.configure(bind=test_engine)
    return test_engine


@pytest.fixture(scope="session")
def migrated_database_template_path(tmp_path_factory: pytest.TempPathFactory) -> Path:
    template_dir = tmp_path_factory.mktemp("cvd-backend-db-template")
    template_path = template_dir / "template.sqlite3"

    close_all_sessions()
    db_session_module.engine.dispose()
    os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{template_path}"
    get_settings.cache_clear()
    _configure_test_engine(os.environ["DATABASE_URL"])

    alembic_config = Config(str(ALEMBIC_INI_PATH))
    alembic_config.set_main_option("script_location", str(ALEMBIC_SCRIPT_PATH))
    command.upgrade(alembic_config, "head")

    close_all_sessions()
    db_session_module.engine.dispose()
    get_settings.cache_clear()
    return template_path


@pytest.fixture(autouse=True)
def setup_database(migrated_database_template_path: Path) -> None:
    close_all_sessions()
    db_session_module.engine.dispose()
    temp_root = Path(tempfile.gettempdir()) / f"cvd-backend-test-{uuid4().hex}"
    db_path = temp_root / "test.sqlite3"
    file_storage_root = temp_root / "storage"
    temp_root.mkdir(parents=True, exist_ok=True)
    shutil.copy2(migrated_database_template_path, db_path)

    os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{db_path}"
    os.environ["FILE_STORAGE_ROOT"] = str(file_storage_root)
    get_settings.cache_clear()
    _configure_test_engine(os.environ["DATABASE_URL"])
    yield
    close_all_sessions()
    db_session_module.engine.dispose()
    get_settings.cache_clear()
    shutil.rmtree(temp_root, ignore_errors=True)


@pytest.fixture()
def db_session():
    session = db_session_module.SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def active_user(db_session):
    user = User(
        email="active@example.com",
        name="Active User",
        password_hash=TEST_PASSWORD_HASH,
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def inactive_user(db_session):
    user = User(
        email="inactive@example.com",
        name="Inactive User",
        password_hash=TEST_PASSWORD_HASH,
        role=UserRole.MEMBER,
        is_active=False,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def admin_user(db_session):
    user = User(
        email="admin@example.com",
        name="Admin User",
        password_hash=TEST_PASSWORD_HASH,
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def viewer_user(db_session):
    user = User(
        email="viewer@example.com",
        name="Viewer User",
        password_hash=TEST_PASSWORD_HASH,
        role=UserRole.VIEWER,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user
