from __future__ import annotations

import base64
import hashlib
import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.sample import Sample
from app.models.scientific import (
    MaterialAssertion,
    PropertyValue,
    RunFeature,
    RunRevision,
)
from app.models.user import User, UserRole
from app.models.v2_results import CharacterizationRecord
from app.schemas.scientific import (
    DatasetFilter,
    DatasetQuery,
    DatasetQueryResponse,
    DatasetRunRead,
)
from app.services.v2_field_source import load_field_source

FEATURE_FIELDS = {
    "target_formula": "target_formula",
    "architecture_type": "architecture_type",
    "setup_id": "setup_id",
    "material_lot_id": "material_lot_id",
    "substrate_material": "substrate_material",
    "max_temperature_C": "max_temperature_C",
    "ramp_rate_C_min": "ramp_rate_C_min",
    "growth_duration_s": "growth_duration_s",
    "pressure_min_Pa": "pressure_min_Pa",
    "pressure_max_Pa": "pressure_max_Pa",
    "gas_species": "gas_species",
    "has_process_event": "has_process_event",
    "provenance_complete": "provenance_complete",
}
NUMERIC_FIELDS = {
    "max_temperature_C",
    "ramp_rate_C_min",
    "growth_duration_s",
    "pressure_min_Pa",
    "pressure_max_Pa",
}
BOOLEAN_FIELDS = {"has_process_event", "provenance_complete"}
UNITS_REGISTRY = {
    "max_temperature_C": "℃",
    "ramp_rate_C_min": "℃/min",
    "growth_duration_s": "s",
    "pressure_min_Pa": "Pa",
    "pressure_max_Pa": "Pa",
}


