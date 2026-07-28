from __future__ import annotations

from copy import deepcopy
from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.v2_entities import MaterialLot, MaterialLotVersion
from app.schemas.v2 import V2ModulePayloadUpsert
from app.services.file_storage_service import FileStorageService
from app.services.v2_entity_service import V2EntityService
from app.services.v2_experiment_service import V2ExperimentService
from app.services.v2_field_source import SCHEMA_VERSION
from app.services.v2_process_semantics import (
    gas_feeds_are_unique,
    gas_identity_matches,
)
from app.services.v2_r0_service import missing_r0_fields
from app.services.v2_reporting_service import V2ReportingService


def _run(db_session, active_user, *, zones: int = 2, field_devices: list[str] | None = None):
    run = ExperimentRun(
        run_code=f"CVD-2026-{uuid4().int % 10000:04d}",
        owner_id=active_user.id,
        schema_version=SCHEMA_VERSION,
        experiment_date=date(2026, 7, 25),
        status=ExperimentStatus.DRAFT,
        setup_ref=uuid4(),
        setup_ref_version=1,
        setup_ref_snapshot_json={
            "zone_count_snapshot": zones,
            "attrs_snapshot": {"field_devices": field_devices or ["none"]},
        },
    )
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)
    return run


def _gas_lot(
    db_session,
    *,
    category: str = "gas_cylinder",
    substance_name: str = "Argon",
    formula: str = "Ar",
    attrs: dict | None = None,
) -> MaterialLotVersion:
    entity = MaterialLot()
    db_session.add(entity)
    db_session.flush()
    version = MaterialLotVersion(
        entity_id=entity.id,
        version=1,
        lot_category=category,
        substance_name=substance_name,
        chemical_formula=formula,
        batch_number=f"AR-{uuid4().hex[:8]}",
        attrs=attrs or {"purity": 99.999, "gas_purity_grade": "5N"},
    )
    db_session.add(version)
    db_session.commit()
    return version


def _lot_ref(version: MaterialLotVersion) -> dict[str, object]:
    return {"entity_id": str(version.entity_id), "version": version.version}


def _process_payload(version: MaterialLotVersion, *, zones: int = 2) -> dict:
    return {
        "items": [
            {
                "stage_type": "preparation",
                "preparation_operations": [
                    {
                        "operation_type": "pump_down",
                        "target_absolute_pressure_Pa": 100,
                        "duration_min": 5,
                    }
                ],
            },
            {
                "stage_type": "reaction_conditions",
                "temperature_program": {
                    "zones": [
                        {
                            "zone_index": zone_index,
                            "points": [
                                {"elapsed_min": 0, "setpoint_C": 25},
                                {"elapsed_min": 30, "setpoint_C": 750},
                            ],
                        }
                        for zone_index in range(1, zones + 1)
                    ]
                },
                "gas_feeds": [
                    {
                        "species": "Ar",
                        "lot_ref": _lot_ref(version),
                        "measurement_source": "mfc",
                        "intervals": [{"start_min": 0, "end_min": 60, "flow_sccm": 80}],
                    }
                ],
                "pressure_system": {
                    "value": 101325,
                    "option": "atmospheric_pressure",
                },
                "duration_cycles": {"duration_min": 60},
            },
            {
                "stage_type": "other",
                "other_stage_name": "观察窗口",
                "notes": "窗口保持关闭",
            },
            {
                "stage_type": "other",
                "other_stage_name": "交接记录",
                "notes": "无异常",
            },
        ]
    }


def _file_asset(
    db_session,
    active_user,
    run: ExperimentRun,
    *,
    role: str,
    metadata: dict | None = None,
) -> FileAsset:
    file_id = uuid4()
    original_name = f"{file_id}.csv"
    storage_path = f"{run.run_code}/{original_name}"
    sha256 = file_id.hex.ljust(64, "0")
    size_bytes = 4
    resolved_metadata = metadata or {}
    if role == "temperature_timeseries":
        content = b"elapsed_min,zone_1_C,zone_2_C\n0,25,25\n1,30,31\n"
        storage_path, sha256 = FileStorageService().persist(
            experiment_run_code=run.run_code,
            file_id=file_id,
            original_name=original_name,
            content=content,
        )
        size_bytes = len(content)
        resolved_metadata = {
            **resolved_metadata,
            "columns": ["elapsed_min", "zone_1_C", "zone_2_C"],
            "numeric_columns": ["elapsed_min", "zone_1_C", "zone_2_C"],
            "numeric_column_pairs": [
                ["elapsed_min", "zone_1_C"],
                ["elapsed_min", "zone_2_C"],
                ["zone_1_C", "zone_2_C"],
            ],
            "row_count": 2,
        }
    asset = FileAsset(
        id=file_id,
        experiment_run_id=run.id,
        uploaded_by_id=active_user.id,
        original_name=original_name,
        storage_path=storage_path,
        content_type="text/csv",
        size_bytes=size_bytes,
        sha256=sha256,
        method=role,
        file_category="raw",
        asset_role=role,
        file_kind=role,
        metadata_json=resolved_metadata,
    )
    db_session.add(asset)
    db_session.commit()
    return asset


