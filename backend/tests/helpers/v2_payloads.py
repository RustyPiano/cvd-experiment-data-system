from __future__ import annotations

from typing import Any


def temperature_sensor(
    *,
    zone_index: int = 1,
    **overrides: Any,
) -> dict[str, Any]:
    payload = {
        "sensor_type": "thermocouple",
        "zone_index": zone_index,
    }
    payload.update(overrides)
    return payload


def setup_payload(
    *,
    setup_code: str = "SETUP-TEST",
    zone_count: int = 2,
    **overrides: Any,
) -> dict[str, Any]:
    if isinstance(zone_count, int) and not isinstance(zone_count, bool) and 0 < zone_count <= 32:
        sensor_count = zone_count
    elif isinstance(zone_count, str) and zone_count.isdigit() and int(zone_count) > 0:
        sensor_count = int(zone_count)
    else:
        sensor_count = 1
    payload = {
        "setup_code": setup_code,
        "setup_name": "Test furnace",
        "setup_origin": "commercial",
        "zone_count": zone_count,
        "temperature_sensors": [
            temperature_sensor(zone_index=index) for index in range(1, sensor_count + 1)
        ],
        "orientation": "horizontal",
        "tube_material_shape": {"material": "quartz", "shape": "round"},
        "tube_outer_diameter_wall_mm": {
            "outer_diameter_mm": 25.0,
            "wall_thickness_mm": 2.0,
        },
        "field_devices": ["none"],
    }
    payload.update(overrides)
    return payload


def substrate_lot_payload(
    *,
    batch_number: str = "SUBSTRATE-B01",
    material: str = "sapphire_al2o3",
    chemical_formula: str = "Al2O3",
    **overrides: Any,
) -> dict[str, Any]:
    payload = {
        "lot_category": "substrate",
        "substance_name": chemical_formula,
        "chemical_formula": chemical_formula,
        "batch_number_availability": "batch_number_reported",
        "batch_number": batch_number,
        "substrate_material": material,
        "substrate_orientation_polish_availability": "reported",
        "substrate_polish": "single_side_polished",
        "substrate_miscut_availability": "reported",
        "substrate_miscut_angle_deg": 0.0,
        "substrate_surface_roughness": {
            "availability": "reported",
            "metric": "RMS",
            "value_nm": 0.5,
        },
    }
    if material == "sio2_si":
        payload["substrate_oxide_thickness_nm"] = 285.0
    payload.update(overrides)
    return payload


def chemical_lot_payload(
    *,
    batch_number: str = "CHEMICAL-B01",
    substance_name: str = "MoO3",
    chemical_formula: str = "MoO3",
    **overrides: Any,
) -> dict[str, Any]:
    payload = {
        "lot_category": "chemical",
        "substance_name": substance_name,
        "chemical_formula": chemical_formula,
        "cas_number": "TEST-CAS",
        "batch_number": batch_number,
        "purity": 99.9,
    }
    payload.update(overrides)
    return payload


def gas_lot_payload(
    *,
    batch_number: str = "GAS-B01",
    substance_name: str = "Ar",
    chemical_formula: str | None = None,
    **overrides: Any,
) -> dict[str, Any]:
    payload = {
        "lot_category": "gas_cylinder",
        "substance_name": substance_name,
        "batch_number": batch_number,
        "gas_components": [{"species": chemical_formula or substance_name, "volume_percent": 100}],
        "gas_purity_grade": "industrial_grade",
    }
    payload.update(overrides)
    return payload


def lot_reference(entity: dict[str, Any]) -> dict[str, Any]:
    return {
        "entity_id": entity["id"],
        "version": entity.get("version") or entity["latest_version"]["version"],
    }


def substrate_item(
    lot: dict[str, Any],
    *,
    material: str = "sapphire_al2o3",
    chemical_formula: str = "Al2O3",
    **overrides: Any,
) -> dict[str, Any]:
    payload = {
        "piece_label": "S1",
        "material": material,
        "lot_ref": lot_reference(lot),
        "chemical_formula": chemical_formula,
        "crystal_orientation": "c-plane",
        "size_placement": {
            "length_mm": 10.0,
            "width_mm": 10.0,
            "placement": "face_up",
        },
        "zone_thermocouple_distance_mm": {"zone_index": 1, "distance_mm": 0.0},
    }
    if material == "sio2_si":
        payload["oxide_thickness_nm"] = 285.0
    payload.update(overrides)
    return payload
