from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_id: UUID
    entity_type: str
    entity_id: UUID
    action: str
    before_json: dict | None
    after_json: dict | None
    reason: str | None
    created_at: datetime


class AuditEventListResponse(BaseModel):
    items: list[AuditEventRead]
    total: int