def test_process_save_enforces_cardinality_and_freezes_gas_lot_snapshot(
    db_session, active_user
) -> None:
    run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    payload = _process_payload(gas)

    saved = service.upsert_module(
        run.id,
        "process_steps",
        V2ModulePayloadUpsert(payload_json=payload),
        active_user,
    )

    items = saved.payload_json["items"]
    assert [item["stage_type"] for item in items].count("other") == 2
    snapshot = items[1]["gas_feeds"][0]["lot_ref"]["snapshot"]
    assert snapshot["lot_category"] == "gas_cylinder"
    assert snapshot["chemical_formula"] == "Ar"
    assert snapshot["attrs"]["gas_purity_grade"] == "5N"

    duplicate = deepcopy(payload)
    duplicate["items"].insert(1, deepcopy(duplicate["items"][0]))
    with pytest.raises(HTTPException) as exc_info:
        service.upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=duplicate),
            active_user,
        )
    assert exc_info.value.status_code == 422
    assert exc_info.value.detail["invalid"] == [{"key": "stage_type", "reason": "duplicate"}]

    chemical_lot = _gas_lot(db_session, category="chemical")
    wrong_category = _process_payload(chemical_lot)
    with pytest.raises(HTTPException) as category_exc:
        service.upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=wrong_category),
            active_user,
        )
    assert category_exc.value.detail["invalid"] == [{"key": "lot_ref", "reason": "category"}]


def test_process_save_enforces_primary_order_with_other_records_anywhere(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    payload = _process_payload(gas)
    preparation, reaction, first_other, second_other = payload["items"]
    payload["items"] = [first_other, preparation, second_other, reaction]

    saved = service.upsert_module(
        run.id,
        "process_steps",
        V2ModulePayloadUpsert(payload_json=payload),
        active_user,
    )
    assert [item["stage_type"] for item in saved.payload_json["items"]] == [
        "other",
        "preparation",
        "other",
        "reaction_conditions",
    ]

    payload["items"] = [reaction, first_other, preparation, second_other]
    with pytest.raises(HTTPException) as exc_info:
        service.upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=payload),
            active_user,
        )
    assert exc_info.value.detail["invalid"] == [{"key": "stage_type", "reason": "order"}]


def test_temperature_program_accepts_single_zero_point_and_rejects_nonzero_start(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    payload = _process_payload(gas)
    zones = payload["items"][1]["temperature_program"]["zones"]
    for zone in zones:
        zone["points"] = [zone["points"][0]]

    service.upsert_module(
        run.id,
        "process_steps",
        V2ModulePayloadUpsert(payload_json=payload),
        active_user,
    )

    zones[0]["points"][0]["elapsed_min"] = 5
    with pytest.raises(HTTPException) as exc_info:
        service.upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=payload),
            active_user,
        )
    assert exc_info.value.detail["invalid"] == [
        {"key": "temperature_program", "reason": "start_at_zero"}
    ]


