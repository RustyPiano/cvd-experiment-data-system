import hashlib
import json
from copy import deepcopy
from datetime import date
from uuid import UUID, uuid4

from app.commands.check_r0 import build_r0_reports
from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.module_payload import ExperimentModulePayload
from app.models.sample import Sample, SampleRole
from app.models.scientific import RunRevision
from app.models.v2_entities import MaterialLot, MaterialLotVersion
from app.models.v2_results import MeasuredProduct
from app.services.v2_field_source import experiment_fields, load_field_source
from app.services.v2_r0_service import build_run_report


def _add_payload(db_session, run_id, module_key: str, payload: dict) -> None:
    db_session.add(
        ExperimentModulePayload(
            experiment_run_id=run_id,
            module_key=module_key,
            schema_version="cvd_v2",
            payload_json=payload,
        )
    )


def _scientific_payloads(run: ExperimentRun) -> dict[str, dict]:
    precursor_lot_id = uuid4()
    substrate_lot_id = uuid4()
    substrate_source_id = uuid4()
    gas_lot_id = uuid4()
    return {
        "basic_info": {
            "started_at": "2026-08-13T09:00:00+08:00",
            "synthesis_method": "CVD",
            "run_code": run.run_code,
            "created_by_user_id": str(run.owner_id),
            "performed_by_user_ids": [str(run.owner_id)],
            "recorded_by_user_id": str(run.owner_id),
            "precheck": {
                "checklist_version": "v1",
                "confirmed": True,
                "confirmed_at": "2026-08-13T08:55:00+08:00",
            },
        },
        "target_product": {
            "architecture_type": "single_region",
            "material_regions": [
                {
                    "region_key": "film",
                    "formula": "MoS2",
                    "spatial_role": "single_region",
                }
            ],
        },
        "equipment": {
            "setup_ref": str(run.setup_ref),
            "setup_origin": "commercial",
            "zone_count": 1,
            "orientation": "horizontal",
            "temperature_sensors": [{"sensor_type": "thermocouple", "zone_index": 1}],
            "field_devices": ["none"],
            "tube_usage_history": {"reset_count": 0, "use_number_since_reset": 1},
        },
        "precursors": {
            "items": [
                {
                    "load_key": "metal_source",
                    "loading_method": "boat",
                    "initial_position": {
                        "axial_mm": 0,
                        "reference": "zone_thermocouple",
                    },
                    "heating_zone_ref": "zone_1",
                    "ingredients": [
                        {
                            "material_lot_id": str(precursor_lot_id),
                            "material_lot_version": 1,
                            "amount": 10,
                            "unit": "mg",
                        }
                    ],
                }
            ]
        },
        "substrates": {
            "items": [
                {
                    "source_id": str(substrate_source_id),
                    "material": "sapphire_al2o3",
                    "lot_ref": {
                        "entity_id": str(substrate_lot_id),
                        "version": 1,
                        "snapshot": {
                            "entity_id": str(substrate_lot_id),
                            "version": 1,
                            "lot_category": "substrate",
                            "substance_name": "Al2O3",
                            "chemical_formula": "Al2O3",
                            "batch_number": "SUB-01",
                            "attrs": {"substrate_material": "sapphire_al2o3"},
                        },
                    },
                    "piece_label": "S1",
                    "chemical_formula": "Al2O3",
                    "size_placement": {
                        "length_mm": 10.0,
                        "width_mm": 10.0,
                        "placement": "face_up",
                    },
                    "zone_thermocouple_distance_mm": {
                        "zone_index": 1,
                        "distance_mm": 0.0,
                    },
                }
            ]
        },
        "process_steps": {
            "segments": [],
            "channels": [
                {
                    "channel_key": "channel_11111111_1111_4111_8111_111111111111",
                    "channel_type": "temperature",
                    "source_type": "setpoint",
                    "subject_type": "temperature_zone",
                    "subject_ref": "zone_1",
                    "subject_instance_ref": "setup:zone:1",
                    "zone_index": 1,
                    "unit": "°C",
                    "data_kind": "interval_series",
                    "series": [{"start_s": 0, "value": 750}],
                },
                {
                    "channel_key": "channel_22222222_2222_4222_8222_222222222222",
                    "channel_type": "flow",
                    "source_type": "setpoint",
                    "subject_type": "gas_species",
                    "subject_ref": "Ar",
                    "subject_instance_ref": "setup:gas:Ar:1",
                    "gas_species_code": "Ar",
                    "gas_lot_id": str(gas_lot_id),
                    "gas_lot_version": 1,
                    "measurement_source": "mfc",
                    "unit": "sccm",
                    "data_kind": "interval_series",
                    "series": [{"start_s": 0, "end_s": 3600, "value": 100}],
                },
            ],
            "pressure_regime": "atmospheric",
            "cooling_method": "furnace_cooling",
        },
    }


