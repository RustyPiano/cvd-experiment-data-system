import importlib.util
import sys
from copy import deepcopy
from pathlib import Path
from types import ModuleType

import openpyxl
import pytest
from jsonschema import Draft202012Validator

from app.commands.export_v2_schema import export_v2_schema
from app.commands.generate_v2_models import (
    generate_material_phase_catalog,
    generate_v2_models,
    render_v2_models,
)
from app.schemas.generated.v2_module_payload import (
    V2_MODULE_PAYLOAD_MODELS,
    InstrumentVersionPayload,
    MaterialLotVersionPayload,
    SetupVersionPayload,
    validate_v2_module_payload,
)
from app.services.v2_field_source import load_field_source, missing

REPO_ROOT = Path(__file__).resolve().parents[3]
GENERATED_SCHEMA_DIR = REPO_ROOT / "docs" / "standard" / "generated"
GENERATED_MODEL = REPO_ROOT / "backend" / "app" / "schemas" / "generated" / "v2_module_payload.py"
GENERATED_PHASE_CATALOG = REPO_ROOT / "backend" / "app" / "generated" / "material_phase_catalog.py"
LOT_REF = {
    "entity_id": "7d9e7787-e5ef-4f34-818f-454a10263a3b",
    "version": 2,
}


def _sensors(count: int = 2) -> list[dict]:
    return [
        {
            "sensor_type": "thermocouple",
            "zone_index": zone_index,
            "nominal_accuracy_C": 1.0,
        }
        for zone_index in range(1, count + 1)
    ]


def _equipment(**changes) -> dict:
    payload = {
        "setup_ref": "setup-1@v2",
        "setup_origin": "commercial",
        "manufacturer_brand": "Vendor",
        "zone_count": 2,
        "orientation": "horizontal",
        "tube_material_shape": {"material": "quartz", "shape": "round"},
        "tube_outer_diameter_wall_mm": {
            "outer_diameter_mm": 50.0,
            "wall_thickness_mm": 2.0,
        },
        "temperature_sensors": _sensors(),
        "tube_usage_history": {
            "reset_count": 0,
            "use_number_since_reset": 1,
        },
    }
    payload.update(changes)
    return payload


def _setup(**changes) -> dict:
    payload = {
        "setup_name": "Two-zone furnace",
        "setup_origin": "commercial",
        "manufacturer_brand": "Vendor",
        "setup_code": "SETUP-1",
        "zone_count": 2,
        "temperature_sensors": _sensors(),
        "orientation": "horizontal",
        "tube_material_shape": {"material": "quartz", "shape": "round"},
        "tube_outer_diameter_wall_mm": {
            "outer_diameter_mm": 50.0,
            "wall_thickness_mm": 2.0,
        },
        "field_devices": ["none"],
    }
    payload.update(changes)
    return payload


def _substrate(**changes) -> dict:
    item = {
        "material": "sapphire_al2o3",
        "lot_ref": LOT_REF,
        "piece_label": "S1",
        "chemical_formula": "Al2O3",
        "size_placement": {
            "length_mm": 10.0,
            "width_mm": 10.0,
            "placement": "face_up",
        },
        "zone_thermocouple_distance_mm": {
            "zone_index": 1,
            "distance_mm": 0.0,
        },
    }
    item.update(changes)
    return item


@pytest.fixture
def rendered_models(tmp_path: Path) -> ModuleType:
    target = tmp_path / "rendered_v2_module_payload.py"
    target.write_text(render_v2_models(load_field_source()), encoding="utf-8")
    spec = importlib.util.spec_from_file_location("_rendered_v2_module_payload", target)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_generate_v2_models_matches_committed_file(tmp_path: Path) -> None:
    generated = generate_v2_models(output_path=tmp_path / "v2_module_payload.py")

    assert Path(generated).read_bytes() == GENERATED_MODEL.read_bytes()
    assert set(V2_MODULE_PAYLOAD_MODELS) == {"equipment", "substrates"}


def test_generate_material_phase_catalog_matches_committed_file(tmp_path: Path) -> None:
    generated = generate_material_phase_catalog(output_path=tmp_path / "material_phase_catalog.py")

    assert Path(generated).read_bytes() == GENERATED_PHASE_CATALOG.read_bytes()


def test_export_v2_schema_matches_committed_files(tmp_path: Path) -> None:
    paths = export_v2_schema(output_dir=tmp_path)

    expected = {
        "json_schema": "cvd-2d-process-v2.schema.json",
        "field_dictionary_json": "cvd-2d-field-dictionary-v2.json",
    }
    for key, filename in expected.items():
        assert Path(paths[key]).read_bytes() == (GENERATED_SCHEMA_DIR / filename).read_bytes()