def test_reaction_duration_does_not_invent_cycles_from_gas_intervals(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    payload = _process_payload(gas)
    reaction = payload["items"][1]
    reaction["gas_feeds"][0]["intervals"] = [
        {"start_min": index * 10, "end_min": index * 10 + 5, "flow_sccm": 80} for index in range(3)
    ]

    saved = service.upsert_module(
        run.id,
        "process_steps",
        V2ModulePayloadUpsert(payload_json=payload),
        active_user,
    )
    duration = saved.payload_json["items"][1]["duration_cycles"]
    assert duration["duration_min"] == 60.0
    assert duration["cycle_count"] is None
    assert gas_feeds_are_unique(saved.payload_json)


def test_lock_r0_rechecks_process_order_temperature_start_and_duplicate_gas(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    service.upsert_module(
        run.id,
        "process_steps",
        V2ModulePayloadUpsert(payload_json=_process_payload(gas)),
        active_user,
    )
    saved = service.module_payloads.get_by_run_and_key(run.id, "process_steps")
    changed_payload = deepcopy(saved.payload_json)
    preparation, reaction, *other = changed_payload["items"]
    changed_payload["items"] = [reaction, *other, preparation]
    reaction["temperature_program"]["zones"][0]["points"][0]["elapsed_min"] = 5
    reaction["gas_feeds"].append(deepcopy(reaction["gas_feeds"][0]))
    saved.payload_json = changed_payload
    service.module_payloads.save(saved)
    db_session.commit()
    db_session.refresh(run)

    missing_keys = {item["key"] for item in missing_r0_fields(run)}
    assert {
        "process_step_order",
        "temperature_program_start",
        "unique_gas_feeds",
    } <= missing_keys

    with pytest.raises(HTTPException) as exc_info:
        service.lock(run.id, active_user)
    lock_missing_keys = {item["key"] for item in exc_info.value.detail["invalid"]}
    assert {
        "stage_type",
        "temperature_program",
        "gas_feeds",
    } <= lock_missing_keys


def test_process_save_rejects_setup_zone_and_field_capability_overreach(
    db_session, active_user
) -> None:
    run = _run(db_session, active_user, zones=1, field_devices=["light"])
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)

    bad_zone = _process_payload(gas, zones=1)
    bad_zone["items"][1]["temperature_program"]["zones"][0]["zone_index"] = 2
    with pytest.raises(HTTPException) as zone_exc:
        service.upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=bad_zone),
            active_user,
        )
    assert zone_exc.value.detail["invalid"] == [
        {"key": "temperature_program", "reason": "zone_count"}
    ]

    bad_field = _process_payload(gas, zones=1)
    bad_field["items"][1]["field_params"] = [
        {
            "field_type": "plasma",
            "start_min": 5,
            "end_min": 20,
            "parameters": [
                {"name": "power", "value": 50, "unit": "W"},
                {"name": "gas", "value": "Ar", "unit": "—"},
                {"name": "pressure", "value": 100, "unit": "Pa"},
            ],
        }
    ]
    with pytest.raises(HTTPException) as field_exc:
        service.upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=bad_field),
            active_user,
        )
    assert field_exc.value.detail["invalid"] == [
        {"key": "field_params", "reason": "setup_capability"}
    ]


def test_setup_sensors_and_temperature_program_cover_every_zone(
    db_session,
    active_user,
) -> None:
    entity_service = V2EntityService(db_session)
    sensors = [
        {
            "sensor_type": "thermocouple",
            "zone_index": 1,
        }
    ]
    with pytest.raises(HTTPException):
        entity_service._normalize_temperature_sensors(
            "temperature_sensors",
            sensors,
            zone_count=2,
        )

    run = _run(db_session, active_user, zones=2)
    gas = _gas_lot(db_session)
    payload = _process_payload(gas, zones=1)
    with pytest.raises(HTTPException) as exc_info:
        V2ExperimentService(db_session).upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=payload),
            active_user,
        )
    assert exc_info.value.detail["invalid"] == [
        {"key": "temperature_program", "reason": "zone_count"}
    ]


def test_process_gas_species_must_match_reaction_and_preparation_cylinders(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user)
    argon = _gas_lot(db_session)
    oxygen = _gas_lot(
        db_session,
        substance_name="Oxygen",
        formula="O2",
    )
    service = V2ExperimentService(db_session)

    wrong_reaction = _process_payload(oxygen)
    with pytest.raises(HTTPException) as reaction_exc:
        service.upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=wrong_reaction),
            active_user,
        )
    assert reaction_exc.value.detail["invalid"] == [{"key": "lot_ref", "reason": "identity"}]

    wrong_preparation = _process_payload(argon)
    wrong_preparation["items"][0]["preparation_operations"] = [
        {
            "operation_type": "gas_exchange",
            "cycle_count": 3,
            "duration_min": 5,
            "gases": [
                {
                    "species": "Ar",
                    "lot_ref": _lot_ref(oxygen),
                    "flow_sccm": 100,
                }
            ],
        }
    ]
    with pytest.raises(HTTPException) as preparation_exc:
        service.upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=wrong_preparation),
            active_user,
        )
    assert preparation_exc.value.detail["invalid"] == [{"key": "lot_ref", "reason": "identity"}]

    assert gas_identity_matches(
        "other",
        "NH3",
        {
            "attrs": {
                "substance_name": "Ammonia",
                "chemical_formula": "NH3",
            }
        },
    )
    ammonia = _gas_lot(
        db_session,
        substance_name="Ammonia",
        formula="NH3",
    )
    valid_other = _process_payload(argon)
    valid_other["items"][0]["preparation_operations"] = [
        {
            "operation_type": "gas_exchange",
            "cycle_count": 3,
            "duration_min": 5,
            "gases": [
                {
                    "species": "other",
                    "other_name": "NH3",
                    "lot_ref": _lot_ref(ammonia),
                    "flow_sccm": 10,
                }
            ],
        }
    ]
    saved = service.upsert_module(
        run.id,
        "process_steps",
        V2ModulePayloadUpsert(payload_json=valid_other),
        active_user,
    )
    snapshot = saved.payload_json["items"][0]["preparation_operations"][0]["gases"][0]["lot_ref"][
        "snapshot"
    ]
    assert snapshot["chemical_formula"] == "NH3"


