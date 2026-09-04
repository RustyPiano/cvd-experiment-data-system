from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.schemas.scientific import SourceLoadsPayload, normalize_source_loads_for_read
from app.services.v2_experiment_service import V2ExperimentService
from app.services.v2_process_semantics import valid_frozen_gas_reference
from app.services.v2_reporting_service import V2ReportingService

LOT_ID = "11111111-1111-4111-8111-111111111111"
SUBSTRATE_ID = "22222222-2222-4222-8222-222222222222"


def test_coating_methods_require_the_right_quantity_and_preserve_legacy_steps() -> None:
    load = {
        "load_key": "coating",
        "loading_method": "substrate_surface",
        "substrate_source_ids": [SUBSTRATE_ID],
        "preparation_steps": [
            {
                "step_type": "dip_coat",
                "sequence": 1,
                "parameters": {"solvent": "水", "duration_min": 5},
            }
        ],
        "ingredients": [
            {
                "material_lot_id": LOT_ID,
                "material_lot_version": 1,
                "concentration_value": 0.1,
                "concentration_unit": "mol_per_L",
            }
        ],
    }

    def validate(value):
        return SourceLoadsPayload.model_validate({"items": [value]}).items[0]

    assert validate(load).ingredients[0].amount is None
    for missing in ("solvent", "duration_min"):
        bad = deepcopy(load)
        bad["preparation_steps"][0]["parameters"].pop(missing)
        with pytest.raises(ValueError):
            validate(bad)
    bad = deepcopy(load)
    bad["ingredients"][0].pop("concentration_value")
    bad["ingredients"][0].pop("concentration_unit")
    with pytest.raises(ValueError, match="require solution concentration"):
        validate(bad)

    load["preparation_steps"] = [
        {"step_type": "drop_cast", "sequence": 1, "parameters": {"solvent": "水"}}
    ]
    with pytest.raises(ValueError, match="amount"):
        validate(load)
    load["ingredients"][0].update(amount=20, unit="mg")
    with pytest.raises(ValueError, match="volume"):
        validate(load)
    load["ingredients"][0]["unit"] = "μL"
    assert validate(load).ingredients[0].amount == 20
    bad = deepcopy(load)
    bad["loading_method"] = "boat"
    with pytest.raises(ValueError, match="does not apply"):
        validate(bad)
    bad = deepcopy(load)
    bad["preparation_steps"].append({"step_type": "direct_load", "sequence": 2, "parameters": {}})
    with pytest.raises(ValueError, match="cannot be combined"):
        validate(bad)

    old = {
        "items": [
            {
                "preparation_steps": [
                    {"step_type": "mix", "sequence": 1, "parameters": {"items": []}},
                    {
                        "step_type": "pre_anneal",
                        "sequence": 2,
                        "parameters": {"temperature_C": 300, "duration_min": 10},
                    },
                ]
            }
        ]
    }
    original = deepcopy(old)
    normalized = normalize_source_loads_for_read(old)
    assert old == original
    steps = normalized["items"][0]["preparation_steps"]
    assert [step["step_type"] for step in steps] == ["other", "other"]
    assert steps[1]["parameters"]["items"][0] == {
        "name": "temperature_C",
        "value": 300,
        "unit": "°C",
    }


def test_boat_and_crucible_treatment_sequences() -> None:
    for method in ("boat", "crucible"):
        payload = {
            "items": [
                {
                    "load_key": "powder",
                    "loading_method": method,
                    "heating_zone_ref": "zone_1",
                    "initial_position": {"reference": "zone_thermocouple", "axial_mm": -20},
                    "preparation_steps": [
                        {"step_type": "grind", "sequence": 1, "parameters": {}},
                        {
                            "step_type": "pelletize",
                            "sequence": 2,
                            "parameters": {"pressure_MPa": 10},
                        },
                        {"step_type": "melt", "sequence": 3, "parameters": {"temperature_C": 200}},
                    ],
                    "ingredients": [
                        {
                            "material_lot_id": LOT_ID,
                            "material_lot_version": 1,
                            "amount": 10,
                            "unit": "mg",
                        }
                    ],
                }
            ]
        }
        assert len(SourceLoadsPayload.model_validate(payload).items[0].preparation_steps) == 3


def test_co2_gas_identity_uses_the_field_source_aliases() -> None:
    reference = {
        "entity_id": LOT_ID,
        "version": 1,
        "snapshot": {
            "entity_id": LOT_ID,
            "version": 1,
            "lot_category": "gas_cylinder",
            "substance_name": "二氧化碳",
            "chemical_formula": "CO₂",
            "batch_number": "CO2-01",
            "attrs": {"gas_purity_grade": "5N"},
        },
    }
    assert valid_frozen_gas_reference({"species": "CO2", "lot_ref": reference})
    assert not valid_frozen_gas_reference({"species": "Ar", "lot_ref": reference})


