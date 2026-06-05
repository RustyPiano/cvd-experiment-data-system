from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.setup_library import SetupLibraryEntry, SetupVisibility
from app.models.user import User, UserRole


class SetupLibraryRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, entry_id: UUID) -> SetupLibraryEntry | None:
        return self.db.get(SetupLibraryEntry, entry_id)

    def list_visible(self, current_user: User) -> list[SetupLibraryEntry]:
        statement = (
            select(SetupLibraryEntry)
            .options(joinedload(SetupLibraryEntry.owner))
            .where(SetupLibraryEntry.is_active.is_(True))
        )
        if current_user.role != UserRole.ADMIN:
            statement = statement.where(
                or_(
                    SetupLibraryEntry.owner_id == current_user.id,
                    SetupLibraryEntry.visibility == SetupVisibility.GROUP,
                )
            )
        statement = statement.order_by(SetupLibraryEntry.updated_at.desc())
        return list(self.db.scalars(statement).all())

    def save(self, entry: SetupLibraryEntry) -> SetupLibraryEntry:
        self.db.add(entry)
        self.db.flush()
        self.db.refresh(entry)
        return entry
