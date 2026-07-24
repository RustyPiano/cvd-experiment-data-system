from pathlib import Path

import openpyxl
import pytest
from jsonschema import Draft202012Validator

from app.commands.export_v2_schema import export_v2_schema
from app.commands.generate_v2_models import generate_v2_models
from app.schemas.generated.v2_module_payload import validate_v2_module_payload
from app.services.v2_field_source import missing

REPO_ROOT = Path(__file__).resolve().parents[3]
GENERATED_SCHEMA_DIR = REPO_ROOT / "docs" / "standard" / "generated"
GENERATED_MODEL = REPO_ROOT / "backend" / "app" / "schemas" / "generated" / "v2_module_payload.py"


def test_generate_v2_models_matches_committed_file(tmp_path: Path) -> None:
    generated = generate_v2_models(output_path=tmp_path / "v2_module_payload.py")

    assert Path(generated).read_bytes() == GENERATED_MODEL.read_bytes()


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
        "cooling",
        "growth",
        "none",
        "substrate",
        "gas_cylinder",
    }


def test_standard_schema_exports_structured_result_models_and_validation() -> None:
    schema = export_v2_schema(output_dir=None)["json_schema_doc"]

    assert {"unified_result_write", "measured_product_metrics"} <= set(schema["result_models"])
    unified = schema["result_models"]["unified_result_write"]
    Draft202012Validator.check_schema(unified)
    properties = unified["properties"]
    assert properties["coverage_percent"]["anyOf"][0]["minimum"] == 0
    assert properties["coverage_percent"]["anyOf"][0]["maximum"] == 100
    metric = unified["$defs"]["SpectralMetric"]
    assert metric["required"] == ["metric_code", "value", "unit"]
    assert metric["properties"]["metric_code"]["pattern"] == "^[a-z][a-z0-9_]*$"


def test_field_dictionary_and_xlsx_expose_machine_validation_contract() -> None:
    dictionary = export_v2_schema(output_dir=None)["field_dictionary_doc"]
    spectral = next(
        field
        for field in dictionary["fields"]
        if field["module_key"] == "measured_products" and field["key"] == "key_spectral_metrics"
    )
    assert spectral["unit"] == "按指标"
    assert spectral["validation"] == {
        "item_required": ["metric_code", "value", "unit"],
        "finite_value": True,
    }

    workbook = openpyxl.load_workbook(REPO_ROOT / "docs" / "standard" / "字段草案-v3.xlsx")
    sheet = workbook["字段草案"]
    headers = [cell.value for cell in sheet[1]]
    assert headers[-1] == "机器约束"
    machine_column = len(headers)
    amount_row = next(
        row for row in range(1, sheet.max_row + 1) if sheet.cell(row, 2).value == "用量"
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
            "items": [
                {
                    "stage_type": "cooling",
                    "temperature_program": "750->25",
                    "cooling_params": {"value": None, "option": "furnace_cooling"},
                    "gas_species": ["Ar"],
                    "gas_flow_sccm": {"value": 80, "option": "MFC"},
                }
            ]
        }
    )
    assert validator.is_valid({"items": [{"stage_type": "unload"}]})
    assert not validator.is_valid(
        {"items": [{"stage_type": "unload", "temperature_program": "should be hidden"}]}
    )


def test_generated_v2_payload_models_apply_record_local_conditions() -> None:
    target_product = validate_v2_module_payload(
        "target_product",
        {
            "chemical_formula": "Nb:MoS2",
            "structure_type": "掺杂",
            "components": [
                {"formula": "MoS2", "role": "基体"},
                {"formula": "Nb", "role": "掺杂剂"},
            ],
        },
    )
    assert target_product["components"][0]["formula"] == "MoS2"

    try:
        validate_v2_module_payload(
            "target_product",
            {"chemical_formula": "Nb:MoS2", "structure_type": "掺杂"},
        )
    except ValueError as exc:
        assert "components" in str(exc)
    else:
        raise AssertionError("components should be required when structure_type != 本征")

    growth = validate_v2_module_payload(
        "process_steps",
        {
            "items": [
                {
                    "stage_type": "反应生长",
                    "temperature_program": "25->750",
                    "gas_species": "Ar",
                    "gas_flow_sccm": 80,
                    "pressure_system": {
                        "value": 101325,
                        "option": "常压",
                    },
                }
            ]
        },
    )
    assert growth["items"][0]["stage_type"] == "growth"


