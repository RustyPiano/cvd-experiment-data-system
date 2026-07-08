from __future__ import annotations

from app.models.experiment import ExperimentRun
from app.models.v2_entities import InstrumentVersion, SetupVersion


def setup_version_snapshot(version: SetupVersion) -> dict:
    return {
        "setup_ref": str(version.entity_id),
        "setup_ref_version": version.version,
        "setup_code_snapshot": version.setup_code,
        "setup_name_snapshot": version.setup_name,
        "zone_count_snapshot": version.zone_count,
        "orientation_snapshot": version.orientation,
        "coordinate_system_snapshot": version.coordinate_system,
        "attrs_snapshot": version.attrs or {},
    }


def apply_setup_reference(run: ExperimentRun, version: SetupVersion) -> None:
    run.setup_ref = version.entity_id
    run.setup_ref_version = version.version
    run.setup_ref_snapshot_json = setup_version_snapshot(version)


def instrument_version_snapshot(version: InstrumentVersion) -> dict:
    return {
        "instrument_id": str(version.entity_id),
        "instrument_version": version.version,
        "instrument_code_snapshot": version.instrument_code,
        "name_type_snapshot": version.name_type,
        "attrs_snapshot": version.attrs or {},
    }
