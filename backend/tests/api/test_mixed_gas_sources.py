from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.scientific_units import canonicalize_process_channel
from app.models.file_asset import FileAsset
from app.models.v2_entities import (
    CommercialProduct,
    MaterialLot,
    MaterialLotVersion,
    Substance,
)
from app.schemas.generated.v2_module_payload import MaterialLotVersionPayload
from app.schemas.scientific import (
    PreparationOperationPayload,
    ProcessTimelinePayload,
    ScientificProcessEventPayload,
    normalize_process_event_for_read,
    normalize_process_preparation_for_read,
)
from app.services.scientific_revision_service import ScientificRevisionService
from app.services.v2_entity_service import V2EntityService
from app.services.v2_field_source import load_field_source
from app.services.v2_process_semantics import (
    frozen_gas_components,
    normalize_gas_components,
    valid_frozen_gas_reference,
)
from app.services.v2_reporting_service import V2ReportingService


def test_event_categories_merge_manual_changes_without_losing_history() -> None:
    expected = [
        "power_interruption",
        "water_interruption",
        "gas_interruption",
        "line_blockage",
        "pressure_excursion",
        "equipment_alarm",
        "signal_anomaly",
        "plan_changed",
        "other",
    ]
    assert (
        load_field_source()["scientific_contract"]["process_event"]["observed_deviations"]
        == expected
    )
    schema = ScientificProcessEventPayload.model_json_schema()
    assert schema["properties"]["observed_deviations"]["items"]["enum"] == expected
    raw = {
        "event_key": "event_legacy",
        "start_s": 60,
        "end_s": 120,
        "observed_deviations": ["manual_intervention", "plan_changed", "manual_stop"],
        "description": "调整温度后结束实验\n\n采取的处理：停止加热",
        "outcome": "terminated",
        "intervention_actions": ["stop_run"],
        "attachment_file_ids": [str(uuid4())],
    }
    original = deepcopy(raw)
    normalized = normalize_process_event_for_read(raw)
    assert raw == original
    assert normalized["observed_deviations"] == ["plan_changed"]
    assert normalized["description"].endswith(raw["description"])
    assert "人工干预、人工停止" in normalized["description"]
    assert normalize_process_event_for_read(normalized) == normalized
    long_description = {**raw, "description": "事" * 2000}
    long_parsed = ScientificProcessEventPayload.model_validate(long_description)
    assert long_parsed.description.endswith(long_description["description"])
    assert ScientificProcessEventPayload.model_validate(long_parsed.model_dump()) == long_parsed
    parsed = ScientificProcessEventPayload.model_validate(raw).model_dump(
        mode="json", exclude_none=True
    )
    assert parsed["observed_deviations"] == ["plan_changed"]
    for key in (
        "event_key",
        "start_s",
        "end_s",
        "outcome",
        "intervention_actions",
        "attachment_file_ids",
    ):
        assert parsed[key] == original[key]
    exported = V2ReportingService._export_modules(
        SimpleNamespace(content_json={"modules": {"process_events": {"items": [raw]}}})
    )
    assert exported["process_events"]["items"] == [normalized]
    assert raw == original
    new = {"event_key": "event_new", "start_s": 10, "observed_deviations": ["plan_changed"]}
    assert "description" not in ScientificProcessEventPayload.model_validate(new).model_dump(
        exclude_none=True
    )
    with pytest.raises(ValueError, match="unique"):
        ScientificProcessEventPayload.model_validate(
            {**new, "observed_deviations": ["plan_changed"] * 2}
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
        "segments": [],
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
    assert "cooling_rate_C_per_min" not in result
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
    legacy = deepcopy(raw)
    legacy.pop("process_duration_min")
    assert ProcessTimelinePayload.model_validate(legacy).process_duration_min is None

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
        ("ultra_high_vacuum", 1e-8, "Pa"),
    ]:
        item = {
            **raw,
            "pressure_regime": regime,
            "channels": [*raw["channels"], {**pressure, "scalar_value": value, "unit": unit}],
        }
        parsed = ProcessTimelinePayload.model_validate(item)
        assert parsed.pressure_regime == (
            "low_pressure" if regime == "ultra_high_vacuum" else regime
        )
        assert item["pressure_regime"] == regime


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
    exported = V2ReportingService._export_modules(
        SimpleNamespace(content_json={"modules": {"process_steps": result}})
    )
    assert exported["process_steps"] == result
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


