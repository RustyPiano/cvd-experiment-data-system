from datetime import UTC, datetime
from secrets import compare_digest

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.auth import RegisterRequest, TokenResponse
from app.schemas.user import UserRead


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)

    def login(self, email: str, password: str) -> TokenResponse:
        user = self.users.get_by_email(email)
        if user is None or not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Inactive user",
            )

        user.last_login_at = datetime.now(UTC)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        return self._build_token_response(user)

    def register(self, payload: RegisterRequest) -> TokenResponse:
        settings = get_settings()
        expected_invite_code = (settings.registration_invite_code or "").strip()
        if not expected_invite_code or not compare_digest(
            payload.invite_code,
            expected_invite_code,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid invite code",
            )

        if self.users.get_by_email_case_insensitive(payload.email) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User with this email already exists",
            )

        user = User(
            email=payload.email,
            name=payload.name,
            password_hash=get_password_hash(payload.password),
            role=UserRole.MEMBER,
            is_active=True,
            last_login_at=datetime.now(UTC),
        )
        self.db.add(user)
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User with this email already exists",
            ) from exc
        self.db.refresh(user)

        return self._build_token_response(user)

    def _build_token_response(self, user: User) -> TokenResponse:
        settings = get_settings()
        return TokenResponse(
            access_token=create_access_token(
                subject=str(user.id),
            ),
            token_type="bearer",
            expires_in=settings.jwt_access_token_expire_minutes * 60,
            user=UserRead.model_validate(user),
        )
