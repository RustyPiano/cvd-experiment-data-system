from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.schemas.scientific import SourceLoadsPayload
from app.services.v2_experiment_service import V2ExperimentService
from app.services.v2_reporting_service import V2ReportingService

LOT_ID = "11111111-1111-4111-8111-111111111111"
SUBSTRATE_ID = "22222222-2222-4222-8222-222222222222"


def test_coating_methods_require_the_right_quantity() -> None:
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
    with pytest.raises(ValueError, match="solution volume"):
        validate(load)
    load["preparation_steps"][0]["parameters"]["solution_volume_uL"] = 20
    assert validate(load).preparation_steps[0].parameters.solution_volume_uL == 20
    bad = deepcopy(load)
    bad["loading_method"] = "boat"
    with pytest.raises(ValueError, match="does not apply"):
        validate(bad)
    bad = deepcopy(load)
    bad["preparation_steps"].append({"step_type": "direct_load", "sequence": 2, "parameters": {}})
    with pytest.raises(ValueError, match="cannot be combined"):
        validate(bad)


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


def test_precursor_feedback_contract() -> None:
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
                            "solution_volume_uL": 50,
                            "stages": [
                                {"speed_rpm": 1000, "duration_s": 10},
                                {"speed_rpm": 6000, "duration_s": 30},
                            ],
                        },
                    },
                    {
                        "step_type": "dry",
                        "sequence": 2,
                        "parameters": {"temperature_C": 500, "duration_min": 20},
                    },
                ],
                "ingredients": [
                    {
                        "material_lot_id": LOT_ID,
                        "material_lot_version": 1,
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

    bad = deepcopy(new_payload)
    bad["items"][0]["ingredients"][0]["concentration_unit"] = None
    with pytest.raises(ValueError, match="provided together"):
        SourceLoadsPayload.model_validate(bad)

    missing_volume = deepcopy(new_payload)
    missing_volume["items"][0]["preparation_steps"][0]["parameters"].pop("solution_volume_uL")
    with pytest.raises(ValueError, match="actual solution volume"):
        SourceLoadsPayload.model_validate(missing_volume)

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
    assert any(
        row["nested_field"] == "substrate_source_ids" and row["nested_value"] == SUBSTRATE_ID
        for row in rows
    )


def test_precursor_substrate_reference_is_validated() -> None:
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
                "ingredients": [{}],
            }
        ]
    }
    service._validate_precursor_substrate_references(run_id, valid)

    invalid_reference = deepcopy(valid)
    invalid_reference["items"][0]["substrate_source_ids"] = [str(uuid4())]
    with pytest.raises(HTTPException) as exc_info:
        service._validate_precursor_substrate_references(run_id, invalid_reference)
    assert exc_info.value.detail["invalid"][0]["reason"] == "substrate_reference"
