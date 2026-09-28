from __future__ import annotations

import re
import unicodedata
from math import isfinite
from typing import Any

from app.services.v2_field_source import (
    canonical_gas_species,
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
        raw_species = str(item.get("species") or "").strip()
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
    try:
        return normalize_gas_components(_snapshot_value(snapshot, "gas_components"))
    except ValueError:
        return []


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
    if len(components) != 1:
        return False
    component = components[0]
    requested_species = str(item.get("species") or "").strip()
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
