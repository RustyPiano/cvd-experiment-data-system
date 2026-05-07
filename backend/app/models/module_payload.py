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


def _is_number_like(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def _zone_sort_key(zone_key: str) -> tuple[int, str]:
    prefix = "zone_"
    if zone_key.startswith(prefix):
        suffix = zone_key[len(prefix) :]
        if suffix.isdigit():
            return (int(suffix), zone_key)
    return (10_000, zone_key)


def _declared_furnace_zone_keys(payload: dict) -> list[str]:
    furnace_info = payload.get("furnace_info")
    if not isinstance(furnace_info, dict):
        furnace_info = {}

    zones_count = furnace_info.get("zones_count")
    if isinstance(zones_count, int) and not isinstance(zones_count, bool) and zones_count > 0:
        return [f"zone_{index + 1}" for index in range(zones_count)]

    zone_keys: set[str] = set()
    initial_temperatures = furnace_info.get("initial_temperatures_C")
    if isinstance(initial_temperatures, dict):
        zone_keys.update(str(key) for key in initial_temperatures)

    zones = payload.get("zones")
    if isinstance(zones, list):
        for zone in zones:
            if isinstance(zone, dict):
                zone_key = zone.get("zone_key")
                if isinstance(zone_key, str) and zone_key.strip():
                    zone_keys.add(zone_key)
                zone_index = zone.get("zone_index")
                if (
                    isinstance(zone_index, int)
                    and not isinstance(zone_index, bool)
                    and zone_index > 0
                ):
                    zone_keys.add(f"zone_{zone_index}")

    steps = payload.get("steps")
    if isinstance(steps, list):
        for step in steps:
            if not isinstance(step, dict):
                continue
            temperatures = step.get("temperatures_C")
            if isinstance(temperatures, dict):
                zone_keys.update(str(key) for key in temperatures)

    return sorted(zone_keys, key=_zone_sort_key)


def _normalize_furnace_temperature_node(node: object, index: int) -> object:
    if not isinstance(node, dict):
        return node
    normalized = deepcopy(node)
    normalized.setdefault("node_index", index + 1)
    normalized.setdefault("time_min", None)
    normalized.setdefault("temperature_C", None)
    normalized.setdefault("note", "")
    return normalized


def _normalize_furnace_zone(zone: object, index: int) -> object:
    if not isinstance(zone, dict):
        return zone
    normalized = deepcopy(zone)
    zone_key = normalized.get("zone_key")
    if not isinstance(zone_key, str) or not zone_key.strip():
        zone_index = normalized.get("zone_index")
        if isinstance(zone_index, int) and not isinstance(zone_index, bool) and zone_index > 0:
            normalized["zone_key"] = f"zone_{zone_index}"
    normalized.setdefault("note", "")
    temperature_program = normalized.get("temperature_program")
    if not isinstance(temperature_program, list):
        normalized["temperature_program"] = []
    else:
        normalized["temperature_program"] = [
            _normalize_furnace_temperature_node(node, node_index)
            for node_index, node in enumerate(temperature_program)
        ]
    return normalized


def _legacy_steps_to_furnace_zones(payload: dict) -> list[dict]:
    steps = payload.get("steps")
    if not isinstance(steps, list) or not all(isinstance(step, dict) for step in steps):
        return []

    furnace_info = (
        payload.get("furnace_info") if isinstance(payload.get("furnace_info"), dict) else {}
    )
    initial_temperatures = furnace_info.get("initial_temperatures_C")
    if not isinstance(initial_temperatures, dict):
        initial_temperatures = {}

    zones: list[dict] = []
    for zone_key in _declared_furnace_zone_keys(payload):
        elapsed_min = 0.0
        nodes: list[dict] = []
        initial_temperature = initial_temperatures.get(zone_key)
        if _is_number_like(initial_temperature):
            nodes.append(
                {
                    "node_index": 1,
                    "time_min": elapsed_min,
                    "temperature_C": initial_temperature,
                    "note": "",
                }
            )

        for step in steps:
            duration_min = step.get("duration_min")
            if _is_number_like(duration_min):
                elapsed_min += float(duration_min)
            temperatures = step.get("temperatures_C")
            if not isinstance(temperatures, dict) or zone_key not in temperatures:
                continue
            temperature = temperatures.get(zone_key)
            note = step.get("note") if isinstance(step.get("note"), str) else ""
            nodes.append(
                {
                    "node_index": len(nodes) + 1,
                    "time_min": elapsed_min,
                    "temperature_C": temperature,
                    "note": note,
                }
            )

        if not nodes:
            nodes.append(
                {
                    "node_index": 1,
                    "time_min": 0.0,
                    "temperature_C": None,
                    "note": "",
                }
            )
        elif nodes[0].get("time_min") != 0:
            nodes.insert(
                0,
                {
                    "node_index": 1,
                    "time_min": 0.0,
                    "temperature_C": nodes[0].get("temperature_C"),
                    "note": "",
                },
            )

        for index, node in enumerate(nodes):
            node["node_index"] = index + 1

        zones.append({"zone_key": zone_key, "temperature_program": nodes, "note": ""})

    return zones


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

    zones = normalized.get("zones")
    steps = normalized.get("steps")
    if isinstance(zones, list) and zones:
        normalized["zones"] = [
            _normalize_furnace_zone(zone, index) for index, zone in enumerate(zones)
        ]
        normalized.pop("steps", None)
        return normalized

    if isinstance(steps, list) and all(isinstance(step, dict) for step in steps):
        normalized["zones"] = _legacy_steps_to_furnace_zones(normalized)
        normalized.pop("steps", None)
        return normalized

    if not isinstance(steps, list):
        normalized["zones"] = []
        normalized.pop("steps", None)
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
