from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.scientific_units import canonicalize_process_channel
from app.models.file_asset import FileAsset
from app.models.v2_entities import (
    MaterialLot,
    Substance,
)
from app.schemas.generated.v2_module_payload import MaterialLotVersionPayload
from app.schemas.scientific import (
    PreparationOperationPayload,
    ProcessTimelinePayload,
)
from app.services.scientific_revision_service import ScientificRevisionService
from app.services.v2_entity_service import V2EntityService
from app.services.v2_process_semantics import (
    frozen_gas_components,
    normalize_gas_components,
    valid_frozen_gas_reference,
)


def _mixed_gas_payload() -> dict:
    return {
        "lot_category": "gas_cylinder",
        "substance_name": "5% H2 in Ar",
        "chemical_formula": None,
        "batch_number": "MIX-001",
        "gas_components": [
            {"species": "H2", "volume_percent": 5},
            {"species": "Ar", "volume_percent": 95},
        ],
    }


def _gas_program(lot_id: str) -> dict:
    return {
        "process_duration_min": 100,
        "pressure_regime": "atmospheric",
        "cooling_method": "staged_cooling",
        "cooling_sequence": [{"method": "controlled_cooling"}, {"method": "furnace_cooling"}],
        "channels": [
            {
                "channel_key": "channel_11111111_1111_4111_8111_111111111111",
                "channel_type": "temperature",
                "source_type": "setpoint",
                "subject_type": "temperature_zone",
                "subject_ref": "zone_1",
                "subject_instance_ref": "setup:one:zone:1",
                "zone_index": 1,
                "unit": "°C",
                "data_kind": "interval_series",
                "series": [
                    {"start_s": 0, "value": 800},
                    {"start_s": 1200, "value": 600},
                    {"start_s": 4800, "value": 300},
                ],
            },
            {
                "channel_key": "channel_22222222_2222_4222_8222_222222222222",
                "channel_type": "flow",
                "source_type": "measured",
                "subject_type": "gas_species",
                "subject_ref": "premixed",
                "subject_instance_ref": "setup:one:gas:one",
                "gas_species_code": "premixed",
                "gas_lot_id": lot_id,
                "gas_lot_version": 1,
                "measurement_source": "rotameter",
                "unit": "L/min",
                "data_kind": "interval_series",
                "series": [
                    {"start_s": 0, "end_s": 6000, "value": 1, "timing_preset": "whole_process"}
                ],
            },
        ],
    }


def test_gas_program_keeps_raw_units_explicit_duration_and_cooling_steps() -> None:
    raw = _gas_program(str(uuid4()))
    result = ProcessTimelinePayload.model_validate(raw).model_dump(mode="json", exclude_none=True)
    assert result["cooling_sequence"] == raw["cooling_sequence"]
    for unit, expected_unit, expected_value in [
        ("L/min", "L/min", 1),
        ("mL/min", "mL/min", 1),
        ("sccm", "sccm", 1),
        ("slm", "sccm", 1000),
    ]:
        channel = {**result["channels"][1], "unit": unit}
        canonical_unit, _, series, status = canonicalize_process_channel(channel)
        assert (canonical_unit, series[0]["value"], status) == (
            expected_unit,
            expected_value,
            "ready",
        )

    for duration in [0, -1, float("nan"), 50, 120]:
        with pytest.raises(ValueError):
            ProcessTimelinePayload.model_validate({**raw, "process_duration_min": duration})
    no_descent = deepcopy(raw)
    no_descent["channels"][0]["series"] = [{"start_s": 0, "value": 800}]
    with pytest.raises(ValueError, match="descending"):
        ProcessTimelinePayload.model_validate(no_descent)
    with pytest.raises(ValueError, match="at least two"):
        ProcessTimelinePayload.model_validate(
            {**raw, "cooling_sequence": [{"method": "furnace_cooling"}]}
        )
    without_duration = deepcopy(raw)
    without_duration.pop("process_duration_min")
    with pytest.raises(ValueError):
        ProcessTimelinePayload.model_validate(without_duration)

    pressure = {
        "channel_key": "channel_33333333_3333_4333_8333_333333333333",
        "channel_type": "pressure",
        "source_type": "setpoint",
        "subject_type": "pressure_location",
        "subject_ref": "reactor",
        "subject_instance_ref": "setup:one:pressure:1",
        "pressure_location": "reactor",
        "pressure_type": "absolute",
        "unit": "Pa",
        "data_kind": "scalar",
        "scalar_value": 95000,
    }
    for regime, value, unit in [
        ("low_pressure", 95000, "Pa"),
        ("low_pressure", 1e-12, "Pa"),
        ("high_pressure", 2, "MPa"),
    ]:
        item = {
            **raw,
            "pressure_regime": regime,
            "channels": [*raw["channels"], {**pressure, "scalar_value": value, "unit": unit}],
        }
        assert ProcessTimelinePayload.model_validate(item).pressure_regime == regime