def _scientific_run() -> ExperimentRun:
    owner_id = uuid4()
    setup_id = uuid4()
    run = ExperimentRun(
        id=uuid4(),
        run_code="CVD-2026-0002",
        owner_id=owner_id,
        schema_version="cvd_v2",
        experiment_date=date(2026, 8, 13),
        status=ExperimentStatus.DRAFT,
        setup_ref=setup_id,
        setup_ref_version=1,
        setup_ref_snapshot_json={
            "setup_ref": str(setup_id),
            "setup_ref_version": 1,
            "zone_count_snapshot": 1,
            "orientation_snapshot": "horizontal",
            "attrs_snapshot": {
                "temperature_sensors": [{"sensor_type": "thermocouple", "zone_index": 1}],
                "field_devices": ["none"],
            },
        },
    )
    run.file_assets = []
    return run


def test_check_r0_reports_conditional_required_fields_and_rejects_pvd_as_noncompliant(
    db_session,
    active_user,
) -> None:
    run = ExperimentRun(
        run_code="RUN-R0-CVD",
        owner_id=active_user.id,
        schema_version="cvd_v2",
        experiment_date=date(2026, 7, 8),
    )
    pvd = ExperimentRun(
        run_code="RUN-R0-PVD",
        owner_id=active_user.id,
        schema_version="cvd_v2",
        experiment_date=date(2026, 7, 8),
    )
    db_session.add_all([run, pvd])
    db_session.flush()
    _add_payload(
        db_session,
        run.id,
        "basic_info",
        {
            "started_at": "2026-07-08T09:30:00",
            "synthesis_method": "CVD",
            "operator": "李俊杰",
            "run_code": "RUN-R0-CVD",
        },
    )
    _add_payload(db_session, run.id, "target_product", {"chemical_formula": "MoS2"})
    _add_payload(db_session, run.id, "equipment", {"setup_ref": "setup-1"})
    _add_payload(
        db_session,
        run.id,
        "precursors",
        {"items": [{"name_formula": "MoO3", "phase_state": "solid"}]},
    )
    _add_payload(db_session, run.id, "substrates", {"items": [{"material": "sio2_si"}]})
    _add_payload(
        db_session,
        run.id,
        "process_steps",
        {"items": [{"stage_type": "reaction_conditions"}]},
    )
    sample = Sample(
        sample_code="R0-S1",
        experiment_run_id=run.id,
        role=SampleRole.GROWTH,
    )
    db_session.add(sample)
    db_session.flush()
    db_session.add(MeasuredProduct(sample_id=sample.id, observed_phenomena=["不连续覆盖"]))
    _add_payload(
        db_session,
        pvd.id,
        "basic_info",
        {"synthesis_method": "PVD-磁控溅射", "run_code": "RUN-R0-PVD"},
    )
    db_session.commit()

    reports = build_r0_reports(db_session)

    cvd_report = next(report for report in reports if report["run_code"] == "RUN-R0-CVD")
    assert cvd_report["contract"] == "legacy_v2"
    assert cvd_report["status"] == "non_compliant"
    missing_keys = {
        item["key"] for item in cvd_report["items"] if item["applicable"] and not item["passed"]
    }
    assert {
        "material_lot_id",
        "material_lot_version",
        "channels",
        "pressure_regime",
        "cooling_method",
        "zone_count",
        "orientation",
    }.issubset(missing_keys)
    assert "components" not in missing_keys

    pvd_report = next(report for report in reports if report["run_code"] == "RUN-R0-PVD")
    assert pvd_report["status"] == "non_compliant"


def test_target_architecture_and_composition_relations_are_part_of_r0() -> None:
    fields = experiment_fields(load_field_source())
    r0_fields = [field for field in fields if field.get("r0")]
    r0_by_key = {field["key"]: field for field in r0_fields}

    assert len(r0_fields) == 26
    assert r0_by_key["architecture_type"]["requirement"]["level"] == "required"
    assert r0_by_key["composition_relations"]["requirement"]["level"] == "optional"


def test_scientific_r0_accepts_minimal_current_contract_without_optional_phases() -> None:
    run = _scientific_run()
    payloads = _scientific_payloads(run)
    assert payloads["process_steps"]["segments"] == []
    assert "preparation_operations" not in payloads["process_steps"]
    assert "dimensional_form" not in payloads["target_product"]
    run.module_payloads = [
        ExperimentModulePayload(
            experiment_run_id=run.id,
            module_key=module_key,
            schema_version="cvd_v2",
            payload_json=payload,
        )
        for module_key, payload in payloads.items()
    ]
    report = build_run_report(run)

    assert report["contract"] == "scientific_v4"
    assert report["status"] == "compliant"
    assert report["items"]
    assert all(item["passed"] for item in report["items"] if item["applicable"])


