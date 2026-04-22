from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit import AuditEvent
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.schemas.audit import AuditEventListResponse, AuditEventRead


class AuditService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = AuditRepository(db)

    def record_event(
        self,
        *,
        actor: User,
        entity_type: str,
        entity_id: UUID,
        action: str,
        before_json: dict | None,
        after_json: dict | None,
        reason: str | None = None,
    ) -> None:
        self.audit.create(
            AuditEvent(
                actor_id=actor.id,
                entity_type=entity_type,
                entity_id=entity_id,
                action=action,
                before_json=before_json,
                after_json=after_json,
                reason=reason,
            )
        )

    def list_events(self, *, entity_type: str, entity_id: UUID) -> AuditEventListResponse:
        items = self.audit.list_for_entity(entity_type=entity_type, entity_id=entity_id)
        return AuditEventListResponse(
            items=[AuditEventRead.model_validate(item) for item in items],
            total=len(items),
        )
