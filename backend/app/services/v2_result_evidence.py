from __future__ import annotations

from collections.abc import Mapping
from typing import Any

MEASURED_PRODUCT_EVIDENCE_FIELDS = (
    "observed_phenomena",
    "detected_phase_stacking",
    "layer_count",
    "coverage_percent",
    "domain_size_um",
    "nucleation_density_cm2",
    "measured_layers_coverage",
    "domain_nucleation_continuity",
    "key_spectral_metrics",
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
    observed = values.get("observed_phenomena")
    if isinstance(observed, (list, tuple, set)):
        if any(
            has_meaningful_value(value) and value not in {"other", "其他"} for value in observed
        ):
            return True
        attrs = values.get("attrs")
        if any(value in {"other", "其他"} for value in observed) and isinstance(attrs, Mapping):
            if has_meaningful_value(attrs.get("observed_phenomena_other")):
                return True
    return any(
        has_meaningful_value(values.get(field_name))
        for field_name in MEASURED_PRODUCT_EVIDENCE_FIELDS
        if field_name != "observed_phenomena"
    )
