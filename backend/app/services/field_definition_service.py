from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.field_definition import FieldDefinition
from app.models.user import User, UserRole
from app.repositories.field_definition_repository import FieldDefinitionRepository
from app.schemas.field_definition import (
    FieldDefinitionCreate,
    FieldDefinitionListResponse,
    FieldDefinitionRead,
    FieldDefinitionUpdate,
)
from app.services.audit_service import AuditService


class FieldDefinitionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = AuditService(db)
        self.field_definitions = FieldDefinitionRepository(db)

    def list_active_definitions(
        self,
        *,
        module_key: str | None = None,
    ) -> FieldDefinitionListResponse:
        items = self.field_definitions.list_entries(module_key=module_key, is_active=True)
        total = self.field_definitions.count(module_key=module_key, is_active=True)
        return FieldDefinitionListResponse(
            items=[FieldDefinitionRead.model_validate(item) for item in items],
            total=total,
        )

    def list_admin_definitions(
        self,
        *,
        current_user: User,
        module_key: str | None = None,
    ) -> FieldDefinitionListResponse:
        self._require_admin(current_user)
        items = self.field_definitions.list_entries(module_key=module_key)
        total = self.field_definitions.count(module_key=module_key)
        return FieldDefinitionListResponse(
            items=[FieldDefinitionRead.model_validate(item) for item in items],
            total=total,
        )

    def create_definition(
        self,
        payload: FieldDefinitionCreate,
        current_user: User,
    ) -> FieldDefinitionRead:
        self._require_admin(current_user)
        entry = FieldDefinition(**payload.model_dump())
        try:
            saved = self.field_definitions.create(entry)
            self.audit.record_event(
                actor=current_user,
                entity_type="field_definition",
                entity_id=saved.id,
                action="create",
                before_json=None,
                after_json=self._serialize_definition(saved),
            )
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Field definition already exists",
            ) from exc
        return FieldDefinitionRead.model_validate(saved)

    def update_definition(
        self,
        field_id: UUID,
        payload: FieldDefinitionUpdate,
        current_user: User,
    ) -> FieldDefinitionRead:
        self._require_admin(current_user)
        entry = self.field_definitions.get_by_id(field_id)
        if entry is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Field definition not found",
            )

        updates = payload.model_dump(exclude_unset=True)
        before = self._serialize_definition(entry)
        for field, value in updates.items():
            setattr(entry, field, value)

        try:
            saved = self.field_definitions.save(entry)
            self.audit.record_event(
                actor=current_user,
                entity_type="field_definition",
                entity_id=saved.id,
                action="update",
                before_json=before,
                after_json=self._serialize_definition(saved),
            )
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Field definition already exists",
            ) from exc
        return FieldDefinitionRead.model_validate(saved)

    def deactivate_definition(self, field_id: UUID, current_user: User) -> FieldDefinitionRead:
        self._require_admin(current_user)
        entry = self.field_definitions.get_by_id(field_id)
        if entry is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Field definition not found",
            )
        before = self._serialize_definition(entry)
        entry.is_active = False
        saved = self.field_definitions.save(entry)
        self.audit.record_event(
            actor=current_user,
            entity_type="field_definition",
            entity_id=saved.id,
            action="deactivate",
            before_json=before,
            after_json=self._serialize_definition(saved),
        )
        self.db.commit()
        return FieldDefinitionRead.model_validate(saved)

    def reactivate_definition(self, field_id: UUID, current_user: User) -> FieldDefinitionRead:
        self._require_admin(current_user)
        entry = self.field_definitions.get_by_id(field_id)
        if entry is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Field definition not found",
            )
        before = self._serialize_definition(entry)
        entry.is_active = True
        saved = self.field_definitions.save(entry)
        self.audit.record_event(
            actor=current_user,
            entity_type="field_definition",
            entity_id=saved.id,
            action="reactivate",
            before_json=before,
            after_json=self._serialize_definition(saved),
        )
        self.db.commit()
        return FieldDefinitionRead.model_validate(saved)

    def get_definition(self, field_id: UUID) -> FieldDefinitionRead:
        entry = self.field_definitions.get_by_id(field_id)
        if entry is None or not entry.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Field definition not found",
            )
        return FieldDefinitionRead.model_validate(entry)

    def _require_admin(self, current_user: User) -> None:
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

    def _serialize_definition(self, entry: FieldDefinition) -> dict:
        return {
            "id": str(entry.id),
            "field_key": entry.field_key,
            "module_key": entry.module_key,
            "label_zh": entry.label_zh,
            "label_en": entry.label_en,
            "field_type": entry.field_type,
            "unit": entry.unit,
            "required": entry.required,
            "default_strategy": entry.default_strategy,
            "inheritable": entry.inheritable,
            "vocab_key": entry.vocab_key,
            "sort_order": entry.sort_order,
            "is_active": entry.is_active,
            "metadata_json": entry.metadata_json,
        }
