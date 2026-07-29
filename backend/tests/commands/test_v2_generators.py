import importlib.util
import sys
from copy import deepcopy
from pathlib import Path
from types import ModuleType

import openpyxl
import pytest
from jsonschema import Draft202012Validator

from app.commands.export_v2_schema import export_v2_schema
from app.commands.generate_v2_models import generate_v2_models, render_v2_models
from app.schemas.generated.v2_module_payload import (
    MaterialLotVersionPayload,
    SurfaceRoughnessPayload,
    validate_v2_module_payload,
)
from app.services.v2_field_source import load_field_source, missing

REPO_ROOT = Path(__file__).resolve().parents[3]
GENERATED_SCHEMA_DIR = REPO_ROOT / "docs" / "standard" / "generated"
GENERATED_MODEL = REPO_ROOT / "backend" / "app" / "schemas" / "generated" / "v2_module_payload.py"
LOT_REF = {
    "entity_id": "7d9e7787-e5ef-4f34-818f-454a10263a3b",
    "version": 2,
}


def _basic_info(**changes) -> dict:
    payload = {
        "started_at": "2026-07-22T09:00:00+08:00",
        "synthesis_method": "CVD",
        "operator": "Tester",
        "run_code": "CVD-2026-0001",
        "ambient_temperature_C": 25.0,
        "ambient_humidity_percent": 45.0,
        "precheck_confirmed": True,
    }
    payload.update(changes)
    return payload


def _target_product(**changes) -> dict:
    payload = {
        "chemical_formula": "MoS2",
        "structure_type": "intrinsic",
        "target_morphology": "continuous_film",
    }
    payload.update(changes)
    return payload


def _reaction_step(**changes) -> dict:
    step = {
        "stage_type": "reaction_conditions",
        "temperature_program": {
            "zones": [
                {
                    "zone_index": 1,
                    "points": [
                        {"elapsed_min": 0.0, "setpoint_C": 25.0},
                        {"elapsed_min": 30.0, "setpoint_C": 750.0},
                    ],
                }
            ]
        },
        "gas_feeds": [
            {
                "species": "Ar",
                "lot_ref": LOT_REF,
                "measurement_source": "mfc",
                "intervals": [{"start_min": 0.0, "end_min": 30.0, "flow_sccm": 80.0}],
            }
        ],
        "pressure_system": {"value": 101325.0, "option": "atmospheric_pressure"},
        "duration_cycles": {"duration_min": 30.0},
    }
    step.update(changes)
    return step


def _substrate_item(**changes) -> dict:
    item = {
        "piece_label": "S1",
        "material": "sapphire_al2o3",
        "lot_ref": LOT_REF,
        "chemical_formula": "Al2O3",
        "orientation_polish_availability": "reported",
        "crystal_orientation": "c-plane",
        "miscut_availability": "reported",
        "miscut_angle_deg": 0.0,
        "surface_roughness": {"metric": "RMS", "value_nm": 0.5},
        "size_placement": {
            "length_mm": 10.0,
            "width_mm": 10.0,
            "placement": "face_up",
        },
    }
    item.update(changes)
    return item


