from __future__ import annotations

from copy import deepcopy

from app.models.experiment import ExperimentRun
from app.models.v2_entities import InstrumentVersion, MaterialLotVersion, SetupVersion

FIXED_COORDINATE_SYSTEM = "上游为负，下游为正"
MATERIAL_LOT_PROJECTED_FIELDS = {
    "precursors": ("name_formula", "cas_inchi"),
    "substrates": (
        "material",
        "chemical_formula",
        "orientation_polish_availability",
        "crystal_orientation",
        "oxide_thickness_nm",
        "miscut_availability",
        "miscut_angle_deg",
        "miscut_direction",
        "surface_roughness",
    ),
}


def _material_lot_snapshot_value(snapshot: dict, key: str) -> object | None:
    value = snapshot.get(key)
    if value is not None:
        return value
    attrs = snapshot.get("attrs")
    return attrs.get(key) if isinstance(attrs, dict) else None


def _present_snapshot_value(value: object | None) -> bool:
    return value is not None and value != "" and value != {} and value != []


def material_lot_item_projection(module_key: str, snapshot: dict) -> dict:
    """Project lot-owned facts into a run item, omitting facts absent from old lots."""
    if module_key == "precursors":
        formula = _material_lot_snapshot_value(snapshot, "chemical_formula")
        substance_name = _material_lot_snapshot_value(snapshot, "substance_name")
        identity = formula if _present_snapshot_value(formula) else substance_name
        cas_number = _material_lot_snapshot_value(snapshot, "cas_number")
        return {
            **({"name_formula": identity} if _present_snapshot_value(identity) else {}),
            **(
                {"cas_inchi": str(cas_number).strip()}
                if _present_snapshot_value(cas_number)
                else {}
            ),
        }

    if module_key != "substrates":
        return {}

    orientation = _material_lot_snapshot_value(snapshot, "substrate_orientation_polish")
    orientation_availability = _material_lot_snapshot_value(
        snapshot, "substrate_orientation_polish_availability"
    )
    if not _present_snapshot_value(orientation_availability) and _present_snapshot_value(
        orientation
    ):
        orientation_availability = "reported"
    if isinstance(orientation, dict):
        orientation = "；".join(
            str(value).strip()
            for key in ("value", "option")
            if _present_snapshot_value(value := orientation.get(key))
        )
    miscut_angle = _material_lot_snapshot_value(snapshot, "substrate_miscut_angle_deg")
    miscut_availability = _material_lot_snapshot_value(snapshot, "substrate_miscut_availability")
    if not _present_snapshot_value(miscut_availability) and _present_snapshot_value(miscut_angle):
        miscut_availability = "reported"
    candidates = {
        "material": _material_lot_snapshot_value(snapshot, "substrate_material"),
        "chemical_formula": _material_lot_snapshot_value(snapshot, "chemical_formula"),
        "orientation_polish_availability": orientation_availability,
        "crystal_orientation": orientation,
        "oxide_thickness_nm": _material_lot_snapshot_value(
            snapshot, "substrate_oxide_thickness_nm"
        ),
        "miscut_availability": miscut_availability,
        "miscut_angle_deg": miscut_angle,
        "miscut_direction": _material_lot_snapshot_value(snapshot, "substrate_miscut_direction"),
        "surface_roughness": _material_lot_snapshot_value(snapshot, "substrate_surface_roughness"),
    }
    return {key: value for key, value in candidates.items() if _present_snapshot_value(value)}


def effective_run_module_payloads(run: ExperimentRun) -> dict[str, dict]:
    """Return read-only payloads with lot-owned facts rebuilt from frozen snapshots."""
    payloads = {item.module_key: deepcopy(item.payload_json) for item in run.module_payloads}
    for module_key, keys in MATERIAL_LOT_PROJECTED_FIELDS.items():
        for item in (payloads.get(module_key) or {}).get("items") or []:
            reference = item.get("lot_ref") if isinstance(item, dict) else None
            snapshot = reference.get("snapshot") if isinstance(reference, dict) else None
            if not isinstance(snapshot, dict):
                continue
            for key in keys:
                item.pop(key, None)
            item.update(material_lot_item_projection(module_key, snapshot))
    return payloads


def missing_material_lot_projection_fields(module_key: str, snapshot: dict) -> list[str]:
    """Return run-required lot facts absent from an old frozen lot version."""
    if module_key != "substrates":
        return []
    projection = material_lot_item_projection(module_key, snapshot)
    required = [
        "material",
        "chemical_formula",
        "orientation_polish_availability",
        "miscut_availability",
        "surface_roughness",
    ]
    if projection.get("orientation_polish_availability") == "reported":
        required.append("crystal_orientation")
    if projection.get("miscut_availability") == "reported":
        required.append("miscut_angle_deg")
    if projection.get("material") == "sio2_si":
        required.append("oxide_thickness_nm")
    try:
        has_miscut = float(projection.get("miscut_angle_deg", 0)) > 0
    except (TypeError, ValueError):
        has_miscut = False
    if has_miscut:
        required.append("miscut_direction")
    return [key for key in required if not _present_snapshot_value(projection.get(key))]


def setup_version_snapshot(version: SetupVersion) -> dict:
    return {
        "setup_ref": str(version.entity_id),
        "setup_ref_version": version.version,
        "setup_code_snapshot": version.setup_code,
        "setup_name_snapshot": version.setup_name,
        "zone_count_snapshot": version.zone_count,
        "orientation_snapshot": version.orientation,
        "coordinate_system_snapshot": FIXED_COORDINATE_SYSTEM,
        "attrs_snapshot": version.attrs,
    }


def setup_equipment_projection(version: SetupVersion) -> dict:
    """Build the run-level read-only projection from the frozen Setup version."""
    return {
        "setup_ref": str(version.entity_id),
        "setup_code": version.setup_code,
        "setup_name": version.setup_name,
        "zone_count": version.zone_count,
        "orientation": version.orientation,
        "coordinate_system": FIXED_COORDINATE_SYSTEM,
        **version.attrs,
    }


def apply_setup_reference(run: ExperimentRun, version: SetupVersion) -> None:
    run.setup_ref = version.entity_id
    run.setup_ref_version = version.version
    run.setup_ref_snapshot_json = setup_version_snapshot(version)


def material_lot_version_snapshot(version: MaterialLotVersion) -> dict:
    return {
        "entity_id": str(version.entity_id),
        "version": version.version,
        "lot_category": version.lot_category,
        "substance_name": version.substance_name,
        "chemical_formula": version.chemical_formula,
        "batch_number": version.batch_number,
        "attrs": version.attrs,
    }


def instrument_version_snapshot(version: InstrumentVersion) -> dict:
    return {
        "instrument_id": str(version.entity_id),
        "instrument_version": version.version,
        "instrument_code_snapshot": version.instrument_code,
        "name_type_snapshot": version.name_type,
        "attrs_snapshot": version.attrs,
    }