@pytest.mark.parametrize("invalid", ["25", True, float("nan"), float("inf")])
def test_generated_numeric_fields_reject_non_json_or_non_finite_numbers(invalid) -> None:
    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "basic_info",
            {
                "started_at": "2026-07-22T09:00:00",
                "synthesis_method": "APCVD",
                "operator": "Tester",
                "run_code": "CVD-2026-0001",
                "ambient_temperature_C": invalid,
            },
        )


@pytest.mark.parametrize("invalid", ["194", 194.0, True, 0, 231])
def test_bulk_space_group_is_a_strict_it_number(invalid) -> None:
    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "target_product",
            {
                "chemical_formula": "MoS2",
                "structure_type": "intrinsic",
                "bulk_space_group": invalid,
            },
        )
    valid = validate_v2_module_payload(
        "target_product",
        {
            "chemical_formula": "MoS2",
            "structure_type": "intrinsic",
            "bulk_space_group": 194,
        },
    )
    assert valid["bulk_space_group"] == 194


def test_composite_and_component_vocabularies_are_field_specific() -> None:
    valid = validate_v2_module_payload(
        "process_steps",
        {
            "items": [
                {
                    "stage_type": "vent",
                    "gas_species": ["Ar"],
                    "gas_flow_sccm": {"value": 80, "option": "MFC"},
                }
            ]
        },
    )
    assert valid["items"][0]["gas_flow_sccm"] == {"value": 80.0, "option": "MFC"}

    for bad_flow in (
        {"value": "80", "option": "MFC"},
        {"value": 80, "option": "atmospheric_pressure"},
        {"value": float("nan"), "option": "MFC"},
    ):
        with pytest.raises(ValueError):
            validate_v2_module_payload(
                "process_steps",
                {
                    "items": [
                        {
                            "stage_type": "vent",
                            "gas_species": ["Ar"],
                            "gas_flow_sccm": bad_flow,
                        }
                    ]
                },
            )

    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "target_product",
            {
                "chemical_formula": "Nb:MoS2",
                "structure_type": "doped",
                "components": [{"formula": "Nb", "role": "other"}],
            },
        )


def test_formula_normalization_matches_the_frontend_contract() -> None:
    normalized = validate_v2_module_payload(
        "target_product",
        {"chemical_formula": " Mo S₂ ", "structure_type": "intrinsic"},
    )
    assert normalized["chemical_formula"] == "MoS2"
    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "target_product",
            {"chemical_formula": "Mo(S)2", "structure_type": "intrinsic"},
        )


def test_required_values_reject_blank_strings_and_empty_composite_shells() -> None:
    assert missing("   ")
    assert missing({"value": None, "option": None})
    assert not missing({"value": None, "option": "furnace_cooling"})
    assert not missing({"value": 80, "option": "MFC"})