def _precursor_item(**changes) -> dict:
    item = {
        "role": "main_precursor",
        "phase_state": "solid",
        "lot_ref": LOT_REF,
        "amount": 20.0,
        "loading_method": "boat",
        "source_container": {
            "material": "quartz",
            "length_mm": 90.0,
            "width_mm": 15.0,
            "height_mm": 5.0,
            "reset_count": 0,
            "use_number_since_reset": 1,
        },
        "source_position": {"zone_index": 1, "distance_mm": -20.0},
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


def test_substrate_lot_miscut_requires_direction() -> None:
    with pytest.raises(ValueError, match="substrate_miscut_direction"):
        MaterialLotVersionPayload.model_validate(
            {
                "lot_category": "substrate",
                "substance_name": "Sapphire",
                "chemical_formula": "Al2O3",
                "batch_number": "S-1",
                "substrate_material": "sapphire_al2o3",
                "substrate_orientation_polish_availability": "reported",
                "substrate_orientation_polish": {
                    "value": "c-plane",
                    "option": "single_side_polished",
                },
                "substrate_miscut_availability": "reported",
                "substrate_miscut_angle_deg": 0.2,
                "substrate_surface_roughness": {
                    "metric": "RMS",
                    "value_nm": 0.5,
                },
            }
        )


@pytest.mark.parametrize(
    "orientation",
    [
        {"value": None, "option": "single_side_polished"},
        {"value": "c-plane", "option": None},
        {"value": " ", "option": "single_side_polished"},
    ],
)
def test_substrate_lot_requires_both_orientation_and_polish(
    orientation: dict,
) -> None:
    with pytest.raises(ValueError):
        MaterialLotVersionPayload.model_validate(
            {
                "lot_category": "substrate",
                "substance_name": "Sapphire",
                "chemical_formula": "Al2O3",
                "batch_number": "S-1",
                "substrate_material": "sapphire_al2o3",
                "substrate_orientation_polish_availability": "reported",
                "substrate_orientation_polish": orientation,
                "substrate_miscut_availability": "reported",
                "substrate_miscut_angle_deg": 0,
                "substrate_surface_roughness": {
                    "metric": "RMS",
                    "value_nm": 0.5,
                },
            }
        )


def test_surface_roughness_records_unavailable_specification_without_fake_zero() -> None:
    legacy = SurfaceRoughnessPayload.model_validate({"metric": "RMS", "value_nm": 0.5})
    assert legacy.availability == "reported"
    assert SurfaceRoughnessPayload.model_validate({"availability": "not_provided"}).model_dump(
        exclude_none=True
    ) == {"availability": "not_provided"}

    with pytest.raises(ValueError, match="requires metric and value_nm"):
        SurfaceRoughnessPayload.model_validate({"availability": "reported"})
    with pytest.raises(ValueError, match="cannot include"):
        SurfaceRoughnessPayload.model_validate(
            {
                "availability": "not_provided",
                "metric": "RMS",
                "value_nm": 0,
            }
        )


def test_substrate_crystal_specs_support_explicit_not_applicable() -> None:
    payload = {
        "lot_category": "substrate",
        "substance_name": "Copper foil",
        "chemical_formula": "Cu",
        "batch_number": "CU-1",
        "substrate_material": "cu_foil",
        "substrate_orientation_polish_availability": "not_applicable",
        "substrate_miscut_availability": "not_applicable",
        "substrate_surface_roughness": {"availability": "not_provided"},
    }
    MaterialLotVersionPayload.model_validate(payload)

    with pytest.raises(ValueError, match="substrate_miscut_angle_deg is not applicable"):
        MaterialLotVersionPayload.model_validate({**payload, "substrate_miscut_angle_deg": 0})

    reported = {
        **payload,
        "substrate_miscut_availability": "reported",
        "substrate_miscut_angle_deg": 0,
        "substrate_miscut_direction": "toward a",
    }
    with pytest.raises(
        ValueError,
        match="not applicable when substrate_miscut_angle_deg is zero",
    ):
        MaterialLotVersionPayload.model_validate(reported)
    with pytest.raises(ValueError, match="not applicable when miscut_angle_deg is zero"):
        validate_v2_module_payload(
            "substrates",
            {"items": [_substrate_item(miscut_direction="toward a")]},
        )


def test_legacy_plasma_pretreatment_alias_uses_the_nested_discriminator() -> None:
    validated = validate_v2_module_payload(
        "substrates",
        {
            "items": [
                _substrate_item(
                    pretreatment_steps=[
                        {
                            "type": "等离子",
                            "parameters": {
                                "power_W": 50,
                                "gas_species": "Ar",
                                "pressure_Pa": 20,
                                "duration_min": 5,
                            },
                        }
                    ]
                )
            ]
        },
    )

    assert validated["items"][0]["pretreatment_steps"][0]["type"] == "plasma_treatment"


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
    conditions = [
        field["condition"] for field in dictionary["fields"] if field["condition"] is not None
    ]
    values = [
        item
        for condition in conditions
        for item in (
            condition["value"] if isinstance(condition["value"], list) else [condition["value"]]
        )
    ]

    assert all(not isinstance(value, str) or value.isascii() for value in values)
    assert set(values) >= {
        "intrinsic",
        "solid",
        "gas",
        "preparation",
        "reaction_conditions",
        "other",
        "substrate",
        "gas_cylinder",
    }
    description = next(
        field
        for field in dictionary["fields"]
        if field["module_key"] == "process_events" and field["key"] == "description"
    )
    assert description["requirement"] == "conditional_required"
    assert description["otherwise"] == "optional"


def test_standard_schema_exports_structured_result_models_and_validation() -> None:
    schema = export_v2_schema(output_dir=None)["json_schema_doc"]

    assert set(schema["result_models"]) == {
        "measurement_bundle",
        "transformation",
        "dataset_query",
    }
    assert schema["version"] == "v4.0-alpha.2"
    assert schema["status"] == "INTERNAL_VALIDATION"
    assert "pvd" not in schema["modules"]
    assert schema["scientific_contract"]["result_chain"].startswith("Sample")
    for model in schema["result_models"].values():
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


def test_pressure_dictionary_declares_option_specific_absolute_pa_ranges() -> None:
    dictionary = export_v2_schema(output_dir=None)["field_dictionary_doc"]
    pressure = next(
        field
        for field in dictionary["fields"]
        if field["module_key"] == "process_steps" and field["key"] == "pressure_system"
    )

    ranges = pressure["validation"]["option_ranges"]
    assert ranges["atmospheric_pressure"]["ge"] >= 80_000
    assert ranges["low_pressure"]["lt"] <= ranges["atmospheric_pressure"]["ge"]
    assert ranges["low_pressure"]["gt"] >= ranges["ultra_high_vacuum"]["le"]


def test_process_step_schema_discriminates_stage_type_and_forbids_hidden_groups() -> None:
    schema = export_v2_schema(output_dir=None)["json_schema_doc"]
    process_steps_schema = schema["modules"]["process_steps"]
    Draft202012Validator.check_schema(process_steps_schema)
    validator = Draft202012Validator(process_steps_schema)

    assert validator.is_valid(
        {
            "segments": [
                {
                    "segment_key": "growth",
                    "segment_type": "growth",
                    "sequence": 1,
                    "start_s": 0,
                    "end_s": 60,
                }
            ],
            "channels": [
                {
                    "channel_key": "temperature.zone_1",
                    "channel_type": "temperature",
                    "source_type": "setpoint",
                    "unit": "℃",
                    "data_kind": "scalar",
                    "scalar_value": 750,
                }
            ],
        }
    )
    assert not validator.is_valid(
        {
            "segments": [
                {
                    "segment_key": "growth",
                    "segment_type": "growth",
                    "sequence": 1,
                    "start_s": 0,
                    "end_s": 60,
                }
            ]
        }
    )


def test_generated_v2_payload_models_apply_record_local_conditions() -> None:
    target_product = validate_v2_module_payload(
        "target_product",
        _target_product(
            chemical_formula="MoS2",
            structure_type="掺杂",
            components=[
                {"formula": "MoS2", "role": "基体"},
                {"formula": "Nb", "role": "掺杂剂"},
            ],
        ),
    )
    assert target_product["components"][0]["formula"] == "MoS2"

    try:
        validate_v2_module_payload(
            "target_product",
            _target_product(chemical_formula="Nb:MoS2", structure_type="掺杂"),
        )
    except ValueError as exc:
        assert "components" in str(exc)
    else:
        raise AssertionError("components should be required when structure_type != 本征")

    reaction = validate_v2_module_payload(
        "process_steps",
        {"items": [_reaction_step(stage_type="反应条件")]},
    )
    assert reaction["items"][0]["stage_type"] == "reaction_conditions"


@pytest.mark.parametrize("invalid", ["25", True, float("nan"), float("inf")])
def test_generated_numeric_fields_reject_non_json_or_non_finite_numbers(invalid) -> None:
    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "basic_info",
            _basic_info(started_at="2026-07-22T09:00:00", ambient_temperature_C=invalid),
        )


