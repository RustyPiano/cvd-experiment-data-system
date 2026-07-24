from __future__ import annotations

from collections.abc import Mapping
from typing import Any

MEASURED_PRODUCT_EVIDENCE_FIELDS = (
    "characterization_record_id",
    "observed_phenomena",
    "detected_phase_stacking",
    "layer_count",
    "coverage_percent",
    "domain_size_um",
    "nucleation_density_cm2",
    "measured_layers_coverage",
    "domain_nucleation_continuity",
    "key_spectral_metrics",
    "attrs",
)


def has_meaningful_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, Mapping):
        return any(has_meaningful_value(item) for item in value.values())
    if isinstance(value, (list, tuple, set)):
        return any(has_meaningful_value(item) for item in value)
    return True


def has_measured_product_evidence(values: Mapping[str, Any]) -> bool:
    return any(
        has_meaningful_value(values.get(field_name))
        for field_name in MEASURED_PRODUCT_EVIDENCE_FIELDS
    )
