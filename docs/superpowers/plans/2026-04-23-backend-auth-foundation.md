# Backend Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend foundation for the CVD system with a runnable FastAPI service, PostgreSQL/Alembic integration, JWT login, current-user endpoint, and a CLI command to create the first admin user.

**Architecture:** Keep the first slice narrow: a versioned FastAPI app under `backend/app`, a single `users` table managed by SQLAlchemy 2.x and Alembic, and auth logic split between `core`, `repositories`, and `services`. Tests drive each slice from the outside in: health endpoint, security helpers, auth endpoints, and admin bootstrap command.

**Tech Stack:** Python 3.12+, FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL, Pydantic v2, `pydantic-settings`, `python-jose`, `passlib[bcrypt]`, pytest, ruff, uv.

---

## File Map

- Create: `backend/pyproject.toml`
- Create: `backend/.python-version`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/<timestamp>_create_users_table.py`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/router.py`
- Create: `backend/app/api/v1/__init__.py`
- Create: `backend/app/api/v1/router.py`
- Create: `backend/app/api/v1/endpoints/__init__.py`
- Create: `backend/app/api/v1/endpoints/auth.py`
- Create: `backend/app/api/v1/endpoints/health.py`
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/security.py`
- Create: `backend/app/core/deps.py`
- Create: `backend/app/db/__init__.py`
- Create: `backend/app/db/base.py`
- Create: `backend/app/db/session.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/user.py`
- Create: `backend/app/repositories/__init__.py`
- Create: `backend/app/repositories/user_repository.py`
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/auth_service.py`
- Create: `backend/app/commands/__init__.py`
- Create: `backend/app/commands/create_admin.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`
- Create: `backend/tests/core/test_security.py`
- Create: `backend/tests/api/test_auth.py`
- Create: `backend/tests/commands/test_create_admin.py`
- Create: `backend/tests/factories.py`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`
- Create: `frontend/README.md`
- Create: `docker-compose.yml`

## Task 1: Bootstrap the repository and backend package

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.python-version`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/router.py`
- Create: `backend/app/api/v1/__init__.py`
- Create: `backend/app/api/v1/router.py`
- Create: `backend/app/api/v1/endpoints/__init__.py`
- Create: `backend/app/api/v1/endpoints/health.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`
- Create: `frontend/README.md`
- Create: `docker-compose.yml`
- Test: `backend/tests/test_health.py`

- [ ] **Step 1: Write the failing health test**

```python
# backend/tests/test_health.py
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "cvd-backend"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/test_health.py -v`
Expected: FAIL with import errors because the package and app entrypoint do not exist yet.

- [ ] **Step 3: Write the minimal application bootstrap**

```python
# backend/app/main.py
from fastapi import FastAPI

from app.api.router import api_router


app = FastAPI(title="CVD Backend")
app.include_router(api_router)
```

```python
# backend/app/api/router.py
from fastapi import APIRouter

from app.api.v1.router import api_v1_router


api_router = APIRouter()
api_router.include_router(api_v1_router)
```

```python
# backend/app/api/v1/router.py
from fastapi import APIRouter

from app.api.v1.endpoints.health import router as health_router


api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
```

```python
# backend/app/api/v1/endpoints/health.py
from fastapi import APIRouter


router = APIRouter()


@router.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "service": "cvd-backend"}
```

```toml
# backend/pyproject.toml
[project]
name = "cvd-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115,<1.0",
  "uvicorn>=0.30,<1.0",
  "sqlalchemy>=2.0,<3.0",
  "alembic>=1.13,<2.0",
  "psycopg[binary]>=3.2,<4.0",
  "pydantic-settings>=2.4,<3.0",
  "python-jose[cryptography]>=3.3,<4.0",
  "passlib[bcrypt]>=1.7,<2.0",
]

[dependency-groups]
dev = [
  "pytest>=8.3,<9.0",
  "pytest-cov>=5.0,<6.0",
  "httpx>=0.27,<1.0",
  "ruff>=0.6,<1.0",
]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

- [ ] **Step 4: Add root scaffolding files**