def test_system_generated_run_code_is_still_non_blank() -> None:
    with pytest.raises(ValueError):
        validate_v2_module_payload("basic_info", _basic_info(run_code=" "))


@pytest.mark.parametrize("invalid", ["194", 194.0, True, 0, 231])
def test_bulk_space_group_is_a_strict_it_number(invalid) -> None:
    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "target_product",
            _target_product(bulk_space_group=invalid),
        )
    valid = validate_v2_module_payload(
        "target_product",
        _target_product(bulk_space_group=194),
    )
    assert valid["bulk_space_group"] == 194


def test_composite_and_component_vocabularies_are_field_specific() -> None:
    valid = validate_v2_module_payload("process_steps", {"items": [_reaction_step()]})
    assert valid["items"][0]["pressure_system"] == {
        "value": 101325.0,
        "option": "atmospheric_pressure",
    }

    for bad_pressure in (
        {"value": "101325", "option": "atmospheric_pressure"},
        {"value": 101325, "option": "mfc"},
        {"value": float("nan"), "option": "atmospheric_pressure"},
    ):
        step = _reaction_step(pressure_system=bad_pressure)
        with pytest.raises(ValueError):
            validate_v2_module_payload("process_steps", {"items": [step]})

    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "target_product",
            _target_product(
                chemical_formula="Nb:MoS2",
                structure_type="doped",
                components=[{"formula": "Nb", "role": "other"}],
            ),
        )


def test_formula_normalization_matches_the_frontend_contract() -> None:
    normalized = validate_v2_module_payload(
        "target_product",
        _target_product(chemical_formula=" Mo S₂ "),
    )
    assert normalized["chemical_formula"] == "MoS2"
    grouped = validate_v2_module_payload(
        "target_product",
        _target_product(chemical_formula="Mo(S)2"),
    )
    assert grouped["chemical_formula"] == "Mo(S)2"
    hydrated = validate_v2_module_payload(
        "target_product",
        _target_product(chemical_formula="(NH4)6Mo7O24∙4H2O"),
    )
    assert hydrated["chemical_formula"] == "(NH4)6Mo7O24·4H2O"
    substrate = validate_v2_module_payload(
        "substrates",
        {"items": [_substrate_item(chemical_formula="Na2WO4⋅2H2O")]},
    )
    assert substrate["items"][0]["chemical_formula"] == "Na2WO4·2H2O"
    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "target_product",
            _target_product(chemical_formula="Mo((S))2"),
        )


def test_conditionally_required_fields_are_rejected_when_not_applicable() -> None:
    with pytest.raises(ValueError, match="amount is not applicable"):
        validate_v2_module_payload(
            "precursors",
            {"items": [_precursor_item(phase_state="gas")]},
        )
    with pytest.raises(ValueError, match="oxide_thickness_nm is not applicable"):
        validate_v2_module_payload(
            "substrates",
            {"items": [_substrate_item(oxide_thickness_nm=285.0)]},
        )
    with pytest.raises(ValueError, match="is not applicable"):
        validate_v2_module_payload(
            "process_events",
            {
                "items": [
                    {
                        "event_id": "366f5ef9-0fac-4b53-81bf-92e094e39430",
                        "event_type": "equipment_alarm",
                        "occurred_at": "2026-07-08T10:28:00+08:00",
                        "terminated_run": False,
                        "termination_reason": "other",
                    }
                ]
            },
        )


def test_required_values_reject_blank_strings_and_empty_composite_shells() -> None:
    assert missing("   ")
    assert missing({"value": None, "option": None})
    assert not missing({"value": None, "option": "furnace_cooling"})
    assert not missing({"value": 80, "option": "MFC"})
    assert not missing(False)
    assert not missing(0)


@pytest.mark.parametrize(
    ("module_key", "payload"),
    [
        (
            "basic_info",
            _basic_info(ambient_humidity_percent=100.1),
        ),
        (
            "basic_info",
            _basic_info(precheck_confirmed=False),
        ),
        (
            "target_product",
            _target_product(target_layer_count=0),
        ),
        (
            "precursors",
            {"items": [_precursor_item(amount=-0.1)]},
        ),
        (
            "substrates",
            {
                "items": [
                    _substrate_item(
                        material="sio2_si",
                        chemical_formula="SiO2",
                        oxide_thickness_nm=-1,
                    )
                ]
            },
        ),
        (
            "process_steps",
            {"items": [_reaction_step(duration_cycles={"duration_min": -1.0})]},
        ),
    ],
)
def test_generated_models_enforce_scientific_numeric_boundaries(
    module_key: str, payload: dict
) -> None:
    with pytest.raises(ValueError):
        validate_v2_module_payload(module_key, payload)