@pytest.mark.parametrize(
    ("species", "substance_name"),
    [
        ("Ar", "high-purity Argon"),
        ("N2", "high-purity Nitrogen"),
        ("H2", "high-purity Hydrogen"),
        ("O2", "high-purity Oxygen"),
        ("CH4", "high-purity Methane"),
    ],
)
def test_controlled_gas_species_match_their_cylinder_identity(
    species: str,
    substance_name: str,
) -> None:
    assert gas_identity_matches(
        species,
        None,
        {"chemical_formula": species, "substance_name": substance_name},
    )


@pytest.mark.parametrize(
    ("path", "expected_key"),
    [
        (("temperature_program", "zones", 0, "points", 1, "elapsed_min"), "temperature_program"),
        (("gas_feeds", 0, "intervals", 0, "end_min"), "gas_feeds"),
        (("field_params", 0, "end_min"), "field_params"),
    ],
)
def test_process_timed_values_cannot_exceed_total_duration(
    db_session,
    active_user,
    path: tuple[object, ...],
    expected_key: str,
) -> None:
    run = _run(db_session, active_user, field_devices=["plasma"])
    gas = _gas_lot(db_session)
    payload = _process_payload(gas)
    reaction = payload["items"][1]
    reaction["field_params"] = [
        {
            "field_type": "plasma",
            "start_min": 0,
            "end_min": 30,
            "parameters": [
                {"name": "power", "value": 50, "unit": "W"},
                {"name": "gas", "value": "Ar", "unit": "—"},
                {"name": "pressure", "value": 100, "unit": "Pa"},
            ],
        }
    ]
    target = reaction
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = 61

    with pytest.raises(HTTPException) as exc_info:
        V2ExperimentService(db_session).upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=payload),
            active_user,
        )
    assert exc_info.value.detail["invalid"] == [{"key": expected_key, "reason": "duration_min"}]


def test_r0_rechecks_saved_gas_identity_and_duration_bounds(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    service.upsert_module(
        run.id,
        "process_steps",
        V2ModulePayloadUpsert(payload_json=_process_payload(gas)),
        active_user,
    )
    saved = service.module_payloads.get_by_run_and_key(run.id, "process_steps")
    changed_payload = deepcopy(saved.payload_json)
    reaction = changed_payload["items"][1]
    reaction["gas_feeds"][0]["species"] = "O2"
    reaction["temperature_program"]["zones"][0]["points"][-1]["elapsed_min"] = 61
    saved.payload_json = changed_payload
    service.module_payloads.save(saved)
    db_session.commit()
    db_session.refresh(run)

    missing_keys = {item["key"] for item in missing_r0_fields(run)}
    assert {"gas_lot_snapshots", "process_duration_bounds"} <= missing_keys


def test_files_csv_exposes_joinable_file_and_binding_ids(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user)
    binding_id = uuid4()
    asset = _file_asset(
        db_session,
        active_user,
        run,
        role="process_event_attachment",
        metadata={"binding_type": "process_event", "binding_id": str(binding_id)},
    )
    columns, rows = V2ReportingService(db_session)._csv_tables([run])["files.csv"]

    assert {"file_id", "binding_type", "binding_id"} <= set(columns)
    assert rows[0]["file_id"] == str(asset.id)
    assert rows[0]["binding_type"] == "process_event"
    assert rows[0]["binding_id"] == str(binding_id)


def test_measured_temperature_file_must_be_active_same_run_and_correct_role(
    db_session, active_user
) -> None:
    run = _run(db_session, active_user)
    other_run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    wrong_run_asset = _file_asset(
        db_session,
        active_user,
        other_run,
        role="temperature_timeseries",
    )
    payload = _process_payload(gas)
    payload["items"][1]["measured_temperature"] = {
        "file_asset_id": str(wrong_run_asset.id),
        "time_column": "elapsed_min",
        "channels": [{"zone_index": 1, "column_name": "zone_1_C"}],
    }

    with pytest.raises(HTTPException) as exc_info:
        service.upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=payload),
            active_user,
        )
    assert exc_info.value.detail["invalid"] == [
        {"key": "measured_temperature", "reason": "same_run"}
    ]

    asset = _file_asset(
        db_session,
        active_user,
        run,
        role="temperature_timeseries",
        metadata={"binding_type": "process_step", "binding_id": "preparation"},
    )
    payload["items"][1]["measured_temperature"]["file_asset_id"] = str(asset.id)
    with pytest.raises(HTTPException) as binding_exc:
        service.upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=payload),
            active_user,
        )
    assert binding_exc.value.detail["invalid"] == [
        {"key": "measured_temperature", "reason": "process_binding"}
    ]

    asset.metadata_json = {
        "binding_type": "process_step",
        "binding_id": "reaction_conditions",
    }
    db_session.commit()
    saved = service.upsert_module(
        run.id,
        "process_steps",
        V2ModulePayloadUpsert(payload_json=payload),
        active_user,
    )
    assert saved.payload_json["items"][1]["measured_temperature"]["file_asset_id"] == str(asset.id)
    asset.deleted_at = datetime.now(UTC)
    db_session.commit()
    db_session.refresh(run)
    assert "measured_temperature_file" in {item["key"] for item in missing_r0_fields(run)}