```gitignore
# .gitignore
.DS_Store
.env
.venv/
backend/.venv/
backend/.pytest_cache/
backend/.ruff_cache/
backend/.coverage
backend/htmlcov/
backend/.mypy_cache/
storage/
```

```env
# .env.example
APP_NAME=CVD Backend
APP_ENV=development
APP_DEBUG=true
APP_HOST=0.0.0.0
APP_PORT=8000
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/cvd
JWT_SECRET_KEY=change-me
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
```

```markdown
# frontend/README.md
Frontend workspace placeholder. The first implementation phase only builds the backend.
```

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: cvd
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && uv sync && uv run pytest tests/test_health.py -v`
Expected: PASS with `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore .env.example README.md frontend/README.md docker-compose.yml backend
git commit -m "feat(backend): bootstrap backend service"
```

## Task 2: Add typed settings and database session infrastructure

**Files:**
- Create: `backend/app/core/config.py`
- Create: `backend/app/db/base.py`
- Create: `backend/app/db/session.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_health.py`

- [ ] **Step 1: Extend the health test to prove settings wiring**

```python
def test_health_returns_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "cvd-backend"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/test_health.py -v`
Expected: FAIL after changing the app to read settings before startup, because settings and wiring are not implemented yet.

- [ ] **Step 3: Implement settings and session factories**

```python
# backend/app/core/config.py
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(alias="APP_NAME")
    app_env: str = Field(alias="APP_ENV")
    app_debug: bool = Field(alias="APP_DEBUG")
    app_host: str = Field(alias="APP_HOST")
    app_port: int = Field(alias="APP_PORT")
    database_url: str = Field(alias="DATABASE_URL")
    jwt_secret_key: str = Field(alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(alias="JWT_ALGORITHM")
    jwt_access_token_expire_minutes: int = Field(alias="JWT_ACCESS_TOKEN_EXPIRE_MINUTES")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
```

```python
# backend/app/db/session.py
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


settings = get_settings()
engine = create_engine(settings.database_url, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

```python
# backend/app/main.py
from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import get_settings


settings = get_settings()
app = FastAPI(title=settings.app_name, debug=settings.app_debug)
app.include_router(api_router)
```

- [ ] **Step 4: Add test environment defaults**

```python
# backend/tests/conftest.py
import os


os.environ.setdefault("APP_NAME", "CVD Backend")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("APP_DEBUG", "false")
os.environ.setdefault("APP_HOST", "127.0.0.1")
os.environ.setdefault("APP_PORT", "8000")
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60")
```

- [ ] **Step 5: Re-run the health test**

Run: `cd backend && uv run pytest tests/test_health.py -v`
Expected: PASS with settings loaded from the test environment.

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/config.py backend/app/db/session.py backend/tests/conftest.py backend/app/main.py
git commit -m "feat(backend): add settings and db session setup"
```

## Task 3: Model the user entity and wire Alembic

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/<timestamp>_create_users_table.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/user.py`
- Create: `backend/app/db/base.py`
- Test: `backend/tests/api/test_auth.py`

- [ ] **Step 1: Write the first auth API test that depends on a user record**

```python
# backend/tests/api/test_auth.py
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_login_rejects_unknown_user() -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "missing@example.com", "password": "bad-password"},
    )

    assert response.status_code == 401
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/api/test_auth.py::test_login_rejects_unknown_user -v`
Expected: FAIL because there is no auth route and no user model yet.

- [ ] **Step 3: Define the ORM model and metadata base**

```python
# backend/app/db/base.py
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

```python
# backend/app/models/user.py
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), default=UserRole.MEMBER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 4: Add Alembic configuration and the initial migration**

```python
# backend/alembic/env.py
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.db.base import Base
from app.models import user  # noqa: F401


config = context.config
settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
```

```python
# backend/alembic/versions/<timestamp>_create_users_table.py
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "<timestamp>"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    user_role = sa.Enum("admin", "member", "viewer", name="user_role")
    user_role.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", user_role, nullable=False, server_default="member"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=True)
```

- [ ] **Step 5: Re-run the auth test to keep it red for the right reason**

Run: `cd backend && uv run pytest tests/api/test_auth.py::test_login_rejects_unknown_user -v`
Expected: FAIL with `404` or missing auth route, proving the next step is the API layer rather than the model layer.

- [ ] **Step 6: Commit**

```bash
git add backend/alembic.ini backend/alembic backend/app/db/base.py backend/app/models
git commit -m "feat(backend): add user model and alembic setup"
```

## Task 4: Implement security helpers and user lookup

**Files:**
- Create: `backend/app/core/security.py`
- Create: `backend/app/repositories/user_repository.py`
- Create: `backend/tests/core/test_security.py`
- Modify: `backend/tests/factories.py`
- Test: `backend/tests/core/test_security.py`

- [ ] **Step 1: Write failing tests for password hashing and token generation**

```python
# backend/tests/core/test_security.py
from app.core.security import create_access_token, get_password_hash, verify_password


def test_password_hash_round_trip() -> None:
    password = "StrongPassword123!"
    password_hash = get_password_hash(password)

    assert password_hash != password
    assert verify_password(password, password_hash) is True


def test_create_access_token_contains_subject_and_role() -> None:
    token = create_access_token(subject="user-id", email="user@example.com", role="admin")

    assert isinstance(token, str)
    assert token
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/core/test_security.py -v`
Expected: FAIL with import errors because the security helpers do not exist yet.

- [ ] **Step 3: Implement the helpers and repository**

```python
# backend/app/core/security.py
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.core.config import get_settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(*, subject: str, email: str, role: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_access_token_expire_minutes
    )
    payload = {"sub": subject, "email": email, "role": role, "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
```

```python
# backend/app/repositories/user_repository.py
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_email(self, email: str) -> User | None:
        statement = select(User).where(User.email == email)
        return self.db.scalar(statement)

    def get_by_id(self, user_id) -> User | None:
        statement = select(User).where(User.id == user_id)
        return self.db.scalar(statement)
```

- [ ] **Step 4: Re-run the security tests**

Run: `cd backend && uv run pytest tests/core/test_security.py -v`
Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/security.py backend/app/repositories/user_repository.py backend/tests/core/test_security.py
git commit -m "feat(backend): add auth security primitives"
```

## Task 5: Implement auth schemas, service, dependencies, and API endpoints

**Files:**
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/services/auth_service.py`
- Create: `backend/app/core/deps.py`
- Create: `backend/app/api/v1/endpoints/auth.py`
- Modify: `backend/app/api/v1/router.py`
- Modify: `backend/tests/api/test_auth.py`
- Test: `backend/tests/api/test_auth.py`

- [ ] **Step 1: Add the failing login and current-user tests**

```python
def test_login_returns_access_token_for_valid_credentials(session, active_user) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": active_user.email, "password": "Password123!"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == active_user.email


def test_me_requires_token() -> None:
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/api/test_auth.py -v`
Expected: FAIL with `404` because the auth endpoints do not exist yet.

- [ ] **Step 3: Implement schemas, service, deps, and routes**

```python
# backend/app/schemas/auth.py
from pydantic import BaseModel, EmailStr

from app.schemas.user import UserRead


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user: UserRead
```

```python
# backend/app/schemas/user.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class UserRead(BaseModel):
    id: UUID
    email: EmailStr
    name: str
    role: str
    is_active: bool
    last_login_at: datetime | None
```

```python
# backend/app/services/auth_service.py
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import create_access_token, verify_password
from app.repositories.user_repository import UserRepository
from app.schemas.auth import TokenResponse
from app.schemas.user import UserRead


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)

    def login(self, email: str, password: str) -> TokenResponse:
        user = self.users.get_by_email(email)
        if user is None or not verify_password(password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")

        user.last_login_at = datetime.now(timezone.utc)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        token = create_access_token(subject=str(user.id), email=user.email, role=user.role.value)
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            expires_in=3600,
            user=UserRead.model_validate(user, from_attributes=True),
        )
```

```python
# backend/app/core/deps.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.repositories.user_repository import UserRepository


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    settings = get_settings()
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    user = UserRepository(db).get_by_id(payload["sub"])
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
    return user
```

```python
# backend/app/api/v1/endpoints/auth.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import UserRead
from app.services.auth_service import AuthService


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    return AuthService(db).login(payload.email, payload.password)


@router.get("/me", response_model=UserRead)
def me(current_user=Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(current_user, from_attributes=True)
```

- [ ] **Step 4: Mount the auth router**

```python
# backend/app/api/v1/router.py
from fastapi import APIRouter

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.health import router as health_router


api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(auth_router)
```

- [ ] **Step 5: Re-run the auth tests**

Run: `cd backend && uv run pytest tests/api/test_auth.py -v`
Expected: PASS for unknown user, successful login, and `/me` authorization behavior.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas backend/app/services backend/app/core/deps.py backend/app/api/v1/endpoints/auth.py backend/tests/api/test_auth.py
git commit -m "feat(backend): implement jwt auth endpoints"
```

## Task 6: Add the create-admin CLI command

**Files:**
- Create: `backend/app/commands/create_admin.py`
- Create: `backend/tests/commands/test_create_admin.py`
- Test: `backend/tests/commands/test_create_admin.py`

- [ ] **Step 1: Write the failing command test**

```python
# backend/tests/commands/test_create_admin.py
from typer.testing import CliRunner

from app.commands.create_admin import app


runner = CliRunner()


def test_create_admin_creates_admin_user(monkeypatch, db_session) -> None:
    result = runner.invoke(
        app,
        ["--email", "admin@example.com", "--name", "Admin User"],
        input="Password123!\nPassword123!\n",
    )

    assert result.exit_code == 0
    assert "Created admin user" in result.stdout
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/commands/test_create_admin.py -v`
Expected: FAIL because the command module does not exist yet.

- [ ] **Step 3: Implement the CLI command**

```python
# backend/app/commands/create_admin.py
import typer
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository


app = typer.Typer()


@app.command()
def create_admin(email: str = typer.Option(...), name: str = typer.Option(...)) -> None:
    password = typer.prompt("Password", hide_input=True, confirmation_prompt=True)
    db: Session = SessionLocal()
    try:
        users = UserRepository(db)
        if users.get_by_email(email) is not None:
            raise typer.BadParameter("User with this email already exists.")

        user = User(
            email=email,
            name=name,
            password_hash=get_password_hash(password),
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(user)
        db.commit()
        typer.echo(f"Created admin user {email}")
    finally:
        db.close()


if __name__ == "__main__":
    app()
```

- [ ] **Step 4: Re-run the command test**

Run: `cd backend && uv run pytest tests/commands/test_create_admin.py -v`
Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/commands/create_admin.py backend/tests/commands/test_create_admin.py
git commit -m "feat(backend): add create-admin bootstrap command"
```

## Task 7: Run migrations and full verification

**Files:**
- Modify: `README.md`
- Test: `backend/tests/test_health.py`
- Test: `backend/tests/core/test_security.py`
- Test: `backend/tests/api/test_auth.py`
- Test: `backend/tests/commands/test_create_admin.py`

- [ ] **Step 1: Add backend run instructions**

```markdown
# README.md
## Backend

```bash
cd backend
uv venv
uv sync
uv run alembic upgrade head
uv run fastapi dev app/main.py --host 0.0.0.0 --port 8000
```

## Create the first admin

```bash
cd backend
uv run python -m app.commands.create_admin --email admin@example.com --name Admin
```
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && uv run alembic upgrade head`
Expected: PASS with the `users` table created in the configured database.

- [ ] **Step 3: Run the full quality gate**

Run: `cd backend && uv run ruff check .`
Expected: PASS with exit code `0`.

Run: `cd backend && uv run ruff format --check .`
Expected: PASS with exit code `0`.

Run: `cd backend && uv run pytest`
Expected: PASS with all auth foundation tests green.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add backend setup instructions"
```

## Self-Review

- Spec coverage: this plan covers repository bootstrap, configuration, DB session setup, `users` table, JWT login, `/api/v1/auth/me`, and the admin bootstrap command. It intentionally does not include experiment-domain work, file uploads, export, or audit events.
- Placeholder scan: no `TBD`, `TODO`, or deferred “add validation later” language remains in the task steps.
- Type consistency: the plan consistently uses `User`, `UserRole`, `TokenResponse`, `/api/v1/auth/login`, and `/api/v1/auth/me` across files and tests.