@pytest.mark.parametrize(
    ("module_key", "payload"),
    [
        (
            "precursors",
            {"items": [_precursor_item(amount=0)]},
        ),
        (
            "substrates",
            {
                "items": [
                    _substrate_item(
                        material="sio2_si",
                        chemical_formula="SiO2",
                        oxide_thickness_nm=0,
                    )
                ]
            },
        ),
        (
            "process_steps",
            {"items": [_reaction_step(duration_cycles={"duration_min": 0.0})]},
        ),
        (
            "pvd",
            {
                "target_substrate_distance_mm": 80,
                "power_bias": 150,
                "plasma_gas_pressure": {"value": 0.5, "option": "Ar"},
                "presputter_shutter": 0,
                "deposition_rate_nm_s": 0,
            },
        ),
    ],
)
def test_positive_measurements_reject_zero(module_key: str, payload: dict) -> None:
    with pytest.raises(ValueError):
        validate_v2_module_payload(module_key, payload)


def test_zero_remains_valid_for_true_counts_and_absence_metrics() -> None:
    basic = validate_v2_module_payload(
        "basic_info",
        _basic_info(ambient_humidity_percent=0.0),
    )
    assert basic["ambient_humidity_percent"] == 0


@pytest.mark.parametrize(
    "payload",
    [
        {
            "chemical_formula": "MoS2",
            "structure_type": "intrinsic",
            "components": [{"formula": "MoS2", "role": "matrix"}],
        },
        {
            "chemical_formula": "MoS2/WS2",
            "structure_type": "intrinsic",
        },
        {
            "chemical_formula": "Nb:MoS2",
            "structure_type": "doped",
            "components": [
                {"formula": "MoS2", "role": "matrix"},
                {
                    "formula": "Nb",
                    "role": "dopant",
                    "concentration_at_percent": 101,
                },
            ],
        },
        {
            "chemical_formula": "Nb:MoS2",
            "structure_type": "doped",
            "components": [
                {"formula": "MoS2", "role": "matrix"},
                {
                    "formula": "Nb",
                    "role": "dopant",
                    "concentration_at_percent": 0,
                },
            ],
        },
        {
            "chemical_formula": "Nb:MoS2",
            "structure_type": "doped",
            "components": [
                {"formula": "MoS2", "role": "matrix"},
                {"formula": "Nb", "role": "dopant", "layer_order": 1},
            ],
        },
        {
            "chemical_formula": "MoS2",
            "structure_type": "doped",
            "components": [
                {"formula": "MoS2", "role": "matrix"},
                {
                    "formula": "Nb",
                    "role": "dopant",
                    "concentration_at_percent": 60,
                },
                {
                    "formula": "Re",
                    "role": "dopant",
                    "concentration_at_percent": 40,
                },
            ],
        },
        {
            "chemical_formula": "MoS2/WS2",
            "structure_type": "vertical_heterostructure",
            "components": [
                {"formula": "MoS2", "role": "bottom_layer", "layer_order": 1},
                {"formula": "WS2", "role": "top_layer", "layer_order": 1},
            ],
        },
        {
            "chemical_formula": "WS2/MoS2",
            "structure_type": "vertical_heterostructure",
            "components": [
                {"formula": "MoS2", "role": "bottom_layer", "layer_order": 1},
                {"formula": "WS2", "role": "top_layer", "layer_order": 2},
            ],
        },
        {
            "chemical_formula": "MoS2-WS2",
            "structure_type": "lateral_heterostructure",
            "components": [
                {"formula": "MoS2", "role": "lateral_domain"},
                {
                    "formula": "WS2",
                    "role": "lateral_domain",
                    "concentration_at_percent": 10,
                },
            ],
        },
    ],
)
def test_target_product_rejects_inconsistent_component_semantics(payload: dict) -> None:
    with pytest.raises(ValueError):
        validate_v2_module_payload("target_product", _target_product(**payload))


def test_target_product_accepts_each_supported_component_semantics() -> None:
    valid_payloads = [
        {
            "chemical_formula": "MoS2",
            "structure_type": "intrinsic",
        },
        {
            "chemical_formula": "MoS2",
            "structure_type": "doped",
            "components": [
                {"formula": "MoS2", "role": "matrix"},
                {
                    "formula": "Nb",
                    "role": "dopant",
                    "concentration_at_percent": 2.5,
                },
            ],
        },
        {
            "chemical_formula": "MoS2",
            "structure_type": "doped",
            "components": [
                {"formula": "MoS2", "role": "matrix"},
                {"formula": "Nb", "role": "dopant"},
                {
                    "formula": "Re",
                    "role": "dopant",
                    "concentration_at_percent": 1.0,
                },
            ],
        },
        {
            "chemical_formula": "Mo0.5W0.5S2",
            "structure_type": "alloy",
            "components": [
                {"formula": "Mo", "role": "alloy_component"},
                {"formula": "W", "role": "alloy_component"},
                {"formula": "S", "role": "alloy_component"},
            ],
        },
        {
            "chemical_formula": "MoS2/WS2",
            "structure_type": "vertical_heterostructure",
            "components": [
                {"formula": "MoS2", "role": "bottom_layer", "layer_order": 1},
                {"formula": "WS2", "role": "top_layer", "layer_order": 2},
            ],
        },
        {
            "chemical_formula": "MoS2-WS2",
            "structure_type": "lateral_heterostructure",
            "components": [
                {"formula": "MoS2", "role": "lateral_domain"},
                {"formula": "WS2", "role": "lateral_domain"},
            ],
        },
    ]

    for payload in valid_payloads:
        validate_v2_module_payload("target_product", _target_product(**payload))


@pytest.mark.parametrize(
    "components",
    [
        [
            {"formula": "Mo", "role": "alloy_component"},
            {"formula": "W", "role": "alloy_component"},
            {"formula": "W", "role": "alloy_component"},
            {"formula": "S", "role": "alloy_component"},
        ],
        [
            {
                "formula": "Mo",
                "role": "alloy_component",
                "concentration_at_percent": 50,
            },
            {
                "formula": "W",
                "role": "alloy_component",
                "concentration_at_percent": 25,
            },
            {
                "formula": "S",
                "role": "alloy_component",
                "concentration_at_percent": 24,
            },
        ],
        [
            {
                "formula": "Mo",
                "role": "alloy_component",
                "concentration_at_percent": 50,
            },
            {"formula": "W", "role": "alloy_component"},
            {
                "formula": "S",
                "role": "alloy_component",
                "concentration_at_percent": 50,
            },
        ],
    ],
)
def test_alloy_rejects_duplicate_missing_or_incomplete_composition(
    components: list[dict],
) -> None:
    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "target_product",
            _target_product(
                chemical_formula="MoWS2",
                structure_type="alloy",
                components=components,
            ),
        )