@pytest.mark.parametrize(
    ("time_column", "column_name", "reason"),
    [
        ("invented_time", "zone_1_C", "time_column"),
        ("elapsed_min", "invented_temperature", "column_name"),
        ("zone_1_C", "zone_1_C", "column_reuse"),
    ],
)
def test_measured_temperature_mapping_must_use_parsed_numeric_columns(
    db_session,
    active_user,
    time_column,
    column_name,
    reason,
) -> None:
    run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    asset = _file_asset(
        db_session,
        active_user,
        run,
        role="temperature_timeseries",
        metadata={"binding_type": "process_step", "binding_id": "reaction_conditions"},
    )
    payload = _process_payload(gas)
    payload["items"][1]["measured_temperature"] = {
        "file_asset_id": str(asset.id),
        "time_column": time_column,
        "channels": [{"zone_index": 1, "column_name": column_name}],
    }

    with pytest.raises(HTTPException) as exc_info:
        service.upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=payload),
            active_user,
        )

    assert exc_info.value.detail["invalid"] == [{"key": "measured_temperature", "reason": reason}]


def test_legacy_temperature_file_metadata_is_parsed_and_backfilled(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    asset = _file_asset(
        db_session,
        active_user,
        run,
        role="temperature_timeseries",
        metadata={"binding_type": "process_step", "binding_id": "reaction_conditions"},
    )
    asset.metadata_json = {
        "binding_type": "process_step",
        "binding_id": "reaction_conditions",
    }
    db_session.commit()
    payload = _process_payload(gas)
    payload["items"][1]["measured_temperature"] = {
        "file_asset_id": str(asset.id),
        "time_column": "elapsed_min",
        "channels": [{"zone_index": 1, "column_name": "zone_1_C"}],
    }

    service.upsert_module(
        run.id,
        "process_steps",
        V2ModulePayloadUpsert(payload_json=payload),
        active_user,
    )

    db_session.refresh(asset)
    assert asset.metadata_json["columns"] == [
        "elapsed_min",
        "zone_1_C",
        "zone_2_C",
    ]
    assert asset.metadata_json["row_count"] == 2


def test_measured_temperature_columns_must_share_a_numeric_row(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    asset = _file_asset(
        db_session,
        active_user,
        run,
        role="temperature_timeseries",
        metadata={"binding_type": "process_step", "binding_id": "reaction_conditions"},
    )
    asset.metadata_json = {
        **asset.metadata_json,
        "numeric_column_pairs": [
            ["elapsed_min", "zone_1_C"],
            ["zone_1_C", "zone_2_C"],
        ],
    }
    db_session.commit()
    payload = _process_payload(gas)
    payload["items"][1]["measured_temperature"] = {
        "file_asset_id": str(asset.id),
        "time_column": "elapsed_min",
        "channels": [{"zone_index": 2, "column_name": "zone_2_C"}],
    }

    with pytest.raises(HTTPException) as exc_info:
        service.upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=payload),
            active_user,
        )

    assert exc_info.value.detail["invalid"] == [
        {"key": "measured_temperature", "reason": "column_pair"}
    ]