def test_scientific_r0_reports_temperature_gas_and_pressure_separately() -> None:
    run = _scientific_run()
    cases = {
        "amount": lambda payload: payload["precursors"]["items"][0]["ingredients"][0].pop("amount"),
        "temperature_program": lambda payload: payload["process_steps"].update(
            channels=[
                item
                for item in payload["process_steps"]["channels"]
                if item["channel_type"] != "temperature"
            ]
        ),
        "gas_flow_program": lambda payload: payload["process_steps"].update(
            channels=[
                item
                for item in payload["process_steps"]["channels"]
                if item["channel_type"] != "flow"
            ]
        ),
        "pressure_condition": lambda payload: payload["process_steps"].pop("pressure_regime"),
    }

    for expected_key, mutate in cases.items():
        payload = _scientific_payloads(run)
        mutate(payload)
        report = build_run_report(run, payload)
        missing = {
            item["key"] for item in report["items"] if item["applicable"] and not item["passed"]
        }
        assert report["status"] == "non_compliant"
        assert expected_key in missing


def test_scientific_r0_requires_physical_cylinders_for_new_gas_exchange() -> None:
    run = _scientific_run()
    payloads = _scientific_payloads(run)
    payloads["process_steps"]["preparation_operations"] = [
        {
            "operation_type": "gas_exchange",
            "duration_min": 5,
            "cycle_count": 2,
            "gases": ["CO2"],
        }
    ]

    report = build_run_report(run, payloads)

    missing = {item["key"] for item in report["items"] if item["applicable"] and not item["passed"]}
    assert "preparation_gas_sources" in missing


def test_scientific_r0_rejects_nonexistent_material_lot_versions(db_session) -> None:
    run = _scientific_run()
    payloads = _scientific_payloads(run)
    report = build_run_report(run, payloads, db=db_session)

    missing = {item["key"] for item in report["items"] if item["applicable"] and not item["passed"]}
    assert {
        "material_lot_references",
        "substrate_lot_references",
        "gas_flow_program",
    }.issubset(missing)

    precursor_id = payloads["precursors"]["items"][0]["ingredients"][0]["material_lot_id"]
    substrate_id = payloads["substrates"]["items"][0]["lot_ref"]["entity_id"]
    gas_id = next(
        item["gas_lot_id"]
        for item in payloads["process_steps"]["channels"]
        if item["channel_type"] == "flow"
    )
    lots = [
        (precursor_id, "chemical", "MoO3", "MoO3", "PRE-01", {}),
        (
            substrate_id,
            "substrate",
            "Al2O3",
            "Al2O3",
            "SUB-01",
            {"substrate_material": "sapphire_al2o3"},
        ),
        (gas_id, "gas_cylinder", "Ar", "Ar", "GAS-01", {"purity": 99.999}),
    ]
    for lot_id, category, name, formula, batch, attrs in lots:
        lot_uuid = UUID(lot_id)
        db_session.add(MaterialLot(id=lot_uuid))
        db_session.add(
            MaterialLotVersion(
                entity_id=lot_uuid,
                version=1,
                lot_category=category,
                substance_name=name,
                chemical_formula=formula,
                batch_number=batch,
                attrs=attrs,
            )
        )
    db_session.flush()

    assert build_run_report(run, payloads, db=db_session)["status"] == "compliant"


def test_locked_scientific_r0_reads_immutable_revision_not_mutable_modules() -> None:
    run = _scientific_run()
    payloads = _scientific_payloads(run)
    revision_id = uuid4()
    revision = RunRevision(
        id=revision_id,
        experiment_run_id=run.id,
        revision_number=1,
        schema_version="v4.0-alpha.17",
        schema_status="internal_validation",
        content_json={
            "run": {
                "id": str(run.id),
                "run_code": run.run_code,
                "setup_ref": str(run.setup_ref),
                "setup_ref_version": run.setup_ref_version,
                "setup_ref_snapshot": deepcopy(run.setup_ref_snapshot_json),
            },
            "modules": deepcopy(payloads),
        },
        content_sha256="0" * 64,
        locked_by_id=run.owner_id,
    )
    revision.content_sha256 = hashlib.sha256(
        json.dumps(
            revision.content_json,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    run.status = ExperimentStatus.LOCKED
    run.current_revision_id = revision_id
    run.current_revision = revision
    run.module_payloads = [
        ExperimentModulePayload(
            module_key="process_steps",
            schema_version="cvd_v2",
            payload_json={"segments": [], "channels": []},
        )
    ]

    report = build_run_report(run)

    assert report["schema_version"] == "v4.0-alpha.17"
    assert report["contract"] == "scientific_v4"
    assert report["status"] == "compliant"
    immutable = next(
        item for item in report["items"] if item["key"] == "immutable_revision_content"
    )
    assert immutable["passed"] is True

    revision.content_sha256 = "f" * 64
    assert build_run_report(run)["status"] == "non_compliant"

    historical = deepcopy(payloads)
    historical_load = historical["precursors"]["items"][0]
    historical_load["loading_method"] = "substrate_surface"
    historical_load["ingredients"][0]["function_role"] = "metal_source"
    revision.schema_version = "v4.0-alpha.15"
    revision.content_json["modules"] = historical
    revision.content_sha256 = hashlib.sha256(
        json.dumps(
            revision.content_json,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()

    historical_report = build_run_report(run)

    assert historical_report["status"] == "compliant"
    source_link = next(
        item for item in historical_report["items"] if item["key"] == "substrate_source_references"
    )
    assert source_link["applicable"] is False
