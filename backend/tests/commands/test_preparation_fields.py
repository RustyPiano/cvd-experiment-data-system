from copy import deepcopy
from uuid import uuid4

import pytest

from app.schemas.generated.v2_module_payload import SetupVersionPayload
from app.schemas.scientific import SourceLoadPayload, TargetSpecPayload
from app.services.v2_field_source import additional_capability_is_available
from tests.helpers.v2_payloads import setup_payload


def test_alloy_and_doping_are_validated_per_target_region() -> None:
    target = {
        "architecture_type": "lateral_junction",
        "material_regions": [
            {
                "region_key": "a",
                "formula": "Mo0.5W0.5S2",
                "spatial_role": "lateral_region",
                "lateral_region": "A",
                "target_layer_count": 1,
            },
            {
                "region_key": "b",
                "formula": "MoTe2",
                "spatial_role": "lateral_region",
                "lateral_region": "B",
                "target_layer_count": 2,
            },
        ],
        "composition_relations": [
            {
                "relation_type": "solid_solution_component",
                "host_region_key": "a",
                "species": formula,
                "nominal_value": 0.5,
                "value_basis": "mol_fraction",
            }
            for formula in ("MoS2", "WS2")
        ]
        + [
            {
                "relation_type": "doped_by",
                "host_region_key": "a",
                "species": "Nb",
                "nominal_value": 1,
                "value_basis": "at_percent",
            }
        ],
        "dimensional_form": "planar",
        "film_form": "discrete",
        "in_plane_outline": "other_regular_polygon",
        "in_plane_outline_other": "五边形",
    }
    assert [
        region.target_layer_count
        for region in TargetSpecPayload.model_validate(target).material_regions
    ] == [1, 2]
    invalid = deepcopy(target)
    invalid["composition_relations"][1]["host_region_key"] = "b"
    with pytest.raises(ValueError, match="at least two"):
        TargetSpecPayload.model_validate(invalid)
    with pytest.raises(ValueError, match="discrete planar"):
        TargetSpecPayload.model_validate({**target, "film_form": "continuous"})


def test_named_capabilities_preserve_legacy_and_bind_each_use() -> None:
    setup = SetupVersionPayload.model_validate(
        setup_payload(field_devices=["other"], field_device_other_names=["磁场", "机械振动"])
    )
    attrs = setup.model_dump(exclude_none=True)
    assert additional_capability_is_available(
        {"field_type": "other", "capability_name": "磁场"}, attrs
    )
    assert not additional_capability_is_available(
        {"field_type": "other", "capability_name": "未登记"}, attrs
    )
    assert not additional_capability_is_available({"field_type": "other"}, attrs)
    legacy = setup_payload(field_devices=["other"], field_device_other_name="磁场")
    assert SetupVersionPayload.model_validate(legacy).field_device_other_name == "磁场"
    assert additional_capability_is_available({"field_type": "other"}, legacy)
    for names in ([""], ["磁场", " 磁场 "], []):
        with pytest.raises(ValueError):
            SetupVersionPayload.model_validate(
                setup_payload(field_devices=["other"], field_device_other_names=names)
            )


def test_solution_volume_is_recorded_once_per_operation() -> None:
    load = {
        "load_key": "solution",
        "loading_method": "substrate_surface",
        "substrate_source_ids": [str(uuid4())],
        "preparation_steps": [
            {
                "sequence": 1,
                "step_type": "drop_cast",
                "parameters": {"solvent": "water", "solution_volume_uL": 20},
            }
        ],
        "ingredients": [
            {
                "material_lot_id": str(uuid4()),
                "material_lot_version": 1,
                "concentration_value": value,
                "concentration_unit": "mol_per_L",
            }
            for value in (0.1, 0.2)
        ],
    }
    result = SourceLoadPayload.model_validate(load)
    assert result.preparation_steps[0].parameters.solution_volume_uL == 20
    assert all(ingredient.amount is None for ingredient in result.ingredients)
    invalid = deepcopy(load)
    invalid["ingredients"][0].update(amount=20, unit="μL")
    with pytest.raises(ValueError, match="once per step"):
        SourceLoadPayload.model_validate(invalid)
    legacy = deepcopy(load)
    legacy["preparation_steps"][0]["parameters"].pop("solution_volume_uL")
    for ingredient in legacy["ingredients"]:
        ingredient.update(amount=20, unit="μL")
    assert SourceLoadPayload.model_validate(legacy).ingredients[0].amount == 20


def test_substrate_treatment_parameters_follow_the_selected_method() -> None:
    from app.schemas.generated.v2_module_payload import (
        SolventCleaningParametersPayload,
        UvOzoneParametersPayload,
    )

    assert (
        SolventCleaningParametersPayload.model_validate(
            {"solvent": "ethanol", "cleaning_method": "wipe", "wiping_material": "无尘布"}
        ).wiping_material
        == "无尘布"
    )
    assert UvOzoneParametersPayload.model_validate({"duration_min": 10}).mode is None
    assert (
        UvOzoneParametersPayload.model_validate(
            {
                "duration_min": 10,
                "mode": "uv_ozone",
                "source_distance_mm": 5,
                "irradiance_mW_cm2": 12,
            }
        ).source_distance_mm
        == 5
    )
    with pytest.raises(ValueError, match="UV parameters"):
        UvOzoneParametersPayload.model_validate(
            {"duration_min": 10, "mode": "ozone_only", "wavelength_nm": 254}
        )
    with pytest.raises(ValueError, match="only to wiping"):
        SolventCleaningParametersPayload.model_validate(
            {"solvent": "ethanol", "cleaning_method": "rinse", "wiping_material": "无尘布"}
        )