def test_invalid_legacy_temperature_file_is_rejected(db_session, active_user) -> None:
    run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    asset = _file_asset(
        db_session,
        active_user,
        run,
        role="temperature_timeseries",
        metadata={"binding_type": "process_step", "binding_id": "reaction_conditions"},
    )
    asset.original_name = "temperature.jpg"
    asset.metadata_json = {
        "binding_type": "process_step",
        "binding_id": "reaction_conditions",
    }
    db_session.commit()
    payload = _process_payload(gas)
    payload["items"][1]["measured_temperature"] = {
        "file_asset_id": str(asset.id),
        "time_column": "elapsed_min",
        "channels": [{"zone_index": 1, "column_name": "zone_1_C"}],
    }

    with pytest.raises(HTTPException) as exc_info:
        service.upsert_module(
            run.id,
            "process_steps",
            V2ModulePayloadUpsert(payload_json=payload),
            active_user,
        )

    assert exc_info.value.detail["invalid"] == [
        {"key": "measured_temperature", "reason": "file_extension"}
    ]


def test_r0_rechecks_temperature_column_mapping(db_session, active_user) -> None:
    run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    asset = _file_asset(
        db_session,
        active_user,
        run,
        role="temperature_timeseries",
        metadata={"binding_type": "process_step", "binding_id": "reaction_conditions"},
    )
    payload = _process_payload(gas)
    payload["items"][1]["measured_temperature"] = {
        "file_asset_id": str(asset.id),
        "time_column": "elapsed_min",
        "channels": [{"zone_index": 1, "column_name": "zone_1_C"}],
    }
    service.upsert_module(
        run.id,
        "process_steps",
        V2ModulePayloadUpsert(payload_json=payload),
        active_user,
    )
    saved = service.module_payloads.get_by_run_and_key(run.id, "process_steps")
    asset.metadata_json = {
        **asset.metadata_json,
        "numeric_column_pairs": [
            ["elapsed_min", "zone_1_C"],
            ["zone_1_C", "zone_2_C"],
        ],
    }
    saved.payload_json = {
        **saved.payload_json,
        "items": [
            *saved.payload_json["items"][:1],
            {
                **saved.payload_json["items"][1],
                "measured_temperature": {
                    **saved.payload_json["items"][1]["measured_temperature"],
                    "channels": [{"zone_index": 2, "column_name": "zone_2_C"}],
                },
            },
            *saved.payload_json["items"][2:],
        ],
    }
    db_session.commit()
    db_session.refresh(run)

    assert "measured_temperature_file" in {item["key"] for item in missing_r0_fields(run)}


def test_event_attachment_must_be_bound_to_its_event(db_session, active_user) -> None:
    run = _run(db_session, active_user)
    service = V2ExperimentService(db_session)
    event_id = uuid4()
    wrong_event_id = uuid4()
    asset = _file_asset(
        db_session,
        active_user,
        run,
        role="process_event_attachment",
        metadata={"binding_type": "process_event", "binding_id": str(wrong_event_id)},
    )
    payload = {
        "items": [
            {
                "event_id": str(event_id),
                "event_type": "gas_interruption",
                "occurred_at": "2026-07-25T10:00:00+08:00",
                "terminated_run": False,
                "attachment_file_ids": [str(asset.id)],
            }
        ]
    }

    with pytest.raises(HTTPException) as exc_info:
        service.upsert_module(
            run.id,
            "process_events",
            V2ModulePayloadUpsert(payload_json=payload),
            active_user,
        )
    assert exc_info.value.detail["invalid"] == [
        {"key": "attachment_file_ids", "reason": "event_binding"}
    ]

    asset.metadata_json = {"binding_type": "process_event", "binding_id": str(event_id)}
    db_session.commit()
    saved = service.upsert_module(
        run.id,
        "process_events",
        V2ModulePayloadUpsert(payload_json=payload),
        active_user,
    )
    assert saved.payload_json["items"][0]["attachment_file_ids"] == [str(asset.id)]
    asset.deleted_at = datetime.now(UTC)
    db_session.commit()
    db_session.refresh(run)
    assert "process_event_attachments" in {item["key"] for item in missing_r0_fields(run)}