def test_field_dictionary_conditions_use_machine_codes() -> None:
    dictionary = export_v2_schema(output_dir=None)["field_dictionary_doc"]
    values = [
        item
        for field in dictionary["fields"]
        if field["condition"] is not None
        for item in (
            field["condition"]["value"]
            if isinstance(field["condition"]["value"], list)
            else [field["condition"]["value"]]
        )
    ]

    assert all(not isinstance(value, str) or value.isascii() for value in values)
    assert set(values) >= {
        "chemical",
        "controlled_cooling",
        "gas_cylinder",
        "gas_line",
        "open_lid_cooling",
        "sio2_si",
        "substrate",
    }


def test_published_field_dictionary_paths_and_machine_types_match_schema() -> None:
    exported = export_v2_schema(output_dir=None)
    schema = exported["json_schema_doc"]
    fields = exported["field_dictionary_doc"]["fields"]
    paths: set[str] = set()

    for field in fields:
        path = field["schema_path"]
        assert path is not None, f"{field['module_key']}.{field['key']} has no released schema path"
        assert path not in paths, f"duplicate released schema path: {path}"
        paths.add(path)
        prefix = "entities" if field["source_part"] == "entity" else "modules"
        module_schema = schema[prefix][field["module_key"]]
        relative_path = path.removeprefix(f"$.{prefix}.{field['module_key']}.")
        nodes = _schema_nodes_at_path(module_schema, relative_path)
        machine_types = {
            item_type
            for node in nodes
            for item_type in _schema_node_types(node, module_schema)
            if item_type != "null"
        }
        assert field["machine_type"] == " | ".join(sorted(machine_types))

    by_key = {(field["module_key"], field["key"]): field for field in fields}
    assert by_key[("process_steps", "channels")]["schema_path"] == (
        "$.modules.process_steps.properties.channels"
    )
    assert by_key[("substrates", "material")]["schema_path"] == (
        "$.modules.substrates.properties.items.items.properties.material"
    )
    assert by_key[("precursors", "unit")]["schema_path"] == (
        "$.modules.precursors.properties.items.items.properties.ingredients.items.properties.unit"
    )
    assert by_key[("target_product", "target_layer_count")]["schema_path"] == (
        "$.modules.target_product.properties.material_regions.items.properties.target_layer_count"
    )


def _schema_nodes_at_path(root: dict, path: str) -> list[dict]:
    nodes = [root]
    for token in path.split("."):
        nodes = [
            value
            for node in nodes
            for variant in _schema_node_variants(node, root)
            if isinstance(value := variant.get(token), dict)
        ]
        assert nodes, f"schema path does not exist: {path}"
    return nodes


def _schema_node_variants(node: dict, root: dict) -> list[dict]:
    ref = node.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/"):
        resolved = root
        for token in ref[2:].split("/"):
            resolved = resolved[token.replace("~1", "/").replace("~0", "~")]
        node = resolved
    variants = [
        *(node.get("oneOf") or []),
        *(node.get("anyOf") or []),
        *(node.get("allOf") or []),
    ]
    return [item for variant in variants for item in _schema_node_variants(variant, root)] or [node]


def _schema_node_types(node: dict, root: dict) -> set[str]:
    return {
        item_type
        for variant in _schema_node_variants(node, root)
        for item_type in (
            [variant["type"]] if isinstance(variant.get("type"), str) else variant.get("type", [])
        )
        if isinstance(item_type, str)
    }


def test_standard_schema_exports_current_scientific_and_result_models() -> None:
    schema = export_v2_schema(output_dir=None)["json_schema_doc"]

    assert set(schema["modules"]) == {
        "basic_info",
        "equipment",
        "precursors",
        "process_events",
        "process_steps",
        "substrates",
        "target_product",
    }
    assert "created_by_user_id" in schema["modules"]["basic_info"]["properties"]
    assert "material_regions" in schema["modules"]["target_product"]["properties"]
    assert "channels" in schema["modules"]["process_steps"]["properties"]
    assert set(schema["result_models"]) == {
        "measurement_bundle",
        "transformation",
        "dataset_query",
    }
    assert schema["version"] == "v4.0-alpha.18"
    assert schema["status"] == "INTERNAL_VALIDATION"
    assert "pvd" not in schema["modules"]
    for model in [*schema["modules"].values(), *schema["result_models"].values()]:
        Draft202012Validator.check_schema(model)


