from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models.field_definition import FieldDefinition


class FieldDefinitionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, field_def: FieldDefinition) -> FieldDefinition:
        self.db.add(field_def)
        self.db.flush()
        self.db.refresh(field_def)
        return field_def

    def save(self, field_def: FieldDefinition) -> FieldDefinition:
        self.db.flush()
        self.db.refresh(field_def)
        return field_def

    def get_by_id(self, field_id: UUID) -> FieldDefinition | None:
        return self.db.get(FieldDefinition, field_id)

    def get_by_module_and_key(self, module_key: str, field_key: str) -> FieldDefinition | None:
        stmt = Select(FieldDefinition).where(
            FieldDefinition.module_key == module_key,
            FieldDefinition.field_key == field_key,
        )
        return self.db.scalar(stmt)

    def list_entries(
        self,
        module_key: str | None = None,
        is_active: bool | None = None,
        offset: int = 0,
        limit: int = 200,
    ) -> list[FieldDefinition]:
        stmt = Select(FieldDefinition).order_by(
            FieldDefinition.module_key.asc(),
            FieldDefinition.sort_order.asc(),
            FieldDefinition.field_key.asc(),
        )
        if module_key is not None:
            stmt = stmt.where(FieldDefinition.module_key == module_key)
        if is_active is not None:
            stmt = stmt.where(FieldDefinition.is_active == is_active)
        return list(self.db.scalars(stmt.offset(offset).limit(limit)).all())

    def count(
        self,
        module_key: str | None = None,
        is_active: bool | None = None,
    ) -> int:
        stmt = select(func.Count()).select_from(FieldDefinition)
        if module_key is not None:
            stmt = stmt.where(FieldDefinition.module_key == module_key)
        if is_active is not None:
            stmt = stmt.where(FieldDefinition.is_active == is_active)
        return self.db.scalar(stmt) or 0