def test_saving_process_events_soft_deletes_removed_and_abandoned_attachments(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user)
    service = V2ExperimentService(db_session)
    event_id = uuid4()
    abandoned_event_id = uuid4()
    kept = _file_asset(
        db_session,
        active_user,
        run,
        role="process_event_attachment",
        metadata={"binding_type": "process_event", "binding_id": str(event_id)},
    )
    abandoned = _file_asset(
        db_session,
        active_user,
        run,
        role="process_event_attachment",
        metadata={
            "binding_type": "process_event",
            "binding_id": str(abandoned_event_id),
        },
    )
    bound_but_unlisted = _file_asset(
        db_session,
        active_user,
        run,
        role="process_event_attachment",
        metadata={"binding_type": "process_event", "binding_id": str(event_id)},
    )
    payload = {
        "items": [
            {
                "event_id": str(event_id),
                "event_type": "gas_interruption",
                "occurred_at": "2026-07-25T10:00:00+08:00",
                "terminated_run": False,
                "attachment_file_ids": [str(kept.id)],
            }
        ]
    }

    service.upsert_module(
        run.id,
        "process_events",
        V2ModulePayloadUpsert(payload_json=payload),
        active_user,
    )
    db_session.refresh(kept)
    db_session.refresh(abandoned)
    db_session.refresh(bound_but_unlisted)
    assert kept.deleted_at is None
    assert bound_but_unlisted.deleted_at is None
    assert abandoned.deleted_at is not None
    assert abandoned.deleted_by_id == active_user.id

    service.upsert_module(
        run.id,
        "process_events",
        V2ModulePayloadUpsert(payload_json={"items": []}),
        active_user,
    )
    db_session.refresh(kept)
    db_session.refresh(bound_but_unlisted)
    assert kept.deleted_at is not None
    assert bound_but_unlisted.deleted_at is not None
    assert kept.deleted_by_id == active_user.id