def test_field_dictionary_and_xlsx_expose_machine_validation_contract() -> None:
    dictionary = export_v2_schema(output_dir=None)["field_dictionary_doc"]
    assert all(
        field["module_key"] not in {"measured_products", "characterization", "pvd"}
        for field in dictionary["fields"]
    )

    workbook = openpyxl.load_workbook(REPO_ROOT / "docs" / "standard" / "字段草案-v3.xlsx")
    sheet = workbook["字段草案"]
    headers = [cell.value for cell in sheet[1]]
    assert headers[-1] == "机器约束"
    machine_column = len(headers)
    amount_row = next(
        row for row in range(1, sheet.max_row + 1) if sheet.cell(row, 2).value == "使用量"
    )
    assert '"gt":0' in sheet.cell(amount_row, machine_column).value


def test_process_timeline_schema_validates_the_current_top_level_contract() -> None:
    schema = export_v2_schema(output_dir=None)["json_schema_doc"]["modules"]["process_steps"]
    validator = Draft202012Validator(schema)
    payload = {
        "segments": [],
        "channels": [
            {
                "channel_key": "channel_11111111_1111_4111_8111_111111111111",
                "channel_type": "temperature",
                "source_type": "setpoint",
                "subject_type": "temperature_zone",
                "subject_ref": "zone_1",
                "subject_instance_ref": "zone_1_controller",
                "zone_index": 1,
                "unit": "℃",
                "data_kind": "scalar",
                "scalar_value": 750,
            }
        ],
        "pressure_regime": "atmospheric",
        "cooling_method": "furnace_cooling",
    }

    assert validator.is_valid(payload)
    assert not validator.is_valid({**payload, "channels": []})


def test_material_lot_enforces_current_category_specific_fields() -> None:
    chemical = MaterialLotVersionPayload.model_validate(
        {
            "lot_category": "chemical",
            "substance_name": "Molybdenum trioxide",
            "chemical_formula": " Mo O₃ ",
            "batch_number": "MO-1",
        }
    )
    assert chemical.chemical_formula == "MoO3"

    substrate = MaterialLotVersionPayload.model_validate(
        {
            "lot_category": "substrate",
            "substance_name": "Sapphire",
            "chemical_formula": "Al2O3",
            "batch_number": "S-1",
            "substrate_material": "sapphire_al2o3",
        }
    )
    assert substrate.substrate_material == "sapphire_al2o3"

    with pytest.raises(ValueError, match="chemical_formula"):
        MaterialLotVersionPayload.model_validate(
            {
                "lot_category": "chemical",
                "substance_name": "Unknown",
                "batch_number": "C-1",
            }
        )
    with pytest.raises(ValueError, match="substrate_material"):
        MaterialLotVersionPayload.model_validate(
            {
                "lot_category": "substrate",
                "substance_name": "Unknown substrate",
                "chemical_formula": "Si",
                "batch_number": "S-2",
            }
        )


def test_gas_cylinder_requires_a_valid_fixed_composition() -> None:
    pure = MaterialLotVersionPayload.model_validate(
        {
            "lot_category": "gas_cylinder",
            "substance_name": "Carbon dioxide",
            "batch_number": "CO2-1",
            "gas_components": [{"species": "CO2", "volume_percent": 100}],
        }
    )
    assert pure.gas_components[0].species == "CO2"

    mixed = MaterialLotVersionPayload.model_validate(
        {
            "lot_category": "gas_cylinder",
            "substance_name": "5% H2 / Ar",
            "batch_number": "MIX-1",
            "gas_components": [
                {"species": "H2", "volume_percent": 5},
                {"species": "Ar", "volume_percent": 95},
            ],
        }
    )
    assert sum(item.volume_percent for item in mixed.gas_components) == 100

    for components, message in (
        ([{"species": "Ar", "volume_percent": 90}], "sum to 100"),
        (
            [
                {"species": "Ar", "volume_percent": 50},
                {"species": "Ar", "volume_percent": 50},
            ],
            "unique",
        ),
    ):
        with pytest.raises(ValueError, match=message):
            MaterialLotVersionPayload.model_validate(
                {
                    "lot_category": "gas_cylinder",
                    "substance_name": "Invalid gas",
                    "batch_number": "BAD-1",
                    "gas_components": components,
                }
            )

    with pytest.raises(ValueError, match="not applicable"):
        MaterialLotVersionPayload.model_validate(
            {
                "lot_category": "gas_cylinder",
                "substance_name": "Argon",
                "chemical_formula": "Ar",
                "batch_number": "AR-1",
                "gas_components": [{"species": "Ar", "volume_percent": 100}],
            }
        )