def test_alloy_accepts_complete_concentrations_with_float_tolerance() -> None:
    validated = validate_v2_module_payload(
        "target_product",
        _target_product(
            chemical_formula="MoWS2",
            structure_type="alloy",
            components=[
                {
                    "formula": "Mo",
                    "role": "alloy_component",
                    "concentration_at_percent": 33.3333,
                },
                {
                    "formula": "W",
                    "role": "alloy_component",
                    "concentration_at_percent": 33.3333,
                },
                {
                    "formula": "S",
                    "role": "alloy_component",
                    "concentration_at_percent": 33.3333,
                },
            ],
        ),
    )

    assert len(validated["components"]) == 3


def test_structured_geometry_zone_reference_event_and_other_gas_contracts() -> None:
    precursor = validate_v2_module_payload(
        "precursors",
        {
            "items": [
                {
                    "role": "main_precursor",
                    "phase_state": "solid",
                    "lot_ref": {
                        "entity_id": "7d9e7787-e5ef-4f34-818f-454a10263a3b",
                        "version": 2,
                    },
                    "amount": 20,
                    "loading_method": "boat",
                    "source_container": {
                        "material": "quartz",
                        "length_mm": 90,
                        "width_mm": 15,
                        "height_mm": 5,
                        "reset_count": 1,
                        "use_number_since_reset": 7,
                    },
                    "source_position": {
                        "zone_index": 1,
                        "distance_mm": -20,
                        "temperature_C": 620,
                        "temperature_basis": "estimate",
                    },
                }
            ]
        },
    )
    assert precursor["items"][0]["source_position"]["zone_index"] == 1
    with pytest.raises(ValueError, match="material_other"):
        validate_v2_module_payload(
            "precursors",
            {
                "items": [
                    _precursor_item(
                        source_container={
                            "material": "other",
                            "length_mm": 90.0,
                            "width_mm": 15.0,
                            "height_mm": 5.0,
                            "reset_count": 0,
                            "use_number_since_reset": 1,
                        }
                    )
                ]
            },
        )
    other_boat = validate_v2_module_payload(
        "precursors",
        {
            "items": [
                _precursor_item(
                    source_container={
                        "material": "other",
                        "material_other": "graphite",
                        "length_mm": 90.0,
                        "width_mm": 15.0,
                        "height_mm": 5.0,
                        "reset_count": 0,
                        "use_number_since_reset": 1,
                    }
                )
            ]
        },
    )
    assert other_boat["items"][0]["source_container"]["material_other"] == "graphite"

    substrate = validate_v2_module_payload(
        "substrates",
        {
            "items": [
                {
                    "piece_label": "S1",
                    "material": "sapphire_al2o3",
                    "lot_ref": LOT_REF,
                    "chemical_formula": "Al2O3",
                    "orientation_polish_availability": "reported",
                    "crystal_orientation": "c-plane",
                    "miscut_availability": "reported",
                    "miscut_angle_deg": 0,
                    "surface_roughness": {"metric": "RMS", "value_nm": 0.5},
                    "size_placement": {
                        "length_mm": 10,
                        "width_mm": 10,
                        "thickness_mm": 0.5,
                        "placement": "face_up",
                    },
                    "zone_thermocouple_distance_mm": {
                        "zone_index": 2,
                        "distance_mm": 15,
                    },
                }
            ]
        },
    )
    assert substrate["items"][0]["size_placement"]["thickness_mm"] == 0.5

    event = validate_v2_module_payload(
        "process_events",
        {
            "items": [
                {
                    "event_id": "366f5ef9-0fac-4b53-81bf-92e094e39432",
                    "event_type": "manual_intervention",
                    "occurred_at": "2026-07-08T10:28:00+08:00",
                    "terminated_run": False,
                }
            ]
        },
    )
    assert event["items"][0]["occurred_at"] == "2026-07-08T10:28:00+08:00"

    for termination in (
        {"terminated_run": False},
        {"terminated_run": True, "termination_reason": "equipment_alarm"},
    ):
        described = validate_v2_module_payload(
            "process_events",
            {
                "items": [
                    {
                        "event_id": "366f5ef9-0fac-4b53-81bf-92e094e39435",
                        "event_type": "equipment_alarm",
                        "occurred_at": "2026-07-08T10:28:00+08:00",
                        "description": "报警时炉压短时波动",
                        **termination,
                    }
                ]
            },
        )
        assert described["items"][0]["description"] == "报警时炉压短时波动"

    with pytest.raises(ValueError, match="description is conditionally required"):
        validate_v2_module_payload(
            "process_events",
            {
                "items": [
                    {
                        "event_id": "366f5ef9-0fac-4b53-81bf-92e094e39433",
                        "event_type": "equipment_alarm",
                        "occurred_at": "2026-07-08T10:28:00+08:00",
                        "terminated_run": True,
                        "termination_reason": "other",
                    }
                ]
            },
        )

    named_other = validate_v2_module_payload(
        "process_events",
        {
            "items": [
                {
                    "event_id": "366f5ef9-0fac-4b53-81bf-92e094e39434",
                    "event_type": "equipment_alarm",
                    "occurred_at": "2026-07-08T10:28:00+08:00",
                    "terminated_run": True,
                    "termination_reason": "other",
                    "description": "联锁触发，具体分类待设备日志确认",
                }
            ]
        },
    )
    assert named_other["items"][0]["description"].startswith("联锁触发")