class DatasetQueryService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def query(self, payload: DatasetQuery, actor: User) -> DatasetQueryResponse:
        statement = (
            select(RunRevision, ExperimentRun)
            .join(ExperimentRun, ExperimentRun.current_revision_id == RunRevision.id)
            .where(
                RunRevision.status.in_(["locked", "reviewed"]),
                ExperimentRun.status.in_([ExperimentStatus.LOCKED, ExperimentStatus.REVIEWED]),
            )
        )
        if actor.role != UserRole.ADMIN:
            statement = statement.where(
                or_(
                    ExperimentRun.owner_id == actor.id,
                    ExperimentRun.status.in_([ExperimentStatus.LOCKED, ExperimentStatus.REVIEWED]),
                )
            )
        for item in payload.filters:
            statement = statement.where(self._filter_clause(item))
        if payload.cursor:
            locked_at, revision_id = self._decode_cursor(payload.cursor)
            statement = statement.where(
                or_(
                    RunRevision.locked_at < locked_at,
                    and_(
                        RunRevision.locked_at == locked_at,
                        RunRevision.id < revision_id,
                    ),
                )
            )
        rows = list(
            self.db.execute(
                statement.order_by(RunRevision.locked_at.desc(), RunRevision.id.desc()).limit(
                    payload.limit + 1
                )
            )
        )
        has_more = len(rows) > payload.limit
        rows = rows[: payload.limit]
        revision_ids = [row.RunRevision.id for row in rows]
        features_by_revision: dict[UUID, dict[str, Any]] = {
            revision_id: {} for revision_id in revision_ids
        }
        if revision_ids:
            for feature in self.db.scalars(
                select(RunFeature)
                .where(RunFeature.run_revision_id.in_(revision_ids))
                .order_by(RunFeature.feature_code, RunFeature.ordinal)
            ):
                value = (
                    feature.numeric_value
                    if feature.numeric_value is not None
                    else feature.boolean_value
                    if feature.boolean_value is not None
                    else feature.text_value
                )
                target = features_by_revision[feature.run_revision_id]
                existing = target.get(feature.feature_code)
                if existing is None:
                    target[feature.feature_code] = value
                elif isinstance(existing, list):
                    existing.append(value)
                else:
                    target[feature.feature_code] = [existing, value]
        items: list[DatasetRunRead] = []
        for row in rows:
            revision = row.RunRevision
            run = row.ExperimentRun
            features = features_by_revision[revision.id]
            formulas = features.get("target_formula", [])
            if not isinstance(formulas, list):
                formulas = [formulas]
            items.append(
                DatasetRunRead(
                    run_id=run.id,
                    run_revision_id=revision.id,
                    run_code=run.run_code,
                    revision_number=revision.revision_number,
                    locked_at=revision.locked_at,
                    target_formulas=[str(value) for value in formulas if value],
                    features=features,
                    provenance_complete=bool(features.get("provenance_complete", False)),
                )
            )
        next_cursor = (
            self._encode_cursor(rows[-1].RunRevision.locked_at, rows[-1].RunRevision.id)
            if has_more and rows
            else None
        )
        manifest = self._manifest(payload)
        return DatasetQueryResponse(
            items=items,
            next_cursor=next_cursor,
            query_manifest=manifest,
        )

    def _filter_clause(self, item: DatasetFilter) -> Any:
        if item.field == "property":
            if not item.property_code:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="property filter requires property_code",
                )
            value_clause = self._comparison(
                PropertyValue.numeric_value,
                item.operator,
                item.value,
            )
            return exists(
                select(PropertyValue.id)
                .join(
                    CharacterizationRecord,
                    CharacterizationRecord.id == PropertyValue.measurement_run_id,
                )
                .join(Sample, Sample.id == PropertyValue.sample_id)
                .where(
                    Sample.experiment_run_id == RunRevision.experiment_run_id,
                    CharacterizationRecord.run_revision_id == RunRevision.id,
                    PropertyValue.property_code == item.property_code,
                    value_clause,
                )
            )
        if item.field == "growth_presence":
            return exists(
                select(MaterialAssertion.id)
                .join(
                    CharacterizationRecord,
                    CharacterizationRecord.id == MaterialAssertion.measurement_run_id,
                )
                .join(Sample, Sample.id == MaterialAssertion.sample_id)
                .where(
                    Sample.experiment_run_id == RunRevision.experiment_run_id,
                    CharacterizationRecord.run_revision_id == RunRevision.id,
                    MaterialAssertion.assertion_type == "growth_presence",
                    MaterialAssertion.validity == "active",
                    self._comparison(
                        MaterialAssertion.value_json["state"].as_string(),
                        item.operator,
                        item.value,
                    ),
                )
            )
        feature_code = FEATURE_FIELDS[item.field]
        column = (
            RunFeature.numeric_value
            if item.field in NUMERIC_FIELDS
            else RunFeature.boolean_value
            if item.field in BOOLEAN_FIELDS
            else RunFeature.text_value
        )
        return exists(
            select(RunFeature.id).where(
                RunFeature.run_revision_id == RunRevision.id,
                RunFeature.feature_code == feature_code,
                self._comparison(column, item.operator, item.value),
            )
        )

    @staticmethod
    def _comparison(column: Any, operator: str, value: Any) -> Any:
        if operator == "eq":
            return column == value
        if operator == "ne":
            return column != value
        if operator == "lt":
            return column < value
        if operator == "lte":
            return column <= value
        if operator == "gt":
            return column > value
        if operator == "gte":
            return column >= value
        if operator == "contains":
            return column.ilike(f"%{value}%")
        if operator == "between":
            if not isinstance(value, list) or len(value) != 2:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="between requires a two-value list",
                )
            return column.between(value[0], value[1])
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Unsupported dataset filter operator",
        )

    @staticmethod
    def _manifest(payload: DatasetQuery) -> dict[str, Any]:
        meta = load_field_source()["meta"]
        query = payload.model_dump(mode="json", exclude_none=True)
        query_json = json.dumps(
            query,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return {
            "query": query,
            "query_sha256": hashlib.sha256(query_json.encode()).hexdigest(),
            "schema_version": meta["version"],
            "schema_status": meta["status"],
            "generated_at": datetime.now(UTC).isoformat(),
            "units_registry": UNITS_REGISTRY,
            "missing_value_states": [
                "unknown",
                "not_measured",
                "not_applicable",
                "below_detection_limit",
            ],
            "feature_definitions": {
                code: {"unit": unit, "source": "immutable run projection"}
                for code, unit in UNITS_REGISTRY.items()
            },
        }

    @staticmethod
    def _encode_cursor(locked_at: datetime, revision_id: UUID) -> str:
        raw = f"{locked_at.isoformat()}|{revision_id}".encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    @staticmethod
    def _decode_cursor(cursor: str) -> tuple[datetime, UUID]:
        try:
            padded = cursor + ("=" * (-len(cursor) % 4))
            raw = base64.urlsafe_b64decode(padded).decode()
            locked_at, revision_id = raw.rsplit("|", 1)
            return datetime.fromisoformat(locked_at), UUID(revision_id)
        except (ValueError, UnicodeDecodeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid dataset cursor",
            ) from exc
