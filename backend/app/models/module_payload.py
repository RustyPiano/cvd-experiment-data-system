from __future__ import annotations

import uuid
from copy import deepcopy
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.experiment import ExperimentRun

MODULE_PAYLOAD_SCHEMA_VERSION = "cvd_v1"


class ExperimentModuleKey(StrEnum):
    BASIC_INFO = "basic_info"
    ENVIRONMENT = "environment"
    PRECHECK = "precheck"
    PRECURSORS = "precursors"
    SUBSTRATES = "substrates"
    FURNACE_PROGRAM = "furnace_program"
    GAS_PROGRAM = "gas_program"
    PROCESS_OBSERVATION = "process_observation"
    CHARACTERIZATION = "characterization"
    RESULT_SUMMARY = "result_summary"


json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class ExperimentModulePayload(Base):
    __tablename__ = "experiment_module_payloads"
    __table_args__ = (
        UniqueConstraint("experiment_run_id", "module_key", name="uq_module_payload_run_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    experiment_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("experiment_runs.id"),
        index=True,
    )
    module_key: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default=MODULE_PAYLOAD_SCHEMA_VERSION,
    )
    payload_json: Mapped[dict] = mapped_column(
        json_payload_type,
        nullable=False,
        default=dict,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    experiment_run: Mapped[ExperimentRun] = relationship(back_populates="module_payloads")


def normalize_module_payload(
    module_key: str,
    payload_json: dict[str, Any] | None,
) -> dict[str, Any]:
    payload = deepcopy(payload_json) if isinstance(payload_json, dict) else {}

    if module_key == ExperimentModuleKey.ENVIRONMENT.value:
        payload.setdefault("indoor_humidity_percent", None)
        return payload

    if module_key == ExperimentModuleKey.PRECHECK.value:
        payload.setdefault("hood_clean", None)
        payload.setdefault("flange_blocked", None)
        payload.setdefault("boat_contamination_level", None)
        payload.setdefault("tube_contamination_level", None)
        return payload

    if module_key == ExperimentModuleKey.PRECURSORS.value:
        items = payload.get("items")
        if isinstance(items, list):
            payload["items"] = [_normalize_precursor_item(item) for item in items]
        return payload

    if module_key == ExperimentModuleKey.SUBSTRATES.value:
        items = payload.get("items")
        if isinstance(items, list):
            payload["items"] = [_normalize_substrate_item(item) for item in items]
        return payload

    if module_key == ExperimentModuleKey.FURNACE_PROGRAM.value:
        return _normalize_furnace_program(payload)

    if module_key == ExperimentModuleKey.GAS_PROGRAM.value:
        segments = payload.get("segments")
        if isinstance(segments, list):
            payload["segments"] = [_normalize_gas_segment(segment) for segment in segments]
        return payload

    if module_key == ExperimentModuleKey.CHARACTERIZATION.value:
        methods = payload.get("methods")
        if isinstance(methods, list):
            payload["methods"] = [_normalize_characterization_method(method) for method in methods]
        return payload

    if module_key == ExperimentModuleKey.RESULT_SUMMARY.value:
        payload.setdefault("quality_label", "unknown")
        payload.setdefault("next_step", "")
        return payload

    return payload


def _normalize_precursor_item(item: object) -> object:
    if not isinstance(item, dict):
        return item
    normalized = deepcopy(item)
    normalized.setdefault("brand", "")
    return normalized


def _normalize_substrate_item(item: object) -> object:
    if not isinstance(item, dict):
        return item
    normalized = deepcopy(item)
    treatment_params = (
        deepcopy(normalized.get("treatment_params"))
        if isinstance(normalized.get("treatment_params"), dict)
        else {}
    )
    treatment_params.setdefault("temperature_C", None)
    treatment_params.setdefault("duration_min", None)
    treatment_params.setdefault("power_W", None)
    treatment_params.setdefault("gas", "")
    normalized["treatment_params"] = treatment_params
    return normalized


def _normalize_gas_segment(segment: object) -> object:
    if not isinstance(segment, dict):
        return segment
    normalized = deepcopy(segment)
    if "components" not in normalized:
        normalized["components"] = []
    normalized.setdefault("note", "")
    return normalized


def _normalize_furnace_step(step: object) -> object:
    if not isinstance(step, dict):
        return step
    normalized = deepcopy(step)
    normalized.setdefault("step_name", "")
    normalized.setdefault("duration_min", None)
    normalized.setdefault("is_hold", False)
    normalized.setdefault("temperatures_C", {})
    normalized.setdefault("note", "")
    return normalized


def _normalize_furnace_program(payload: dict) -> dict:
    normalized = deepcopy(payload)
    if not isinstance(normalized.get("furnace_info"), dict):
        normalized["furnace_info"] = {"zones_count": 2}
    else:
        normalized["furnace_info"].setdefault("zones_count", 2)
    if not isinstance(normalized.get("placements"), list):
        normalized["placements"] = []
    if "precursors" in normalized and not isinstance(normalized.get("precursors"), list):
        normalized["precursors"] = []
    if not isinstance(normalized.get("steps"), list):
        normalized["steps"] = []
    else:
        normalized["steps"] = [_normalize_furnace_step(s) for s in normalized["steps"]]
    return normalized


def _normalize_characterization_method(method: object) -> object:
    if not isinstance(method, dict):
        return method
    normalized = deepcopy(method)
    normalized.setdefault("enabled", True)
    normalized.setdefault("excitation_nm", None)
    normalized.setdefault("note", "")
    return normalized