def test_temperature_program_rejects_text_and_non_increasing_points() -> None:
    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "process_steps",
            {"items": [_reaction_step(temperature_program="x")]},
        )

    invalid_program = deepcopy(_reaction_step()["temperature_program"])
    invalid_program["zones"][0]["points"][1]["elapsed_min"] = 0.0
    with pytest.raises(ValueError, match="strictly increase"):
        validate_v2_module_payload(
            "process_steps",
            {"items": [_reaction_step(temperature_program=invalid_program)]},
        )
    below_absolute_zero = deepcopy(_reaction_step()["temperature_program"])
    below_absolute_zero["zones"][0]["points"][0]["setpoint_C"] = -273.15
    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "process_steps",
            {"items": [_reaction_step(temperature_program=below_absolute_zero)]},
        )


def test_each_gas_keeps_its_own_lot_source_and_supply_intervals() -> None:
    gas_feeds = [
        {
            "species": "Ar",
            "lot_ref": LOT_REF,
            "measurement_source": "mfc",
            "intervals": [
                {"start_min": 0.0, "end_min": 10.0, "flow_sccm": 80.0},
                {"start_min": 20.0, "end_min": 30.0, "flow_sccm": 60.0},
            ],
        },
        {
            "species": "H2",
            "lot_ref": {**LOT_REF, "version": 3},
            "measurement_source": "rotameter",
            "intervals": [{"start_min": 5.0, "end_min": 25.0, "flow_sccm": 10.0}],
        },
    ]

    validated = validate_v2_module_payload(
        "process_steps",
        {"items": [_reaction_step(gas_feeds=gas_feeds)]},
    )

    saved = validated["items"][0]["gas_feeds"]
    assert [(item["species"], item["lot_ref"]["version"]) for item in saved] == [
        ("Ar", 2),
        ("H2", 3),
    ]
    assert [interval["flow_sccm"] for interval in saved[0]["intervals"]] == [80.0, 60.0]
    assert saved[1]["measurement_source"] == "rotameter"


def test_tilt_angle_is_required_only_for_tilted_substrate() -> None:
    with pytest.raises(ValueError, match="tilt_angle_deg"):
        validate_v2_module_payload(
            "substrates",
            {
                "items": [
                    _substrate_item(
                        size_placement={
                            "length_mm": 10.0,
                            "width_mm": 10.0,
                            "placement": "tilted",
                        }
                    )
                ]
            },
        )
    with pytest.raises(ValueError, match="tilt_angle_deg"):
        validate_v2_module_payload(
            "substrates",
            {
                "items": [
                    _substrate_item(
                        size_placement={
                            "length_mm": 10.0,
                            "width_mm": 10.0,
                            "placement": "face_up",
                            "tilt_angle_deg": 15.0,
                        }
                    )
                ]
            },
        )

    validated = validate_v2_module_payload(
        "substrates",
        {
            "items": [
                _substrate_item(
                    size_placement={
                        "length_mm": 10.0,
                        "width_mm": 10.0,
                        "placement": "tilted",
                        "tilt_angle_deg": 15.0,
                    }
                )
            ]
        },
    )
    assert validated["items"][0]["size_placement"]["tilt_angle_deg"] == 15.0


def test_named_other_stage_round_trips_and_requires_name_and_notes() -> None:
    with pytest.raises(ValueError):
        validate_v2_module_payload("process_steps", {"items": [{"stage_type": "other"}]})
    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "process_steps",
            {"items": [{"stage_type": "other", "other_stage_name": " ", "notes": " "}]},
        )

    validated = validate_v2_module_payload(
        "process_steps",
        {
            "items": [
                {
                    "stage_type": "other",
                    "other_stage_name": "Temporary source move",
                    "notes": "Moved at t=12 min and restored at t=14 min",
                }
            ]
        },
    )
    assert validated["items"][0] == {
        "stage_type": "other",
        "other_stage_name": "Temporary source move",
        "notes": "Moved at t=12 min and restored at t=14 min",
    }


def test_equipment_snapshot_uses_structured_tube_sensors_and_file_reference() -> None:
    payload = {
        "setup_ref": "setup-1@v2",
        "setup_origin": "commercial",
        "zone_count": 2,
        "orientation": "水平",
        "tube_material_shape": {"material": "石英", "shape": "圆形"},
        "tube_outer_diameter_wall_mm": {
            "outer_diameter_mm": 50.0,
            "wall_thickness_mm": 2.0,
        },
        "tube_usage_history": {
            "reset_count": 1,
            "use_number_since_reset": 7,
        },
        "field_devices": ["等离子体"],
        "temperature_sensors": [
            {
                "sensor_type": "thermocouple",
                "zone_index": 1,
                "nominal_accuracy_C": 1.0,
            },
            {
                "sensor_type": "thermocouple",
                "zone_index": 2,
            },
        ],
        "setup_diagram": {
            "file_asset_id": "366f5ef9-0fac-4b53-81bf-92e094e39432",
            "sha256": "a" * 64,
        },
    }

    validated = validate_v2_module_payload("equipment", payload)

    assert validated["tube_material_shape"] == {
        "material": "quartz",
        "material_other": None,
        "shape": "round",
        "shape_other": None,
    }
    assert validated["temperature_sensors"][0]["sensor_type"] == "thermocouple"
    assert validated["field_devices"] == ["plasma"]
    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "equipment",
            {**payload, "tube_material_shape": "石英/圆形"},
        )
    with pytest.raises(ValueError):
        validate_v2_module_payload("equipment", {**payload, "temperature_sensors": []})
    invalid_source = deepcopy(payload)
    invalid_source["temperature_sensors"][0]["sensor_type"] = "k_thermocouple"
    with pytest.raises(ValueError):
        validate_v2_module_payload("equipment", invalid_source)


