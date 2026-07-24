from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class FileAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    experiment_run_id: UUID | None
    sample_id: UUID | None
    characterization_record_id: UUID | None
    entity_type: str | None = None
    entity_id: UUID | None = None
    entity_version: int | None = None
    uploaded_by_id: UUID
    deleted_by_id: UUID | None
    original_name: str
    storage_path: str
    download_url: str
    content_type: str | None
    size_bytes: int
    sha256: str
    method: str
    file_category: str
    asset_role: str
    note: str | None
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    is_deleted: bool


class FileAssetListResponse(BaseModel):
    items: list[FileAssetRead]
    total: int
