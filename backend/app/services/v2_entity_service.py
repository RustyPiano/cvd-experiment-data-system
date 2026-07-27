from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from math import isfinite
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import BaseModel, ValidationError
from sqlalchemy import Integer, String
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.models.v2_entities import (
    Instrument,
    InstrumentVersion,
    MaterialLot,
    MaterialLotVersion,
    Setup,
    SetupVersion,
)
from app.repositories.file_asset_repository import FileAssetRepository
from app.repositories.v2_repository import V2EntityRepository
from app.schemas.generated.v2_module_payload import (
    TemperatureSensorPayload,
    TubeMaterialShapePayload,
)
from app.schemas.v2 import (
    V2EntityListResponse,
    V2EntityRead,
    V2EntityVersionListResponse,
    V2EntityVersionRead,
)
from app.services.audit_service import AuditService
from app.services.entity_file_service import ENTITY_ASSET_ROLE
from app.services.v2_entity_snapshot_service import FIXED_COORDINATE_SYSTEM
from app.services.v2_field_source import (
    canonical_option_value,
    condition_local_key,
    condition_matches,
    entity_fields_by_key,
    field_option_values,
    load_field_source,
    missing,
    validate_chemical_formula,
    validate_material_formula,
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
COMPOSITE_INPUTS = {"数值+下拉", "下拉+数值", "文本+下拉", "下拉+文本", "文本+数值"}
SUBSTRATE_FORMULAS = {
    "sio2_si": {"Si", "SiO2"},
    "sapphire_al2o3": {"Al2O3"},
    "quartz": {"SiO2"},
    "cu_foil": {"Cu"},
    "au_foil": {"Au"},
    "h-BN": {"BN"},
}


class V2EntityService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.doc = load_field_source()
        self.fields = entity_fields_by_key(self.doc)
        self.audit = AuditService(db)
        self.files = FileAssetRepository(db)

    def list_entities(self, kind: str) -> V2EntityListResponse:
        repo = self._repo(kind)
        items = [
            self._entity_read(kind, entity, repo.latest_version(entity.id))
            for entity in repo.list_entities()
        ]
        return V2EntityListResponse(items=items, total=len(items))

    def create_entity(self, kind: str, payload: BaseModel, current_user: User) -> V2EntityRead:
        repo = self._repo(kind)
        entity = repo.create_entity()
        version = self._build_version(kind, entity.id, 1, payload, current_user)
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
        payload: BaseModel,
        current_user: User,
    ) -> V2EntityVersionRead:
        repo = self._repo(kind)
        if repo.get_entity(entity_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
        version = self._build_version(
            kind,
            entity_id,
            repo.next_version(entity_id),
            payload,
            current_user,
        )
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
        payload: BaseModel,
        current_user: User,
    ) -> Any:
        config = ENTITY_CONFIGS[kind]
        data = payload.model_dump()
        if kind == "setup":
            data["coordinate_system"] = FIXED_COORDINATE_SYSTEM
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
            field = fields[key]
            input_type = str(field.get("input") or "")
            if input_type in COMPOSITE_INPUTS and isinstance(value, dict):
                data[key] = self._normalize_composite_value(key, input_type, value, field)
                value = data[key]
            if missing(value):
                if value is not None and (field.get("validation") or {}).get("require_value"):
                    self._raise_invalid(key, "value")
                continue
            if input_type in COMPOSITE_INPUTS:
                if not isinstance(value, dict):
                    data[key] = self._normalize_composite_value(key, input_type, value, field)
                    value = data[key]
            elif "下拉" in input_type or "多选" in input_type:
                data[key] = canonical_option_value(value, self.doc, field_key=key)
                value = data[key]
                if "其他" not in input_type:
                    allowed_values = field_option_values(key, self.doc)
                    candidates = value if isinstance(value, list) else [value]
                    if any(candidate not in allowed_values for candidate in candidates):
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                            detail={"invalid": [{"key": key, "reason": "value"}]},
                        )
            if key == "chemical_formula":
                try:
                    validator = (
                        validate_material_formula
                        if kind == "material_lot"
                        else validate_chemical_formula
                    )
                    data[key] = validator(str(value))
                except ValueError as exc:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail={"invalid": [{"key": key, "reason": "value"}]},
                    ) from exc
            if key == "tube_outer_diameter_wall_mm":
                data[key] = self._normalize_tube_dimensions(
                    key,
                    value,
                    shape=(data.get("tube_material_shape") or {}).get("shape"),
                )
                value = data[key]
            elif key == "tube_material_shape":
                data[key] = self._normalize_tube_material_shape(key, value)
                value = data[key]
            elif key == "temperature_sensors":
                data[key] = self._normalize_temperature_sensors(
                    key,
                    value,
                    zone_count=data.get("zone_count"),
                )
                value = data[key]
            if input_type == "日期":
                try:
                    data[key] = date.fromisoformat(str(value)).isoformat()
                except ValueError as exc:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail={"invalid": [{"key": key, "reason": "value"}]},
                    ) from exc
            if "FileAsset引用" in input_type:
                data[key] = self._file_asset_snapshot(
                    key,
                    value,
                    kind=kind,
                    entity_id=entity_id,
                    version_number=version_number,
                    current_user=current_user,
                )
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
                    self._validate_numeric_boundary(key, data[key], field)
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
        if kind == "material_lot" and data.get("lot_category") == "substrate":
            expected = SUBSTRATE_FORMULAS.get(data.get("substrate_material"))
            if expected is not None and data.get("chemical_formula") not in expected:
                self._raise_invalid("chemical_formula", "identity")
        column_values = {key: data[key] for key in config.columns}
        attrs = {key: value for key, value in data.items() if key not in config.columns}
        return config.version_model(
            entity_id=entity_id,
            version=version_number,
            attrs=attrs,
            **column_values,
        )

    def _normalize_composite_value(
        self,
        key: str,
        input_type: str,
        raw: Any,
        field: dict[str, Any],
    ) -> dict[str, Any]:
        free_text_option = input_type == "文本+数值"
        allowed_options = set() if free_text_option else field_option_values(key, self.doc)
        if isinstance(raw, dict):
            if set(raw) - {"value", "option"}:
                self._raise_invalid(key, "value")
            free_value = raw.get("value")
            option = raw.get("option")
            if not free_text_option:
                option = canonical_option_value(option, self.doc, field_key=key)
        else:
            if free_text_option:
                self._raise_invalid(key, "value")
            canonical = canonical_option_value(raw, self.doc, field_key=key)
            if canonical in allowed_options:
                free_value, option = None, canonical
            else:
                free_value, option = raw, None

        if free_text_option:
            if not isinstance(option, str) or not (option := option.strip()):
                self._raise_invalid(key, "value")
        elif option is not None and option not in allowed_options:
            self._raise_invalid(key, "value")
        if free_value == "":
            free_value = None
        if "数值" in input_type and free_value is not None:
            try:
                if isinstance(free_value, bool):
                    raise ValueError
                free_value = float(free_value)
                if not isfinite(free_value):
                    raise ValueError
            except (TypeError, ValueError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"invalid": [{"key": key, "reason": "type"}]},
                ) from exc
            self._validate_numeric_boundary(key, free_value, field)
        elif free_value is not None and not isinstance(free_value, str):
            self._raise_invalid(key, "type")
        validation = field.get("validation") or {}
        if validation.get("require_value") and (
            free_value is None or (isinstance(free_value, str) and not free_value.strip())
        ):
            self._raise_invalid(key, "value")
        if validation.get("require_option") and option is None:
            self._raise_invalid(key, "value")
        if free_value is None and option is None:
            self._raise_invalid(key, "value")
        return {"value": free_value, "option": option}

    def _normalize_tube_dimensions(
        self,
        key: str,
        raw: Any,
        *,
        shape: Any,
    ) -> dict[str, float | str]:
        if not isinstance(raw, dict):
            self._raise_invalid(key, "value")
        raw = {name: value for name, value in raw.items() if value is not None}
        normalized_shape = canonical_option_value(shape, self.doc, field_key="shape")
        required_by_shape = {
            "round": {"outer_diameter_mm", "wall_thickness_mm"},
            "square": {"outer_side_mm", "wall_thickness_mm"},
            "rectangular": {
                "outer_width_mm",
                "outer_height_mm",
                "wall_thickness_mm",
            },
            "other": {"dimension_description"},
        }
        required = required_by_shape.get(normalized_shape)
        if required is None or set(raw) != required:
            self._raise_invalid(key, "value")
        if normalized_shape == "other":
            description = raw.get("dimension_description")
            if not isinstance(description, str) or not description.strip():
                self._raise_invalid(key, "value")
            return {"dimension_description": description.strip()}
        try:
            values = {item: float(raw[item]) for item in required}
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": [{"key": key, "reason": "type"}]},
            ) from exc
        if not all(isfinite(value) and value > 0 for value in values.values()):
            self._raise_invalid(key, "value")
        wall = values["wall_thickness_mm"]
        outer_sizes = [value for name, value in values.items() if name != "wall_thickness_mm"]
        if any(wall * 2 >= outer for outer in outer_sizes):
            self._raise_invalid(key, "value")
        return values

    def _normalize_tube_material_shape(self, key: str, raw: Any) -> dict[str, Any]:
        if not isinstance(raw, dict):
            self._raise_invalid(key, "type")
        normalized = {
            **raw,
            "material": canonical_option_value(raw.get("material"), self.doc, field_key="material"),
            "shape": canonical_option_value(raw.get("shape"), self.doc, field_key="shape"),
        }
        try:
            return TubeMaterialShapePayload.model_validate(normalized).model_dump()
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": [{"key": key, "reason": "value"}]},
            ) from exc

    def _normalize_temperature_sensors(
        self,
        key: str,
        raw: Any,
        *,
        zone_count: object,
    ) -> list[dict[str, Any]]:
        if not isinstance(raw, list):
            self._raise_invalid(key, "type")
        try:
            sensors = [
                TemperatureSensorPayload.model_validate(
                    {
                        **item,
                        "uncertainty_source": canonical_option_value(
                            item.get("uncertainty_source"),
                            self.doc,
                            field_key="uncertainty_source",
                        ),
                    }
                )
                for item in raw
                if isinstance(item, dict)
            ]
            zones = [sensor.zone_index for sensor in sensors]
            if len(sensors) != len(raw) or len(zones) != len(set(zones)):
                raise ValueError
            maximum_zone = int(zone_count)
            if len(zones) != maximum_zone or any(
                zone != expected for expected, zone in enumerate(sorted(zones), start=1)
            ):
                raise ValueError
        except (TypeError, ValueError, ValidationError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": [{"key": key, "reason": "value"}]},
            ) from exc
        return [sensor.model_dump(exclude_none=True) for sensor in sensors]

    def _file_asset_snapshot(
        self,
        key: str,
        raw: Any,
        *,
        kind: str,
        entity_id: UUID,
        version_number: int,
        current_user: User,
    ) -> dict[str, Any]:
        if not isinstance(raw, dict) or not {"file_asset_id", "sha256"} <= set(raw):
            self._raise_invalid(key, "value")
        try:
            file_id = UUID(str(raw["file_asset_id"]))
        except (TypeError, ValueError, AttributeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": [{"key": key, "reason": "value"}]},
            ) from exc
        asset = self.files.get_by_id_for_update(file_id)
        if (
            asset is None
            or asset.deleted_at is not None
            or str(raw.get("sha256") or "") != asset.sha256
            or asset.experiment_run_id is not None
            or asset.asset_role != ENTITY_ASSET_ROLE
            or any(
                value is not None
                for value in (asset.entity_type, asset.entity_id, asset.entity_version)
            )
            or (current_user.role != UserRole.ADMIN and asset.uploaded_by_id != current_user.id)
        ):
            self._raise_invalid(key, "reference")
        asset.entity_type = kind
        asset.entity_id = entity_id
        asset.entity_version = version_number
        snapshot: dict[str, Any] = {
            "file_asset_id": str(asset.id),
            "sha256": asset.sha256,
            "original_name": asset.original_name,
            "size_bytes": asset.size_bytes,
        }
        note = raw.get("note")
        if note is not None:
            if not isinstance(note, str):
                self._raise_invalid(key, "type")
            snapshot["note"] = note.strip()
        return snapshot

    def _validate_numeric_boundary(
        self, key: str, value: int | float, field: dict[str, Any]
    ) -> None:
        validation = field.get("validation") or {}
        checks = (
            ("ge", lambda bound: value >= bound),
            ("gt", lambda bound: value > bound),
            ("le", lambda bound: value <= bound),
            ("lt", lambda bound: value < bound),
        )
        if any(name in validation and not check(validation[name]) for name, check in checks):
            self._raise_invalid(key, "range")

    @staticmethod
    def _raise_invalid(key: str, reason: str) -> None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"invalid": [{"key": key, "reason": reason}]},
        )

    def _validate_entity_payload(self, kind: str, data: dict[str, Any]) -> None:
        field_devices = data.get("field_devices")
        if (
            kind == "setup"
            and isinstance(field_devices, list)
            and any(value in {"none", "无"} for value in field_devices)
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
            if (
                condition
                and local_key
                and not condition_matches(condition, data.get(local_key))
                and not missing(data.get(key))
            ):
                self._raise_invalid(key, "not_applicable")
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