def test_rendered_equipment_and_setup_models_enforce_shape_and_zone_contracts(
    rendered_models: ModuleType,
) -> None:
    sensors = [
        {
            "sensor_type": "thermocouple",
            "zone_index": zone_index,
            "nominal_accuracy_C": 1.0,
        }
        for zone_index in (1, 2)
    ]
    equipment = {
        "setup_ref": "setup-1@v2",
        "setup_origin": "commercial",
        "zone_count": 2,
        "orientation": "horizontal",
        "tube_material_shape": {"material": "quartz", "shape": "round"},
        "tube_outer_diameter_wall_mm": {
            "outer_diameter_mm": 50.0,
            "wall_thickness_mm": 2.0,
        },
        "temperature_sensors": sensors,
        "tube_usage_history": {
            "reset_count": 0,
            "use_number_since_reset": 1,
        },
    }
    setup = {
        "setup_code": "SETUP-1",
        "setup_name": "Two-zone furnace",
        "field_devices": ["none"],
        **{
            key: value
            for key, value in equipment.items()
            if key not in {"setup_ref", "tube_usage_history"}
        },
    }

    for model, payload in (
        (rendered_models.EquipmentPayload, equipment),
        (rendered_models.SetupVersionPayload, setup),
    ):
        model.model_validate(payload)

        unpaired = deepcopy(payload)
        unpaired.pop("tube_outer_diameter_wall_mm")
        with pytest.raises(ValueError, match="must be provided together|Field required"):
            model.model_validate(unpaired)

        wrong_shape = deepcopy(payload)
        wrong_shape["tube_outer_diameter_wall_mm"] = {
            "outer_side_mm": 50.0,
            "wall_thickness_mm": 2.0,
        }
        with pytest.raises(ValueError, match="do not match"):
            model.model_validate(wrong_shape)

        duplicate_zone = deepcopy(payload)
        duplicate_zone["temperature_sensors"][1]["zone_index"] = 1
        with pytest.raises(ValueError, match="cover each zone exactly once"):
            model.model_validate(duplicate_zone)


def test_rendered_precursor_and_local_condition_contracts(
    rendered_models: ModuleType,
) -> None:
    with pytest.raises(ValueError, match="source_position is conditionally required"):
        rendered_models.PrecursorItemPayload.model_validate(_precursor_item(source_position=None))
    rendered_models.PrecursorItemPayload.model_validate(
        _precursor_item(
            source_position={"zone_index": 1, "distance_mm": -20.0},
        )
    )

    with pytest.raises(ValueError, match="appearance is not applicable"):
        rendered_models.PrecursorItemPayload.model_validate(
            {
                "role": "main_precursor",
                "phase_state": "gas",
                "appearance": "gas",
                "lot_ref": LOT_REF,
            }
        )
    rendered_models.PrecursorItemPayload.model_validate(_precursor_item())

    with pytest.raises(ValueError, match="gas_purity_grade is not applicable"):
        rendered_models.MaterialLotVersionPayload.model_validate(
            {
                "lot_category": "chemical",
                "substance_name": "MoO3",
                "chemical_formula": "MoO3",
                "cas_number": "1313-27-5",
                "batch_number": "M-1",
                "purity": 99.9,
                "purity_basis": "mass_fraction",
                "purity_source": "supplier_declared",
                "gas_purity_grade": "5N",
            }
        )
    rendered_models.MaterialLotVersionPayload.model_validate(
        {
            "lot_category": "gas_cylinder",
            "substance_name": "Argon",
            "chemical_formula": "Ar",
            "cas_number": "7440-37-1",
            "batch_number": "AR-1",
            "purity": 99.999,
            "purity_basis": "volume_fraction",
            "purity_source": "supplier_declared",
        }
    )


def test_treatment_and_pretreatment_steps_use_discriminated_parameter_objects() -> None:
    precursors = validate_v2_module_payload(
        "precursors",
        {
            "items": [
                _precursor_item(
                    treatment_steps=[
                        {
                            "type": "旋涂",
                            "parameters": {"speed_rpm": 3000.0, "duration_s": 60.0},
                        },
                        {
                            "type": "其他",
                            "other_name": "Sieving",
                            "parameters": {},
                        },
                    ]
                )
            ]
        },
    )
    assert [step["type"] for step in precursors["items"][0]["treatment_steps"]] == [
        "spin_coat",
        "other",
    ]

    with pytest.raises(ValueError, match="direct_load cannot be combined"):
        validate_v2_module_payload(
            "precursors",
            {
                "items": [
                    _precursor_item(
                        treatment_steps=[
                            {"type": "直接加载", "parameters": {}},
                            {
                                "type": "旋涂",
                                "parameters": {
                                    "speed_rpm": 3000.0,
                                    "duration_s": 60.0,
                                },
                            },
                        ]
                    )
                ]
            },
        )

    substrates = validate_v2_module_payload(
        "substrates",
        {
            "items": [
                _substrate_item(
                    pretreatment_steps=[
                        {"type": "丙酮清洗", "parameters": {"duration_min": 10.0}},
                        {
                            "type": "等离子体",
                            "parameters": {
                                "power_W": 50.0,
                                "gas_species": "O2",
                                "duration_min": 2.0,
                                "pressure_Pa": 20.0,
                            },
                        },
                    ]
                )
            ]
        },
    )
    assert substrates["items"][0]["pretreatment_steps"][1]["type"] == "plasma_treatment"

    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "precursors",
            {"items": [_precursor_item(treatment_steps=["旋涂"])]},
        )