def test_premixed_program_freezes_composition_and_distinguishes_cylinders(
    db_session, admin_user
) -> None:
    service = V2EntityService(db_session)
    lots = [
        service.create_entity(
            "material_lot",
            MaterialLotVersionPayload.model_validate(
                {**_mixed_gas_payload(), "batch_number": f"MIX-{index}"}
            ),
            admin_user,
        )
        for index in range(2)
    ]
    raw = _gas_program(str(lots[0].id))
    raw["channels"].append(
        {
            **raw["channels"][1],
            "channel_key": "channel_44444444_4444_4444_8444_444444444444",
            "gas_lot_id": str(lots[1].id),
        }
    )
    result = ScientificRevisionService(db_session).normalize_process_references(
        SimpleNamespace(setup_ref=uuid4()), raw
    )
    flow = result["channels"][1:]
    assert len({item["subject_instance_ref"] for item in flow}) == 2
    assert (
        flow[0]["subject_snapshot"]["attrs"]["gas_components"]
        == _mixed_gas_payload()["gas_components"]
    )
    assert flow[0]["series"][0]["value"] == 1 and flow[0]["unit"] == "L/min"
    invalid = deepcopy(result)
    invalid["channels"][1]["gas_species_code"] = "Ar"
    with pytest.raises(HTTPException):
        ScientificRevisionService(db_session).freeze_process_gas_references(invalid)
    duplicate = deepcopy(result)
    duplicate["channels"][2]["gas_lot_id"] = str(lots[0].id)
    with pytest.raises(ValueError, match="must be unique"):
        ScientificRevisionService(db_session).normalize_process_references(
            SimpleNamespace(setup_ref=uuid4()), duplicate
        )


def test_pump_down_accepts_target_pressure_or_duration() -> None:
    pressure_only = PreparationOperationPayload.model_validate(
        {"operation_type": "pump_down", "target_absolute_pressure_Pa": 10}
    )
    assert pressure_only.target_absolute_pressure_Pa == 10
    assert pressure_only.duration_min is None

    duration_only = PreparationOperationPayload.model_validate(
        {"operation_type": "pump_down", "duration_min": 5}
    )
    assert duration_only.duration_min == 5
    assert duration_only.target_absolute_pressure_Pa is None

    with pytest.raises(ValueError, match="target pressure or duration"):
        PreparationOperationPayload.model_validate({"operation_type": "pump_down"})


def test_preparation_modes_preserve_measurements() -> None:
    source = {"material_lot_id": str(uuid4()), "material_lot_version": 1}
    continuous = {
        "operation_type": "gas_exchange",
        "exchange_mode": "continuous_flow",
        "duration_min": 5,
        "gas_sources": [{**source, "flow_sccm": 100}],
    }
    parsed = PreparationOperationPayload.model_validate(continuous)
    assert parsed.gas_sources[0].flow_sccm == 100
    assert parsed.cycle_count is None
    cyclic = {
        "operation_type": "gas_exchange",
        "exchange_mode": "evacuation_backfill",
        "cycle_count": 3,
        "gas_sources": [source],
        "target_absolute_pressure_Pa": 10,
        "backfill_absolute_pressure_Pa": 100000,
    }
    parsed = PreparationOperationPayload.model_validate(cyclic)
    assert parsed.duration_min is None
    assert parsed.backfill_absolute_pressure_Pa == 100000
    for invalid in [
        {**continuous, "cycle_count": 1},
        {**continuous, "duration_min": None},
        {**continuous, "target_absolute_pressure_Pa": 10},
        {**continuous, "gas_sources": [{**source, "flow_sccm": 0}]},
        {**continuous, "gas_sources": [{**source, "flow_sccm": float("nan")}]},
        {**cyclic, "cycle_count": 1.5},
        {**cyclic, "cycle_count": None},
        {**cyclic, "backfill_absolute_pressure_Pa": 5},
        {**cyclic, "gas_sources": [{**source, "flow_sccm": 100}]},
    ]:
        with pytest.raises(ValueError):
            PreparationOperationPayload.model_validate(invalid)
    with pytest.raises(ValueError, match="exchange_mode"):
        PreparationOperationPayload.model_validate(
            {"operation_type": "gas_exchange", "duration_min": 5, "gas_sources": [source]}
        )


