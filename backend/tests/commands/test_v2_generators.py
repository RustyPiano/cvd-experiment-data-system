from pathlib import Path

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
                    "stage_type": "降温",
                    "temperature_program": "750->25",
                    "cooling_params": "随炉冷却",
                    "gas_species": "Ar",
                    "gas_flow_sccm": 80,
                }
            ]
        }
    )
    assert not validator.is_valid(
        {"items": [{"stage_type": "卸样", "temperature_program": "should be hidden"}]}
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
    assert growth["items"][0]["stage_type"] == "反应生长"
