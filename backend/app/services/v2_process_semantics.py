from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.services.v2_field_source import missing

_GAS_NAMES = {
    "Ar": ("ar", "argon", "氩", "氩气"),
    "N2": ("n2", "nitrogen", "氮", "氮气"),
    "H2": ("h2", "hydrogen", "氢", "氢气"),
    "O2": ("o2", "oxygen", "氧", "氧气"),
    "CH4": ("ch4", "methane", "甲烷", "甲烷气"),
}


def valid_frozen_gas_reference(item: dict[str, Any]) -> bool:
    reference = item.get("lot_ref")
    if not isinstance(reference, dict):
        return False
    snapshot = reference.get("snapshot")
    if not isinstance(snapshot, dict):
        return False
    return (
        _snapshot_value(snapshot, "lot_category") == "gas_cylinder"
        and str(_snapshot_value(snapshot, "entity_id") or "")
        == str(reference.get("entity_id") or "")
        and _snapshot_value(snapshot, "version") == reference.get("version")
        and all(
            not missing(_snapshot_value(snapshot, key))
            for key in ("substance_name", "chemical_formula", "batch_number")
        )
        and not missing(
            _snapshot_value(snapshot, "gas_purity_grade") or _snapshot_value(snapshot, "purity")
        )
        and gas_identity_matches(
            item.get("species"),
            item.get("other_name"),
            snapshot,
        )
    )


def gas_identity_matches(species: Any, other_name: Any, snapshot: dict[str, Any]) -> bool:
    species_text = str(species or "").strip()
    formula = _identity(_snapshot_value(snapshot, "chemical_formula"))
    substance_name = _identity(_snapshot_value(snapshot, "substance_name"))
    if species_text in _GAS_NAMES:
        accepted = tuple(_identity(value) for value in _GAS_NAMES[species_text])
        return formula == _identity(species_text) and _matches_name(substance_name, accepted)
    if species_text != "other" or not (other_identity := _identity(other_name)):
        return False
    return formula == other_identity or _matches_name(substance_name, (other_identity,))


def process_duration_violations(payload_json: dict[str, Any]) -> list[str]:
    violations: list[str] = []
    for step in payload_json.get("items") or []:
        if not isinstance(step, dict) or step.get("stage_type") != "reaction_conditions":
            continue
        duration = (step.get("duration_cycles") or {}).get("duration_min")
        if isinstance(duration, bool) or not isinstance(duration, (int, float)):
            violations.append("duration_cycles")
            continue
        if any(
            isinstance(point, dict) and _exceeds(point.get("elapsed_min"), duration)
            for zone in (step.get("temperature_program") or {}).get("zones") or []
            if isinstance(zone, dict)
            for point in zone.get("points") or []
        ):
            violations.append("temperature_program")
        if any(
            isinstance(interval, dict) and _exceeds(interval.get("end_min"), duration)
            for feed in step.get("gas_feeds") or []
            if isinstance(feed, dict)
            for interval in feed.get("intervals") or []
        ):
            violations.append("gas_feeds")
        if any(
            isinstance(field, dict) and _exceeds(field.get("end_min"), duration)
            for field in step.get("field_params") or []
        ):
            violations.append("field_params")
    return list(dict.fromkeys(violations))


def process_step_order_is_valid(payload_json: dict[str, Any]) -> bool:
    primary_stages = [
        item.get("stage_type")
        for item in payload_json.get("items") or []
        if isinstance(item, dict)
        and item.get("stage_type") in {"preparation", "reaction_conditions"}
    ]
    return (
        "preparation" not in primary_stages
        or "reaction_conditions" not in primary_stages
        or primary_stages.index("preparation") < primary_stages.index("reaction_conditions")
    )


def temperature_programs_start_at_zero(payload_json: dict[str, Any]) -> bool:
    for step in payload_json.get("items") or []:
        if not isinstance(step, dict) or step.get("stage_type") != "reaction_conditions":
            continue
        zones = (step.get("temperature_program") or {}).get("zones") or []
        if not zones:
            return False
        for zone in zones:
            points = zone.get("points") if isinstance(zone, dict) else None
            if (
                not points
                or not isinstance(points[0], dict)
                or isinstance(points[0].get("elapsed_min"), bool)
                or points[0].get("elapsed_min") != 0
            ):
                return False
    return True


def derived_reaction_cycle_count(gas_feeds: Any) -> int | None:
    if not isinstance(gas_feeds, list):
        return None
    maximum = max(
        (
            len(feed.get("intervals") or [])
            for feed in gas_feeds
            if isinstance(feed, dict) and isinstance(feed.get("intervals"), list)
        ),
        default=0,
    )
    return maximum or None


def reaction_cycle_counts_are_consistent(payload_json: dict[str, Any]) -> bool:
    for step in payload_json.get("items") or []:
        if not isinstance(step, dict) or step.get("stage_type") != "reaction_conditions":
            continue
        duration_cycles = step.get("duration_cycles")
        if not isinstance(duration_cycles, dict):
            return False
        explicit = duration_cycles.get("cycle_count")
        if explicit is not None and explicit != derived_reaction_cycle_count(step.get("gas_feeds")):
            return False
    return True


def apply_derived_reaction_cycle_counts(payload_json: dict[str, Any]) -> dict[str, Any]:
    for step in payload_json.get("items") or []:
        if not isinstance(step, dict) or step.get("stage_type") != "reaction_conditions":
            continue
        duration_cycles = step.get("duration_cycles")
        if isinstance(duration_cycles, dict):
            duration_cycles["cycle_count"] = derived_reaction_cycle_count(step.get("gas_feeds"))
    return payload_json


def _snapshot_value(snapshot: dict[str, Any], key: str) -> Any:
    if key in snapshot:
        return snapshot[key]
    for container_key in ("attrs", "attrs_snapshot"):
        attrs = snapshot.get(container_key)
        if isinstance(attrs, dict) and key in attrs:
            return attrs[key]
    return None


def _identity(value: Any) -> str:
    return re.sub(r"[\W_]+", "", unicodedata.normalize("NFKC", str(value or "")).casefold())


def _matches_name(value: str, accepted: tuple[str, ...]) -> bool:
    return any(alias == value or (len(alias) > 1 and alias in value) for alias in accepted)


def _exceeds(value: Any, maximum: float) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value > maximum