def test_preparation_modes_preserve_measurements_and_legacy_history() -> None:
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
    legacy = {
        "operation_type": "gas_exchange",
        "duration_min": 5,
        "cycle_count": 3,
        "gas_sources": [source],
    }
    assert PreparationOperationPayload.model_validate(legacy).exchange_mode is None
    raw = {"preparation_operations": [{"operation_type": "leak_check", "duration_min": 2}, legacy]}
    normalized = normalize_process_preparation_for_read(raw)
    assert normalized["preparation_operations"][0] == {
        "operation_type": "other",
        "other_name": "旧记录：检漏",
        "duration_min": 2,
    }
    assert raw["preparation_operations"][0]["operation_type"] == "leak_check"
    assert "exchange_mode" not in normalized["preparation_operations"][1]
    assert (
        PreparationOperationPayload.model_validate(raw["preparation_operations"][0]).other_name
        == "旧记录：检漏"
    )
    revision = SimpleNamespace(content_json={"modules": {"process_steps": raw}})
    assert V2ReportingService._export_modules(revision)["process_steps"] == normalized


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
    assert frozen_gas_components(
        {
            "lot_category": "gas_cylinder",
            "substance_name": "高纯氩",
            "chemical_formula": "Ar",
        }
    ) == [{"species": "Ar", "volume_percent": 100.0}]


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
            "duration_min": 10,
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

    revision = SimpleNamespace(content_json={"modules": {"process_steps": process_steps}})
    exported_operation = V2ReportingService._export_modules(revision)["process_steps"][
        "preparation_operations"
    ][0]
    assert "gases" not in exported_operation
    assert exported_operation["gas_sources"][0]["snapshot"]["attrs"]["gas_components"] == [
        {"species": "H2", "volume_percent": 5.0},
        {"species": "Ar", "volume_percent": 95.0},
    ]


def test_legacy_pure_gas_can_append_a_composition_version_without_changing_identity(
    db_session,
    admin_user,
) -> None:
    substance = Substance(canonical_name="Argon", chemical_formula="Ar")
    db_session.add(substance)
    db_session.flush()
    product = CommercialProduct(
        substance_id=substance.id,
        supplier="Legacy Gas Co.",
        catalog_number="AR-5N",
    )
    db_session.add(product)
    db_session.flush()
    lot = MaterialLot(substance_id=substance.id, commercial_product_id=product.id)
    db_session.add(lot)
    db_session.flush()
    db_session.add(
        MaterialLotVersion(
            entity_id=lot.id,
            version=1,
            lot_category="gas_cylinder",
            substance_name="Argon",
            chemical_formula="Ar",
            batch_number="OLD-AR",
            attrs={"supplier": "Legacy Gas Co.", "catalog_number": "AR-5N"},
        )
    )
    db_session.commit()

    result = V2EntityService(db_session).append_version(
        "material_lot",
        lot.id,
        MaterialLotVersionPayload.model_validate(
            {
                "lot_category": "gas_cylinder",
                "substance_name": "Argon",
                "batch_number": "OLD-AR",
                "supplier": "Legacy Gas Co.",
                "catalog_number": "AR-5N",
                "gas_components": [{"species": "Ar", "volume_percent": 100}],
            }
        ),
        admin_user,
    )

    assert result.version == 2
    db_session.refresh(lot)
    assert lot.substance_id == substance.id
    assert lot.commercial_product_id == product.id


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
        file_kind="entity_reference",
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


def test_legacy_pure_gas_reference_remains_readable_but_cannot_be_locked_again() -> None:
    lot_id = "11111111-1111-4111-8111-111111111111"
    snapshot = {
        "entity_id": lot_id,
        "version": 1,
        "lot_category": "gas_cylinder",
        "substance_name": "Argon",
        "chemical_formula": "Ar",
        "batch_number": "AR-OLD",
        "attrs": {},
    }
    reference = {
        "entity_id": lot_id,
        "version": 1,
        "snapshot": snapshot,
    }
    assert frozen_gas_components(snapshot) == [{"species": "Ar", "volume_percent": 100.0}]
    assert valid_frozen_gas_reference({"species": "Ar", "lot_ref": reference})
    legacy_operation = PreparationOperationPayload.model_validate(
        {
            "operation_type": "gas_exchange",
            "duration_min": 10,
            "cycle_count": 2,
            "gases": ["Ar"],
        }
    )
    assert legacy_operation.gases == ["Ar"]
    with pytest.raises(HTTPException) as exc_info:
        ScientificRevisionService.__new__(ScientificRevisionService).freeze_process_gas_references(
            {
                "preparation_operations": [
                    legacy_operation.model_dump(mode="json", exclude_none=True)
                ]
            }
        )
    assert exc_info.value.detail["invalid"][0]["reason"] == "required"

    revision = SimpleNamespace(
        content_json={
            "modules": {
                "process_steps": {
                    "preparation_operations": [
                        {
                            "operation_type": "gas_exchange",
                            "duration_min": 10,
                            "cycle_count": 2,
                            "gases": ["Ar"],
                        }
                    ]
                }
            }
        }
    )
    assert V2ReportingService._export_modules(revision)["process_steps"]["preparation_operations"][
        0
    ]["gases"] == ["Ar"]


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
