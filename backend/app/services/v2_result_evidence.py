from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.file_asset import FileAsset
from app.models.scientific import MaterialAssertion, PropertyValue
from app.models.v2_results import CharacterizationRecord
from app.services.v2_field_source import characterization_profiles, load_field_source

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


def collect_measurement_evidence(
    db: Session,
    record_ids: list[UUID],
) -> tuple[set[UUID], set[UUID]]:
    """Return meaningful-evidence ids and the subset backed by current raw files."""
    if not record_ids:
        return set(), set()
    profiles = characterization_profiles()
    definitions = load_field_source()["characterization_properties"]
    records = {
        record.id: record
        for record in db.scalars(
            select(CharacterizationRecord).where(
                CharacterizationRecord.id.in_(record_ids),
                CharacterizationRecord.quality_flag == "valid",
            )
        )
        if record.method_instrument in profiles
    }
    if not records:
        return set(), set()

    raw_record_ids = {
        record_id
        for record_id in db.scalars(
            select(FileAsset.characterization_record_id)
            .join(
                CharacterizationRecord,
                CharacterizationRecord.id == FileAsset.characterization_record_id,
            )
            .where(
                CharacterizationRecord.id.in_(records),
                FileAsset.deleted_at.is_(None),
                FileAsset.asset_role == "characterization_file",
                FileAsset.file_category == "raw",
                FileAsset.method == CharacterizationRecord.method_instrument,
                FileAsset.experiment_run_id == CharacterizationRecord.experiment_run_id,
                FileAsset.sample_id == CharacterizationRecord.sample_id,
            )
        )
        if record_id is not None
    }
    meaningful_record_ids = set(raw_record_ids)

    properties = db.scalars(
        select(PropertyValue)
        .join(
            CharacterizationRecord,
            CharacterizationRecord.id == PropertyValue.measurement_run_id,
        )
        .where(
            CharacterizationRecord.id.in_(records),
            PropertyValue.sample_id == CharacterizationRecord.sample_id,
            PropertyValue.quality_flag.in_(["valid", "below_detection_limit"]),
        )
    )
    for item in properties:
        record = records[item.measurement_run_id]
        profile = profiles[record.method_instrument]
        if item.property_code not in [
            *profile["allowed_property_codes"],
            *profile.get("legacy_property_codes", []),
        ]:
            continue
        value_type = definitions[item.property_code]["value_type"]
        value = {
            "numeric": item.numeric_value,
            "text": item.text_value,
            "structured": item.structured_value,
        }[value_type]
        if item.quality_flag == "below_detection_limit" and value_type != "numeric":
            continue
        if has_meaningful_value(value):
            meaningful_record_ids.add(item.measurement_run_id)

    assertions = db.scalars(
        select(MaterialAssertion)
        .join(
            CharacterizationRecord,
            CharacterizationRecord.id == MaterialAssertion.measurement_run_id,
        )
        .where(
            CharacterizationRecord.id.in_(records),
            MaterialAssertion.sample_id == CharacterizationRecord.sample_id,
            MaterialAssertion.validity == "active",
        )
    )
    for item in assertions:
        record = records[item.measurement_run_id]
        profile = profiles[record.method_instrument]
        if item.assertion_type in [
            *profile["allowed_assertion_types"],
            *profile.get("legacy_assertion_types", []),
        ] and has_meaningful_value(item.value_json):
            meaningful_record_ids.add(item.measurement_run_id)
    return {
        record_id
        for record_id in meaningful_record_ids
        if not profiles[records[record_id].method_instrument]["raw_files_required"]
        or record_id in raw_record_ids
    }, raw_record_ids