def test_setup_and_instrument_entity_contracts() -> None:
    setup = SetupVersionPayload.model_validate(_setup())
    assert setup.orientation == "horizontal"

    instrument = InstrumentVersionPayload.model_validate(
        {
            "instrument_code": "RAMAN-1",
            "name_type": "Raman spectrometer",
            "capabilities": [{"method": "raman"}],
        }
    )
    assert instrument.instrument_code == "RAMAN-1"

    with pytest.raises(ValueError, match="cover each zone"):
        SetupVersionPayload.model_validate(_setup(temperature_sensors=_sensors(1)))
    with pytest.raises(ValueError, match="not applicable"):
        SetupVersionPayload.model_validate(
            _setup(
                setup_origin="lab_built",
                design_build_organization="Lab",
                internal_model="LAB-1",
                manufacturer_brand="Vendor",
            )
        )


def test_equipment_and_setup_share_geometry_and_zone_validation(
    rendered_models: ModuleType,
) -> None:
    for model, payload in (
        (rendered_models.EquipmentPayload, _equipment()),
        (rendered_models.SetupVersionPayload, _setup()),
    ):
        model.model_validate(payload)
        with pytest.raises(ValueError, match="cover each zone"):
            model.model_validate({**payload, "temperature_sensors": _sensors(1)})
        with pytest.raises(ValueError, match="cross-section shape"):
            model.model_validate(
                {
                    **payload,
                    "tube_outer_diameter_wall_mm": {
                        "outer_width_mm": 50,
                        "outer_height_mm": 30,
                        "wall_thickness_mm": 2,
                    },
                }
            )


def test_equipment_snapshot_round_trips_current_fields() -> None:
    validated = validate_v2_module_payload("equipment", _equipment())

    assert validated["orientation"] == "horizontal"
    assert validated["temperature_sensors"][1]["zone_index"] == 2
    assert validated["tube_usage_history"] == {
        "reset_count": 0,
        "use_number_since_reset": 1,
    }


def test_substrate_module_validates_current_geometry_and_material_conditions() -> None:
    validated = validate_v2_module_payload("substrates", {"items": [_substrate()]})
    assert validated["items"][0]["chemical_formula"] == "Al2O3"

    sio2 = _substrate(
        material="sio2_si",
        chemical_formula="SiO2",
        oxide_thickness_nm=285,
    )
    validate_v2_module_payload("substrates", {"items": [sio2]})
    with pytest.raises(ValueError, match="oxide_thickness_nm"):
        validate_v2_module_payload(
            "substrates",
            {"items": [_substrate(material="sio2_si", chemical_formula="SiO2")]},
        )
    with pytest.raises(ValueError, match="not applicable"):
        validate_v2_module_payload(
            "substrates",
            {"items": [_substrate(oxide_thickness_nm=285)]},
        )


def test_substrate_tilt_and_pretreatment_use_structured_contracts() -> None:
    tilted = _substrate(
        size_placement={
            "length_mm": 10,
            "width_mm": 10,
            "placement": "tilted",
            "tilt_angle_deg": 15,
        },
        pretreatment_steps=[
            {
                "type": "plasma_treatment",
                "parameters": {
                    "power_W": 50,
                    "gas_species": "O2",
                    "duration_min": 2,
                    "pressure_Pa": 20,
                },
            }
        ],
    )
    saved = validate_v2_module_payload("substrates", {"items": [tilted]})["items"][0]
    assert saved["size_placement"]["tilt_angle_deg"] == 15
    assert saved["pretreatment_steps"][0]["type"] == "plasma_treatment"

    with pytest.raises(ValueError, match="tilt_angle_deg"):
        validate_v2_module_payload(
            "substrates",
            {
                "items": [
                    _substrate(
                        size_placement={
                            "length_mm": 10,
                            "width_mm": 10,
                            "placement": "tilted",
                        }
                    )
                ]
            },
        )


def test_required_value_detection_keeps_false_and_zero() -> None:
    assert missing("   ")
    assert missing({"value": None, "option": None})
    assert not missing(False)
    assert not missing(0)


def test_generator_fails_closed_for_unknown_complex_input_type() -> None:
    doc = deepcopy(load_field_source())
    field = next(
        item
        for section in doc["experiment_record"]["sections"]
        for item in section["fields"]
        if item["key"] == "manufacturer_brand"
    )
    field["input"] = "未实现的复杂对象"

    with pytest.raises(ValueError, match="Unsupported input type"):
        render_v2_models(doc)