def test_precursor_feedback_contract_and_legacy_spin_normalization() -> None:
    new_payload = {
        "items": [
            {
                "load_key": "coated_solution",
                "loading_method": "substrate_surface",
                "substrate_source_ids": [SUBSTRATE_ID],
                "preparation_steps": [
                    {
                        "step_type": "spin_coat",
                        "sequence": 1,
                        "parameters": {
                            "stages": [
                                {"speed_rpm": 1000, "duration_s": 10},
                                {"speed_rpm": 6000, "duration_s": 30},
                            ]
                        },
                    },
                    {
                        "step_type": "pre_anneal",
                        "sequence": 2,
                        "parameters": {"temperature_C": 500, "duration_min": 20},
                    },
                ],
                "ingredients": [
                    {
                        "material_lot_id": LOT_ID,
                        "material_lot_version": 1,
                        "process_roles": ["flux_or_salt_assistant", "other"],
                        "process_role_other": "crystal-face selector",
                        "amount": 1,
                        "unit": "mL",
                        "concentration_value": 0.5,
                        "concentration_unit": "mol_per_L",
                    }
                ],
            }
        ]
    }
    validated = SourceLoadsPayload.model_validate(new_payload).model_dump(
        mode="json", exclude_none=True
    )
    assert validated["items"][0]["preparation_steps"][0]["parameters"]["stages"][1] == {
        "speed_rpm": 6000.0,
        "duration_s": 30.0,
    }

    legacy = deepcopy(new_payload)
    legacy["items"][0]["ingredients"][0] = {
        "material_lot_id": LOT_ID,
        "material_lot_version": 1,
        "function_role": "chalcogen_source",
    }
    legacy["items"][0]["preparation_steps"] = [
        {
            "step_type": "spin_coat",
            "sequence": 1,
            "parameters": {"speed_rpm": 3000, "duration_s": 60},
        }
    ]
    legacy["items"][0].pop("substrate_source_ids")
    normalized = SourceLoadsPayload.model_validate(legacy).model_dump(
        mode="json", exclude_none=True
    )
    assert normalized["items"][0]["preparation_steps"][0]["parameters"] == {
        "stages": [{"speed_rpm": 3000.0, "duration_s": 60.0}]
    }

    bad = deepcopy(new_payload)
    bad["items"][0]["ingredients"][0]["concentration_unit"] = None
    with pytest.raises(ValueError, match="provided together"):
        SourceLoadsPayload.model_validate(bad)

    missing_amount = deepcopy(new_payload)
    missing_amount["items"][0]["ingredients"][0].pop("amount")
    missing_amount["items"][0]["ingredients"][0].pop("unit")
    with pytest.raises(ValueError, match="require ingredient amount"):
        SourceLoadsPayload.model_validate(missing_amount)

    zero_amount = deepcopy(new_payload)
    zero_amount["items"][0]["ingredients"][0]["amount"] = 0
    with pytest.raises(ValueError, match="greater than 0"):
        SourceLoadsPayload.model_validate(zero_amount)

    blank_unit = deepcopy(new_payload)
    blank_unit["items"][0]["ingredients"][0]["unit"] = " "
    with pytest.raises(ValueError, match="String should match pattern"):
        SourceLoadsPayload.model_validate(blank_unit)

    rows: list[dict] = []
    V2ReportingService._extend_precursor_rows(
        rows,
        "CVD-2026-0001",
        validated,
        [
            "lot_ref",
            "amount",
            "concentration_value",
            "concentration_unit",
            "treatment_steps",
            "loading_method",
            "substrate_source_ids",
            "source_position",
        ],
    )
    assert rows[0]["ingredient_index"] == 1
    assert rows[0]["concentration_value"] == 0.5
    assert all("process_roles" not in row and "process_role_other" not in row for row in rows)
    assert "process_roles" not in validated["items"][0]["ingredients"][0]
    assert "process_role_other" not in validated["items"][0]["ingredients"][0]
    assert new_payload["items"][0]["ingredients"][0]["process_roles"] == [
        "flux_or_salt_assistant",
        "other",
    ]
    assert any(
        row["nested_field"] == "substrate_source_ids" and row["nested_value"] == SUBSTRATE_ID
        for row in rows
    )


def test_precursor_substrate_reference_and_legacy_role_write_are_rejected() -> None:
    run_id = uuid4()
    service = V2ExperimentService.__new__(V2ExperimentService)
    service.module_payloads = SimpleNamespace(
        get_by_run_and_key=lambda *_: SimpleNamespace(
            payload_json={"items": [{"source_id": SUBSTRATE_ID}]}
        )
    )
    valid = {
        "items": [
            {
                "loading_method": "substrate_surface",
                "substrate_source_ids": [SUBSTRATE_ID],
                "ingredients": [{"process_roles": []}],
            }
        ]
    }
    service._validate_precursor_substrate_references(run_id, valid)

    invalid_reference = deepcopy(valid)
    invalid_reference["items"][0]["substrate_source_ids"] = [str(uuid4())]
    with pytest.raises(HTTPException) as exc_info:
        service._validate_precursor_substrate_references(run_id, invalid_reference)
    assert exc_info.value.detail["invalid"][0]["reason"] == "substrate_reference"

    legacy_write = deepcopy(valid)
    legacy_write["items"][0]["ingredients"][0]["function_role"] = "metal_source"
    with pytest.raises(HTTPException) as exc_info:
        service._validate_precursor_substrate_references(run_id, legacy_write)
    assert exc_info.value.detail["invalid"][0]["reason"] == "legacy_read_only"