def test_gas_components_are_normalized_without_requiring_purity() -> None:
    assert normalize_gas_components(
        [
            {"species": "CO₂", "volume_percent": 20},
            {"species": "other", "other_name": "Custom gas", "volume_percent": 80},
        ]
    ) == [
        {"species": "CO2", "volume_percent": 20.0},
        {"species": "other", "other_name": "Custom gas", "volume_percent": 80.0},
    ]
    with pytest.raises(ValueError, match="sum to 100"):
        normalize_gas_components([{"species": "Ar", "volume_percent": 99}])
    assert (
        frozen_gas_components(
            {"lot_category": "gas_cylinder", "substance_name": "高纯氩", "chemical_formula": "Ar"}
        )
        == []
    )


def test_mixed_gas_lot_allows_null_formula_and_freezes_authoritative_snapshot(
    db_session,
    admin_user,
) -> None:
    entity = V2EntityService(db_session).create_entity(
        "material_lot",
        MaterialLotVersionPayload.model_validate(_mixed_gas_payload()),
        admin_user,
    )
    assert entity.latest_version is not None
    assert entity.latest_version.data["chemical_formula"] is None
    assert entity.latest_version.data["gas_components"][0] == {
        "species": "H2",
        "volume_percent": 5.0,
    }
    lot = db_session.get(MaterialLot, entity.id)
    assert lot is not None
    substance = db_session.get(Substance, lot.substance_id)
    assert substance is not None and substance.chemical_formula is None

    operation = PreparationOperationPayload.model_validate(
        {
            "operation_type": "gas_exchange",
            "exchange_mode": "evacuation_backfill",
            "cycle_count": 3,
            "gas_sources": [
                {
                    "material_lot_id": str(entity.id),
                    "material_lot_version": 1,
                    "snapshot": {"tampered": True},
                }
            ],
        }
    ).model_dump(mode="json", exclude_none=True)
    process_steps = {"preparation_operations": [operation]}
    ScientificRevisionService(db_session).freeze_process_gas_references(process_steps)
    frozen_source = operation["gas_sources"][0]
    assert frozen_source["snapshot"]["attrs"]["gas_components"][1] == {
        "species": "Ar",
        "volume_percent": 95.0,
    }
    assert "tampered" not in frozen_source["snapshot"]
    assert valid_frozen_gas_reference(frozen_source)


def test_entity_version_can_reuse_its_existing_attachment(db_session, admin_user) -> None:
    asset = FileAsset(
        uploaded_by_id=admin_user.id,
        original_name="coa.pdf",
        storage_path=f"entity/{uuid4()}_coa.pdf",
        size_bytes=3,
        sha256="c" * 64,
        method="entity_reference",
        file_category="raw",
        asset_role="entity_attachment",
        metadata_json={},
    )
    db_session.add(asset)
    db_session.commit()
    payload = MaterialLotVersionPayload.model_validate(
        {
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "batch_number": "ATTACHMENT-LOT",
            "coa_attachment": {
                "file_asset_id": str(asset.id),
                "sha256": asset.sha256,
            },
        }
    )
    service = V2EntityService(db_session)
    entity = service.create_entity("material_lot", payload, admin_user)

    result = service.append_version("material_lot", entity.id, payload, admin_user)

    assert result.version == 2
    db_session.refresh(asset)
    assert asset.entity_id == entity.id
    assert asset.entity_version == 1


def test_reaction_flow_does_not_treat_a_premix_as_one_pure_species() -> None:
    lot_id = "22222222-2222-4222-8222-222222222222"
    snapshot = {
        "entity_id": lot_id,
        "version": 1,
        "lot_category": "gas_cylinder",
        "substance_name": "5% H2 in Ar",
        "chemical_formula": None,
        "batch_number": "MIX-001",
        "attrs": {"gas_components": _mixed_gas_payload()["gas_components"]},
    }
    assert not valid_frozen_gas_reference(
        {
            "species": "H2",
            "lot_ref": {
                "entity_id": lot_id,
                "version": 1,
                "snapshot": snapshot,
            },
        }
    )