@pytest.mark.parametrize(
    ("module_key", "payload"),
    [
        (
            "basic_info",
            {
                "started_at": "2026-07-22T09:00:00+08:00",
                "synthesis_method": "APCVD",
                "operator": "Tester",
                "run_code": "CVD-2026-0001",
                "ambient_humidity_percent": 100.1,
            },
        ),
        (
            "basic_info",
            {
                "started_at": "2026-07-22T09:00:00+08:00",
                "synthesis_method": "APCVD",
                "operator": "Tester",
                "run_code": "CVD-2026-0001",
                "particle_count_per_m3": -1,
            },
        ),
        (
            "target_product",
            {
                "chemical_formula": "MoS2",
                "structure_type": "intrinsic",
                "target_layer_count": 0,
            },
        ),
        (
            "precursors",
            {
                "items": [
                    {
                        "name_formula": "MoO3",
                        "phase_state": "solid",
                        "amount": -0.1,
                    }
                ]
            },
        ),
        (
            "substrates",
            {
                "items": [
                    {
                        "material": "sio2_si",
                        "oxide_thickness_nm": -1,
                    }
                ]
            },
        ),
        (
            "process_steps",
            {
                "items": [
                    {
                        "stage_type": "growth",
                        "temperature_program": "25->750",
                        "gas_species": ["Ar"],
                        "gas_flow_sccm": {"value": -1, "option": "MFC"},
                        "pressure_system": {
                            "value": 101325,
                            "option": "atmospheric_pressure",
                        },
                        "duration_cycles": -1,
                    }
                ]
            },
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
            {
                "items": [
                    {
                        "name_formula": "MoO3",
                        "phase_state": "solid",
                        "amount": 0,
                    }
                ]
            },
        ),
        (
            "substrates",
            {
                "items": [
                    {
                        "material": "sio2_si",
                        "oxide_thickness_nm": 0,
                    }
                ]
            },
        ),
        (
            "process_steps",
            {
                "items": [
                    {
                        "stage_type": "growth",
                        "temperature_program": "25->750",
                        "gas_species": ["Ar"],
                        "gas_flow_sccm": {"value": 0, "option": "MFC"},
                        "pressure_system": {
                            "value": 101325,
                            "option": "atmospheric_pressure",
                        },
                        "duration_cycles": 0,
                    }
                ]
            },
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
        {
            "started_at": "2026-07-22T09:00:00+08:00",
            "synthesis_method": "APCVD",
            "operator": "Tester",
            "run_code": "CVD-2026-0001",
            "particle_count_per_m3": 0,
        },
    )
    assert basic["particle_count_per_m3"] == 0


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
            "chemical_formula": "WS2/MoS2",
            "structure_type": "vertical_heterostructure",
            "components": [
                {"formula": "WS2", "role": "top_layer", "layer_order": 1},
                {"formula": "MoS2", "role": "bottom_layer", "layer_order": 2},
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
        validate_v2_module_payload("target_product", payload)


def test_target_product_accepts_each_supported_component_semantics() -> None:
    valid_payloads = [
        {
            "chemical_formula": "MoS2",
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
                    "concentration_at_percent": 2.5,
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
        validate_v2_module_payload("target_product", payload)


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
            {"formula": "Mo", "role": "alloy_component"},
            {"formula": "W", "role": "alloy_component"},
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
            {
                "chemical_formula": "MoWS2",
                "structure_type": "alloy",
                "components": components,
            },
        )


def test_alloy_accepts_complete_concentrations_with_float_tolerance() -> None:
    validated = validate_v2_module_payload(
        "target_product",
        {
            "chemical_formula": "MoWS2",
            "structure_type": "alloy",
            "components": [
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
        },
    )

    assert len(validated["components"]) == 3


def test_structured_geometry_zone_reference_event_and_other_gas_contracts() -> None:
    precursor = validate_v2_module_payload(
        "precursors",
        {
            "items": [
                {
                    "name_formula": "MoO3",
                    "phase_state": "solid",
                    "lot_ref": {
                        "entity_id": "7d9e7787-e5ef-4f34-818f-454a10263a3b",
                        "version": 2,
                    },
                    "amount": 20,
                    "boat_crucible": {
                        "material": "quartz_boat",
                        "length_mm": 90,
                        "width_mm": 15,
                        "height_mm": 5,
                    },
                    "source_zone_temperature": {
                        "zone_index": 1,
                        "temperature_C": 620,
                    },
                }
            ]
        },
    )
    assert precursor["items"][0]["source_zone_temperature"]["zone_index"] == 1

    substrate = validate_v2_module_payload(
        "substrates",
        {
            "items": [
                {
                    "material": "sapphire_al2o3",
                    "lot_ref": {
                        "entity_id": "7d9e7787-e5ef-4f34-818f-454a10263a3b",
                        "version": 2,
                    },
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
                    "event_part": "manual_intervention",
                    "occurred_at": "2026-07-08T10:28:00+08:00",
                }
            ]
        },
    )
    assert event["items"][0]["occurred_at"] == "2026-07-08T10:28:00+08:00"

    with pytest.raises(ValueError):
        validate_v2_module_payload(
            "process_steps",
            {
                "items": [
                    {
                        "stage_type": "vent",
                        "gas_species": ["other"],
                        "gas_flow_sccm": {"value": 80, "option": "MFC"},
                    }
                ]
            },
        )
    valid_other = validate_v2_module_payload(
        "process_steps",
        {
            "items": [
                {
                    "stage_type": "vent",
                    "gas_species": ["other"],
                    "other_gas_name": "NH3",
                    "gas_flow_sccm": {"value": 80, "option": "MFC"},
                }
            ]
        },
    )
    assert valid_other["items"][0]["other_gas_name"] == "NH3"
