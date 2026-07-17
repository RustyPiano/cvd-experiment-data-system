from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Integer, String
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.v2_entities import (
    Instrument,
    InstrumentVersion,
    MaterialLot,
    MaterialLotVersion,
    Setup,
    SetupVersion,
)
from app.repositories.v2_repository import V2EntityRepository
from app.schemas.v2 import (
    V2EntityListResponse,
    V2EntityRead,
    V2EntityVersionListResponse,
    V2EntityVersionPayload,
    V2EntityVersionRead,
)
from app.services.audit_service import AuditService
from app.services.v2_field_source import (
    condition_local_key,
    condition_matches,
    entity_fields_by_key,
    load_field_source,
    missing,
)


@dataclass(frozen=True)
class EntityConfig:
    entity_model: type
    version_model: type
    columns: tuple[str, ...]


ENTITY_CONFIGS = {
    "material_lot": EntityConfig(
        entity_model=MaterialLot,
        version_model=MaterialLotVersion,
        columns=("lot_category", "substance_name", "chemical_formula", "batch_number"),
    ),
    "setup": EntityConfig(
        entity_model=Setup,
        version_model=SetupVersion,
        columns=("setup_code", "setup_name", "zone_count", "orientation", "coordinate_system"),
    ),
    "instrument": EntityConfig(
        entity_model=Instrument,
        version_model=InstrumentVersion,
        columns=("instrument_code", "name_type"),
    ),
}

INTEGER_MIN = -(2**31)
INTEGER_MAX = 2**31 - 1


class V2EntityService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.doc = load_field_source()
        self.fields = entity_fields_by_key(self.doc)
        self.audit = AuditService(db)

    def list_entities(self, kind: str) -> V2EntityListResponse:
        repo = self._repo(kind)
        items = [
            self._entity_read(kind, entity, repo.latest_version(entity.id))
            for entity in repo.list_entities()
        ]
        return V2EntityListResponse(items=items, total=len(items))

    def create_entity(
        self, kind: str, payload: V2EntityVersionPayload, current_user: User
    ) -> V2EntityRead:
        repo = self._repo(kind)
        entity = repo.create_entity()
        version = self._build_version(kind, entity.id, 1, payload)
        repo.save_version(version)
        self.audit.record_event(
            actor=current_user,
            entity_type=kind,
            entity_id=entity.id,
            action="create",
            before_json=None,
            after_json={"kind": kind, "entity_id": str(entity.id), "version": 1},
        )
        self.db.commit()
        return self._entity_read(kind, entity, version)

    def get_entity(self, kind: str, entity_id: UUID) -> V2EntityRead:
        repo = self._repo(kind)
        entity = repo.get_entity(entity_id)
        if entity is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
        return self._entity_read(kind, entity, repo.latest_version(entity.id))

    def list_versions(self, kind: str, entity_id: UUID) -> V2EntityVersionListResponse:
        repo = self._repo(kind)
        if repo.get_entity(entity_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
        items = [self._version_read(kind, version) for version in repo.list_versions(entity_id)]
        return V2EntityVersionListResponse(items=items, total=len(items))

    def append_version(
        self,
        kind: str,
        entity_id: UUID,
        payload: V2EntityVersionPayload,
        current_user: User,
    ) -> V2EntityVersionRead:
        repo = self._repo(kind)
        if repo.get_entity(entity_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
        version = self._build_version(kind, entity_id, repo.next_version(entity_id), payload)
        try:
            repo.save_version(version)
            AuditService(self.db).record_event(
                actor=current_user,
                entity_type=kind,
                entity_id=entity_id,
                action="append_entity_version",
                before_json=None,
                after_json={
                    "kind": kind,
                    "entity_id": str(entity_id),
                    "version": version.version,
                },
            )
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Version already exists"
            ) from exc
        return self._version_read(kind, version)

    def get_version(self, kind: str, entity_id: UUID, version: int) -> Any:
        row = self._repo(kind).get_version(entity_id, version)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
        return row

    def _repo(self, kind: str) -> V2EntityRepository:
        config = ENTITY_CONFIGS[kind]
        return V2EntityRepository(self.db, config.entity_model, config.version_model)

    def _build_version(
        self,
        kind: str,
        entity_id: UUID,
        version_number: int,
        payload: V2EntityVersionPayload,
    ) -> Any:
        config = ENTITY_CONFIGS[kind]
        data = payload.model_dump()
        allowed = {field["key"] for field in self.fields[kind]} - {"version"}
        unknown = sorted(set(data) - allowed)
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Unknown {kind} field keys: {', '.join(unknown)}",
            )
        self._validate_entity_payload(kind, data)
        fields = {field["key"]: field for field in self.fields[kind]}
        for key, value in data.items():
            if missing(value):
                continue
            if str(fields[key].get("input") or "").strip() == "数值":
                try:
                    column_type = (
                        config.version_model.__table__.columns[key].type
                        if key in config.columns
                        else None
                    )
                    if isinstance(column_type, Integer):
                        if isinstance(value, bool):
                            raise ValueError
                        if isinstance(value, float) and not value.is_integer():
                            raise ValueError
                        converted = int(value)
                        if not INTEGER_MIN <= converted <= INTEGER_MAX:
                            raise ValueError
                        data[key] = converted
                    else:
                        if isinstance(value, bool):
                            raise ValueError
                        converted = float(value)
                        if not isfinite(converted):
                            raise ValueError
                        data[key] = converted
                except (TypeError, ValueError) as exc:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail={"invalid": [{"key": key, "reason": "type"}]},
                    ) from exc
            if key in config.columns:
                column_type = config.version_model.__table__.columns[key].type
                if (
                    isinstance(column_type, String)
                    and column_type.length is not None
                    and len(str(data[key])) > column_type.length
                ):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail={"invalid": [{"key": key, "reason": "length"}]},
                    )
        column_values = {key: data[key] for key in config.columns}
        attrs = {key: value for key, value in data.items() if key not in config.columns}
        return config.version_model(
            entity_id=entity_id,
            version=version_number,
            attrs=attrs,
            **column_values,
        )

    def _validate_entity_payload(self, kind: str, data: dict[str, Any]) -> None:
        field_devices = data.get("field_devices")
        if (
            kind == "setup"
            and isinstance(field_devices, list)
            and "无" in field_devices
            and len(field_devices) > 1
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": [{"key": "field_devices", "reason": "value"}]},
            )
        missing_fields: list[str] = []
        for field in self.fields[kind]:
            key = field["key"]
            level = field["requirement"]["level"]
            if level == "required" and key != "version" and missing(data.get(key)):
                missing_fields.append(key)
            condition = field["requirement"].get("condition")
            local_key = condition_local_key(field, condition, self.doc)
            if (
                level == "conditional_required"
                and condition
                and local_key
                and condition_matches(condition, data.get(local_key))
                and missing(data.get(key))
            ):
                missing_fields.append(key)
        if missing_fields:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"missing": missing_fields},
            )

    def _entity_read(self, kind: str, entity: Any, latest_version: Any | None) -> V2EntityRead:
        return V2EntityRead(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            latest_version=self._version_read(kind, latest_version) if latest_version else None,
        )

    def _version_read(self, kind: str, version: Any) -> V2EntityVersionRead:
        config = ENTITY_CONFIGS[kind]
        data = {key: getattr(version, key) for key in config.columns}
        data.update(version.attrs)
        return V2EntityVersionRead(
            id=version.id,
            entity_id=version.entity_id,
            version=version.version,
            data=data,
            created_at=version.created_at,
        )
