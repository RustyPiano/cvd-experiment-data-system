from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from app.commands.export_v2_schema import export_v2_schema
from app.commands.generate_v2_models import generate_v2_models
from app.schemas.generated.v2_module_payload import validate_v2_module_payload

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
            "chemical_formula": "MoS2:Nb",
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
            {"chemical_formula": "MoS2:Nb", "structure_type": "掺杂"},
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
                    "pressure_system": "常压",
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