def test_saving_process_steps_soft_deletes_unselected_temperature_files(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    selected = _file_asset(
        db_session,
        active_user,
        run,
        role="temperature_timeseries",
        metadata={"binding_type": "process_step", "binding_id": "reaction_conditions"},
    )
    unselected = _file_asset(
        db_session,
        active_user,
        run,
        role="temperature_timeseries",
        metadata={"binding_type": "process_step", "binding_id": "reaction_conditions"},
    )
    payload = _process_payload(gas)
    payload["items"][1]["measured_temperature"] = {
        "file_asset_id": str(selected.id),
        "time_column": "elapsed_min",
        "channels": [{"zone_index": 1, "column_name": "zone_1_C"}],
    }

    service.upsert_module(
        run.id,
        "process_steps",
        V2ModulePayloadUpsert(payload_json=payload),
        active_user,
    )
    db_session.refresh(selected)
    db_session.refresh(unselected)
    assert selected.deleted_at is None
    assert unselected.deleted_at is not None

    del payload["items"][1]["measured_temperature"]
    service.upsert_module(
        run.id,
        "process_steps",
        V2ModulePayloadUpsert(payload_json=payload),
        active_user,
    )
    db_session.refresh(selected)
    assert selected.deleted_at is not None
    assert selected.deleted_by_id == active_user.id


def test_r0_reports_exact_preparation_and_reaction_counts(db_session, active_user) -> None:
    run = _run(db_session, active_user)
    gas = _gas_lot(db_session)
    service = V2ExperimentService(db_session)
    payload = _process_payload(gas)
    payload["items"] = [item for item in payload["items"] if item["stage_type"] != "preparation"]
    service.upsert_module(
        run.id,
        "process_steps",
        V2ModulePayloadUpsert(payload_json=payload),
        active_user,
    )
    db_session.refresh(run)

    missing_keys = {item["key"] for item in missing_r0_fields(run)}
    assert "preparation" in missing_keys
    assert "reaction_conditions" not in missing_keys


def test_substrate_identity_uses_separate_formula_field(db_session, active_user) -> None:
    service = V2ExperimentService(db_session)
    version = _gas_lot(
        db_session,
        category="substrate",
        substance_name="Sapphire",
        formula="Al2O3",
        attrs={"substrate_material": "sapphire_al2o3"},
    )

    service._validate_substrate_lot_identity(
        {
            "material": "sapphire_al2o3",
            "chemical_formula": "Al2O3",
            "crystal_orientation": "c-plane",
        },
        version,
    )
    with pytest.raises(HTTPException):
        service._validate_substrate_lot_identity(
            {
                "material": "sapphire_al2o3",
                "chemical_formula": "Si",
                "crystal_orientation": "c-plane",
            },
            version,
        )


def test_material_lot_freeze_projects_stable_substrate_facts_and_rejects_old_lot_gaps(
    db_session,
    active_user,
) -> None:
    service = V2ExperimentService(db_session)
    current = _gas_lot(
        db_session,
        category="substrate",
        substance_name="Sapphire",
        formula="Al2O3",
        attrs={
            "substrate_material": "sapphire_al2o3",
            "substrate_orientation_polish": {
                "value": "c-plane",
                "option": "single_side_polished",
            },
            "substrate_oxide_thickness_nm": 285,
            "substrate_miscut_angle_deg": 0.2,
            "substrate_miscut_direction": "toward_a_axis",
            "substrate_surface_roughness": {
                "availability": "reported",
                "metric": "RMS",
                "value_nm": 0.5,
            },
        },
    )
    item = {
        "material": "sapphire_al2o3",
        "chemical_formula": "Al2O3",
        "crystal_orientation": "FORGED",
        "oxide_thickness_nm": 90,
        "miscut_angle_deg": 1.5,
        "miscut_direction": "FORGED",
        "surface_roughness": {"metric": "Ra", "value_nm": 99},
        "lot_ref": _lot_ref(current),
    }

    frozen = service._freeze_material_lot_references("substrates", {"items": [item]})["items"][0]

    assert frozen["crystal_orientation"] == "c-plane；single_side_polished"
    assert frozen["oxide_thickness_nm"] == 285
    assert frozen["miscut_angle_deg"] == 0.2
    assert frozen["miscut_direction"] == "toward_a_axis"
    assert frozen["surface_roughness"] == {
        "availability": "reported",
        "metric": "RMS",
        "value_nm": 0.5,
    }

    legacy = _gas_lot(
        db_session,
        category="substrate",
        substance_name="Legacy sapphire",
        formula="Al2O3",
        attrs={"substrate_material": "sapphire_al2o3"},
    )
    fallback = {
        "material": "sapphire_al2o3",
        "chemical_formula": "Al2O3",
        "crystal_orientation": "legacy user value",
        "miscut_angle_deg": 0,
        "miscut_direction": "",
        "surface_roughness": {"metric": "RMS", "value_nm": 0.8},
        "lot_ref": _lot_ref(legacy),
    }

    run = _run(db_session, active_user)
    with pytest.raises(HTTPException) as exc_info:
        service.upsert_module(
            run.id,
            "substrates",
            V2ModulePayloadUpsert(
                payload_json={
                    "items": [
                        {
                            **fallback,
                            "size_placement": {
                                "length_mm": 10,
                                "width_mm": 10,
                                "placement": "face_up",
                            },
                        }
                    ]
                }
            ),
            active_user,
        )
    assert exc_info.value.detail["invalid"] == [
        {
            "key": "lot_ref",
            "reason": "incomplete_stable_facts",
            "missing": [
                "orientation_polish_availability",
                "miscut_availability",
                "surface_roughness",
            ],
        }
    ]


def test_substrate_save_can_derive_lot_owned_required_fields(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user)
    lot = _gas_lot(
        db_session,
        category="substrate",
        substance_name="Sapphire",
        formula="Al2O3",
        attrs={
            "substrate_material": "sapphire_al2o3",
            "substrate_orientation_polish": {
                "value": "c-plane",
                "option": "single_side_polished",
            },
            "substrate_miscut_angle_deg": 0,
            "substrate_surface_roughness": {"metric": "RMS", "value_nm": 0.5},
        },
    )

    saved = V2ExperimentService(db_session).upsert_module(
        run.id,
        "substrates",
        V2ModulePayloadUpsert(
            payload_json={
                "items": [
                    {
                        "piece_label": "S1",
                        "lot_ref": _lot_ref(lot),
                        "size_placement": {
                            "length_mm": 10,
                            "width_mm": 10,
                            "placement": "face_up",
                        },
                    }
                ]
            }
        ),
        active_user,
    )

    item = saved.payload_json["items"][0]
    assert item["material"] == "sapphire_al2o3"
    assert item["chemical_formula"] == "Al2O3"
    assert item["crystal_orientation"] == "c-plane；single_side_polished"
    assert item["miscut_angle_deg"] == 0
    assert item["surface_roughness"] == {"metric": "RMS", "value_nm": 0.5}


def test_pressure_regime_uses_reaction_conditions_stage(db_session) -> None:
    service = V2ExperimentService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        service._validate_pressure_regime(
            "APCVD",
            {
                "items": [
                    {
                        "stage_type": "reaction_conditions",
                        "pressure_system": {
                            "value": 100,
                            "option": "low_pressure",
                        },
                    }
                ]
            },
        )
    assert exc_info.value.detail["invalid"] == [
        {"key": "pressure_system", "reason": "synthesis_method"}
    ]
