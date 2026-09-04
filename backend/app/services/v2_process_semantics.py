from __future__ import annotations

import re
import unicodedata
from math import isfinite
from typing import Any

from app.services.v2_field_source import (
    canonical_gas_species,
    canonical_option_value,
    load_field_source,
    missing,
)


def normalize_gas_components(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise ValueError("gas components must be a non-empty list")
    normalized: list[dict[str, Any]] = []
    identities: set[tuple[str, str]] = set()
    total = 0.0
    for item in value:
        if not isinstance(item, dict) or set(item) - {
            "species",
            "other_name",
            "volume_percent",
        }:
            raise ValueError("invalid gas component")
        raw_species = str(canonical_option_value(item.get("species"))).strip()
        species = "other" if raw_species == "other" else canonical_gas_species(raw_species)
        other_name = str(item.get("other_name") or "").strip()
        if (species == "other") != bool(other_name):
            raise ValueError("other gas components require other_name")
        volume_percent = item.get("volume_percent")
        if (
            isinstance(volume_percent, bool)
            or not isinstance(volume_percent, int | float)
            or not isfinite(volume_percent)
            or not 0 < volume_percent <= 100
        ):
            raise ValueError("invalid gas component volume percent")
        identity = (species, other_name.casefold() if species == "other" else "")
        if identity in identities:
            raise ValueError("gas components must be unique")
        identities.add(identity)
        component: dict[str, Any] = {
            "species": species,
            "volume_percent": float(volume_percent),
        }
        if other_name:
            component["other_name"] = other_name
        normalized.append(component)
        total += float(volume_percent)
    if abs(total - 100.0) > 0.010000001:
        raise ValueError("gas component volume percents must sum to 100")
    return normalized


def frozen_gas_components(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    raw_components = _snapshot_value(snapshot, "gas_components")
    if raw_components is not None:
        try:
            return normalize_gas_components(raw_components)
        except ValueError:
            return []
    for species in load_field_source()["gas_species"]:
        if gas_identity_matches(species, None, snapshot):
            return [{"species": species, "volume_percent": 100.0}]
    other_name = str(
        _snapshot_value(snapshot, "substance_name")
        or _snapshot_value(snapshot, "chemical_formula")
        or ""
    ).strip()
    return (
        [{"species": "other", "other_name": other_name, "volume_percent": 100.0}]
        if other_name
        else []
    )


def valid_frozen_gas_reference(item: dict[str, Any]) -> bool:
    reference = item.get("lot_ref") if isinstance(item.get("lot_ref"), dict) else item
    if not isinstance(reference, dict):
        return False
    snapshot = reference.get("snapshot")
    if not isinstance(snapshot, dict):
        return False
    entity_id = reference.get("entity_id", reference.get("material_lot_id"))
    version = reference.get("version", reference.get("material_lot_version"))
    if (
        _snapshot_value(snapshot, "lot_category") != "gas_cylinder"
        or str(_snapshot_value(snapshot, "entity_id") or "") != str(entity_id or "")
        or _snapshot_value(snapshot, "version") != version
        or any(
            missing(_snapshot_value(snapshot, key)) for key in ("substance_name", "batch_number")
        )
    ):
        return False
    components = frozen_gas_components(snapshot)
    if not components:
        return False
    if missing(item.get("species")):
        return True
    if item.get("species") == "premixed":
        return len(components) > 1
    if _snapshot_value(snapshot, "gas_components") is None:
        return gas_identity_matches(item.get("species"), item.get("other_name"), snapshot)
    if len(components) != 1:
        return False
    component = components[0]
    requested_species = str(canonical_option_value(item.get("species"))).strip()
    try:
        requested_species = (
            "other" if requested_species == "other" else canonical_gas_species(requested_species)
        )
    except ValueError:
        return False
    return requested_species == component["species"] and (
        requested_species != "other"
        or _identity(item.get("other_name")) == _identity(component.get("other_name"))
    )


def gas_identity_matches(species: Any, other_name: Any, snapshot: dict[str, Any]) -> bool:
    species_text = str(species or "").strip()
    formula = _identity(_snapshot_value(snapshot, "chemical_formula"))
    substance_name = _identity(_snapshot_value(snapshot, "substance_name"))
    if species_text == "other":
        if not (other_identity := _identity(other_name)):
            return False
        return formula == other_identity or _matches_name(substance_name, (other_identity,))
    try:
        canonical = canonical_gas_species(species_text)
    except ValueError:
        return False
    aliases = load_field_source()["gas_species"][canonical]["aliases"]
    accepted = tuple(_identity(value) for value in aliases)
    return formula == _identity(canonical) or _matches_name(substance_name, accepted)


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


def gas_feeds_are_unique(payload_json: dict[str, Any]) -> bool:
    for step in payload_json.get("items") or []:
        if not isinstance(step, dict) or step.get("stage_type") != "reaction_conditions":
            continue
        identities = [
            (
                feed.get("species"),
                _identity(feed.get("other_name")) if feed.get("species") == "other" else "",
            )
            for feed in step.get("gas_feeds") or []
            if isinstance(feed, dict)
        ]
        if len(identities) != len(set(identities)):
            return False
    return True


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
