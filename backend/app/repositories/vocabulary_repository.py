from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.vocabulary import ControlledVocabulary


class VocabularyRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, entry: ControlledVocabulary) -> ControlledVocabulary:
        self.db.add(entry)
        self.db.flush()
        self.db.refresh(entry)
        return entry

    def save(self, entry: ControlledVocabulary) -> ControlledVocabulary:
        self.db.add(entry)
        self.db.flush()
        self.db.refresh(entry)
        return entry

    def get_by_id(self, vocab_id: UUID) -> ControlledVocabulary | None:
        statement = select(ControlledVocabulary).where(ControlledVocabulary.id == vocab_id)
        return self.db.scalar(statement)

    def get_by_key_value(self, vocab_key: str, value: str) -> ControlledVocabulary | None:
        statement = select(ControlledVocabulary).where(
            ControlledVocabulary.vocab_key == vocab_key,
            ControlledVocabulary.value == value,
        )
        return self.db.scalar(statement)

    def get_active_by_key_value(self, vocab_key: str, value: str) -> ControlledVocabulary | None:
        statement = select(ControlledVocabulary).where(
            ControlledVocabulary.vocab_key == vocab_key,
            ControlledVocabulary.value == value,
            ControlledVocabulary.is_active.is_(True),
        )
        return self.db.scalar(statement)

    def list_entries(
        self,
        *,
        vocab_key: str | None = None,
        active_only: bool = False,
    ) -> list[ControlledVocabulary]:
        statement = select(ControlledVocabulary)
        if vocab_key is not None:
            statement = statement.where(ControlledVocabulary.vocab_key == vocab_key)
        if active_only:
            statement = statement.where(ControlledVocabulary.is_active.is_(True))

        statement = statement.order_by(
            ControlledVocabulary.vocab_key.asc(),
            ControlledVocabulary.sort_order.asc(),
            ControlledVocabulary.value.asc(),
        )
        return list(self.db.scalars(statement).all())