def test_process_structures_preserve_preparation_measurement_cooling_and_fields() -> None:
    preparation = validate_v2_module_payload(
        "process_steps",
        {
            "items": [
                {
                    "stage_type": "预处理",
                    "preparation_operations": [
                        {
                            "operation_type": "气路置换",
                            "cycle_count": 3,
                            "duration_min": 12.0,
                            "gases": [
                                {
                                    "species": "N₂",
                                    "lot_ref": LOT_REF,
                                    "flow_sccm": 100.0,
                                }
                            ],
                        }
                    ],
                }
            ]
        },
    )
    assert preparation["items"][0]["preparation_operations"][0]["operation_type"] == (
        "gas_exchange"
    )

    reaction = _reaction_step(
        measured_temperature={
            "file_asset_id": "366f5ef9-0fac-4b53-81bf-92e094e39432",
            "time_column": "elapsed_min",
            "channels": [{"zone_index": 1, "column_name": "zone1_C"}],
        },
        cooling_params={
            "method": "开盖冷却",
            "lid_open_temperature_C": 580.0,
            "cooling_rate_C_per_min": 20.0,
        },
        field_params=[
            {
                "field_type": "等离子",
                "start_min": 10.0,
                "end_min": 20.0,
                "parameters": [
                    {"name": "power", "value": 50.0, "unit": "W"},
                    {"name": "gas", "value": "Ar", "unit": "—"},
                    {"name": "pressure", "value": 50.0, "unit": "Pa"},
                ],
            }
        ],
    )
    validated = validate_v2_module_payload("process_steps", {"items": [reaction]})
    saved = validated["items"][0]
    assert saved["measured_temperature"]["channels"][0]["column_name"] == "zone1_C"
    assert saved["cooling_params"]["method"] == "open_lid_cooling"
    assert saved["field_params"][0]["field_type"] == "plasma"

    invalid_field_parameters = [
        [{"name": "frequency", "value": 13.56, "unit": "MHz"}],
        [
            {"name": "power_W", "value": -1.0, "unit": "W"},
            {"name": "gas_species", "value": "Ar", "unit": "—"},
            {"name": "pressure_Pa", "value": 50.0, "unit": "Pa"},
        ],
        [
            {"name": "power_W", "value": 50.0, "unit": "W"},
            {"name": "gas_species", "value": "Ar", "unit": "—"},
            {"name": "pressure_Pa", "value": 50.0, "unit": "Pa"},
            {"name": "wavelength_nm", "value": 365.0, "unit": "nm"},
        ],
    ]
    for parameters in invalid_field_parameters:
        with pytest.raises(ValueError):
            validate_v2_module_payload(
                "process_steps",
                {
                    "items": [
                        _reaction_step(
                            field_params=[
                                {
                                    "field_type": "plasma",
                                    "start_min": 10.0,
                                    "end_min": 20.0,
                                    "parameters": parameters,
                                }
                            ]
                        )
                    ]
                },
            )

    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "process_steps",
            {"items": [_reaction_step(measured_temperature="temperature.csv")]},
        )
    with pytest.raises(ValueError, match="lid_open_temperature_C"):
        validate_v2_module_payload(
            "process_steps",
            {"items": [_reaction_step(cooling_params={"method": "open_lid_cooling"})]},
        )
    gas_with_copied_purity = deepcopy(_reaction_step()["gas_feeds"])
    gas_with_copied_purity[0]["purity"] = 99.999
    with pytest.raises(ValueError, match="purity"):
        validate_v2_module_payload(
            "process_steps",
            {"items": [_reaction_step(gas_feeds=gas_with_copied_purity)]},
        )


@pytest.mark.parametrize(
    ("field_type", "parameters"),
    [
        (
            "light",
            [
                {"name": "wavelength_nm", "value": 365.0, "unit": "nm"},
                {
                    "name": "irradiance_mW_cm2",
                    "value": 12.0,
                    "unit": "mW·cm⁻²",
                },
                {"name": "source_distance_mm", "value": 30.0, "unit": "mm"},
            ],
        ),
        (
            "electric_field",
            [
                {
                    "name": "field_strength_V_cm",
                    "value": 100.0,
                    "unit": "V·cm⁻¹",
                },
                {"name": "electrode_gap_mm", "value": 5.0, "unit": "mm"},
                {"name": "direction", "value": "parallel", "unit": "—"},
            ],
        ),
    ],
)
def test_external_field_types_require_their_explicit_parameter_contract(
    field_type: str,
    parameters: list[dict],
) -> None:
    validated = validate_v2_module_payload(
        "process_steps",
        {
            "items": [
                _reaction_step(
                    field_params=[
                        {
                            "field_type": field_type,
                            "start_min": 5.0,
                            "end_min": 20.0,
                            "parameters": parameters,
                        }
                    ]
                )
            ]
        },
    )
    assert validated["items"][0]["field_params"][0]["field_type"] == field_type

    both_magnitudes = deepcopy(parameters)
    both_magnitudes.append(
        {
            "name": "power_mW" if field_type == "light" else "voltage_V",
            "value": 10.0,
            "unit": "mW" if field_type == "light" else "V",
        }
    )
    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "process_steps",
            {
                "items": [
                    _reaction_step(
                        field_params=[
                            {
                                "field_type": field_type,
                                "start_min": 5.0,
                                "end_min": 20.0,
                                "parameters": both_magnitudes,
                            }
                        ]
                    )
                ]
            },
        )


def test_generator_fails_closed_for_unknown_complex_input_type() -> None:
    doc = deepcopy(load_field_source())
    field = next(
        item
        for section in doc["experiment_record"]["sections"]
        for item in section["fields"]
        if item["key"] == "target_performance"
    )
    field["input"] = "未实现的复杂对象"

    with pytest.raises(ValueError, match="Unsupported input type"):
        render_v2_models(doc)
