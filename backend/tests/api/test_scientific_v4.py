import json
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.experiment import ExperimentRun
from app.models.file_asset import FileAsset
from app.models.scientific import (
    ProcessChannel,
    RunFeature,
    RunRevision,
    SampleRevisionAssociation,
    SampleRevisionState,
    SourceLoad,
    TargetMaterialRegion,
    TargetSpec,
)
from app.schemas.scientific import (
    ProcessTimelinePayload,
    SourceLoadsPayload,
    TargetSpecPayload,
)
from tests.helpers.v2_payloads import (
    gas_lot_payload,
    setup_payload,
    substrate_item,
    substrate_lot_payload,
)

client = TestClient(app)


def test_process_timeline_does_not_require_a_declared_reaction_phase() -> None:
    payload = {
        "segments": [
            {
                "segment_key": "system_preparation",
                "segment_type": "system_preparation",
                "sequence": 1,
                "start_s": 0,
                "end_s": 300,
            },
            {
                "segment_key": "pre_reaction",
                "segment_type": "pre_reaction",
                "sequence": 2,
                "start_s": 300,
                "end_s": 600,
            },
            {
                "segment_key": "reaction",
                "segment_type": "reaction",
                "sequence": 3,
                "start_s": 600,
                "end_s": 1200,
            },
            {
                "segment_key": "post_reaction",
                "segment_type": "post_reaction",
                "sequence": 4,
                "start_s": 1200,
                "end_s": 1500,
            },
        ],
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
                "series": [{"start_s": 0, "value": 25}, {"start_s": 600, "value": 750}],
            },
            {
                "channel_key": "channel_22222222_2222_4222_8222_222222222222",
                "channel_type": "flow",
                "source_type": "setpoint",
                "subject_type": "gas_species",
                "subject_ref": "Ar",
                "subject_instance_ref": "setup:one:gas:Ar:1",
                "gas_species_code": "Ar",
                "gas_lot_id": "11111111-1111-4111-8111-111111111111",
                "gas_lot_version": 1,
                "measurement_source": "mfc",
                "unit": "sccm",
                "data_kind": "interval_series",
                "series": [
                    {
                        "start_s": 0,
                        "end_s": 1500,
                        "value": 100,
                        "timing_preset": "whole_process",
                    }
                ],
            },
        ],
        "pressure_regime": "atmospheric",
        "cooling_method": "furnace_cooling",
        "preparation_operations": [
            {
                "operation_type": "gas_exchange",
                "duration_min": 5,
                "cycle_count": 3,
                "gas_sources": [
                    {
                        "material_lot_id": "33333333-3333-4333-8333-333333333333",
                        "material_lot_version": 1,
                        "snapshot": {
                            "attrs": {
                                "gas_components": [
                                    {"species": "CO2", "volume_percent": 20},
                                    {"species": "Ar", "volume_percent": 80},
                                ]
                            }
                        },
                    }
                ],
            }
        ],
    }

    validated = ProcessTimelinePayload.model_validate(payload)
    assert validated.segments[2].segment_type == "reaction"
    assert validated.channels[1].series
    assert validated.channels[1].series[0].timing_preset == "whole_process"
    assert validated.preparation_operations[0].gas_sources[0].material_lot_version == 1

    payload["segments"] = []
    assert ProcessTimelinePayload.model_validate(payload).segments == []


def test_target_phase_catalog_accepts_known_and_custom_phases() -> None:
    base = {
        "architecture_type": "single_region",
        "material_regions": [
            {
                "region_key": "film",
                "formula": "MoS2",
                "spatial_role": "single_region",
                "target_bulk_phase": "3R",
                "target_bulk_space_group_number": 160,
            }
        ],
        "composition_relations": [],
    }
    assert (
        TargetSpecPayload.model_validate(base).material_regions[0].target_bulk_space_group_number
        == 160
    )
    custom = {
        **base,
        "material_regions": [
            {
                **base["material_regions"][0],
                "target_bulk_phase": "2Ha",
                "target_bulk_space_group_number": None,
            }
        ],
    }
    assert TargetSpecPayload.model_validate(custom).material_regions[0].target_bulk_phase == "2Ha"
    invalid = {
        **base,
        "material_regions": [
            {
                **base["material_regions"][0],
                "target_bulk_phase": "2H",
            }
        ],
    }
    with pytest.raises(ValueError, match="catalog phase and space group"):
        TargetSpecPayload.model_validate(invalid)


def test_target_planar_outline_requires_discrete_planar_crystal() -> None:
    target = {
        "architecture_type": "single_region",
        "material_regions": [
            {
                "region_key": "film",
                "formula": "MoS2",
                "spatial_role": "single_region",
            }
        ],
        "composition_relations": [],
        "dimensional_form": "discrete_planar_crystal",
        "in_plane_outline": "triangle",
    }
    assert TargetSpecPayload.model_validate(target).in_plane_outline == "triangle"

    target["dimensional_form"] = "continuous_film"
    with pytest.raises(ValueError, match="requires discrete_planar_crystal"):
        TargetSpecPayload.model_validate(target)


def test_source_position_uses_selected_zone_thermocouple() -> None:
    payload = {
        "items": [
            {
                "load_key": "sulfur_source",
                "loading_method": "boat",
                "heating_zone_ref": "zone_1",
                "initial_position": {
                    "axial_mm": -20,
                    "reference": "zone_thermocouple",
                },
                "ingredients": [
                    {
                        "material_lot_id": "11111111-1111-4111-8111-111111111111",
                        "material_lot_version": 1,
                        "function_role": "chalcogen_source",
                    }
                ],
            }
        ]
    }

    validated = SourceLoadsPayload.model_validate(payload)
    assert validated.items[0].initial_position
    assert validated.items[0].initial_position.reference == "zone_thermocouple"
    assert validated.items[0].initial_position.axial_mm == -20

    del payload["items"][0]["heating_zone_ref"]
    with pytest.raises(ValueError, match="heating_zone_ref"):
        SourceLoadsPayload.model_validate(payload)

    payload["items"][0]["initial_position"]["reference"] = "setup_origin"
    legacy = SourceLoadsPayload.model_validate(payload)
    assert legacy.items[0].initial_position
    assert legacy.items[0].initial_position.reference == "setup_origin"


def test_source_preparation_parameters_are_typed_and_atmosphere_is_canonical() -> None:
    def payload(step: dict[str, object]) -> dict[str, object]:
        return {
            "items": [
                {
                    "load_key": "sulfur_source",
                    "loading_method": "substrate_surface",
                    "preparation_steps": [step],
                    "ingredients": [
                        {
                            "material_lot_id": "11111111-1111-4111-8111-111111111111",
                            "material_lot_version": 1,
                            "function_role": "chalcogen_source",
                        }
                    ],
                }
            ]
        }

    anneal = SourceLoadsPayload.model_validate(
        payload(
            {
                "step_type": "dry",
                "sequence": 1,
                "parameters": {
                    "temperature_C": 500,
                    "duration_min": 20,
                    "atmosphere": "氩气",
                },
            }
        )
    ).model_dump(exclude_none=True)
    assert anneal["items"][0]["preparation_steps"][0]["parameters"] == {
        "temperature_C": 500.0,
        "duration_min": 20.0,
        "atmosphere": "Ar",
    }

    custom = SourceLoadsPayload.model_validate(
        payload(
            {
                "step_type": "dry",
                "sequence": 1,
                "parameters": {
                    "temperature_C": 500,
                    "duration_min": 20,
                    "atmosphere": "forming gas",
                },
            }
        )
    ).model_dump(exclude_none=True)
    assert custom["items"][0]["preparation_steps"][0]["parameters"] == {
        "temperature_C": 500.0,
        "duration_min": 20.0,
        "atmosphere": "other",
        "atmosphere_other": "forming gas",
    }

    with pytest.raises(ValueError, match="Extra inputs are not permitted"):
        SourceLoadsPayload.model_validate(
            payload(
                {
                    "step_type": "direct_load",
                    "sequence": 1,
                    "parameters": {"unexpected": "value"},
                }
            )
        )

    with pytest.raises(ValueError, match="pressure_MPa"):
        SourceLoadsPayload.model_validate(
            payload(
                {
                    "step_type": "pelletize",
                    "sequence": 1,
                    "parameters": {"duration_s": 30},
                }
            )
        )


def test_solid_solution_components_generate_and_validate_target_formula() -> None:
    target = {
        "architecture_type": "single_region",
        "material_regions": [
            {
                "region_key": "film",
                "formula": "Mo0.5W0.5S2",
                "spatial_role": "single_region",
                "target_bulk_phase": "2H",
                "target_bulk_space_group_number": 194,
            }
        ],
        "composition_relations": [
            {
                "relation_type": "solid_solution_component",
                "host_region_key": "film",
                "species": formula,
                "nominal_value": 0.5,
                "value_basis": "mol_fraction",
            }
            for formula in ("MoS2", "WS2")
        ],
    }
    assert TargetSpecPayload.model_validate(target).material_regions[0].formula == "Mo0.5W0.5S2"

    invalid = {
        **target,
        "composition_relations": [
            {**target["composition_relations"][0], "nominal_value": 0.6},
            target["composition_relations"][1],
        ],
    }
    with pytest.raises(ValueError, match="invalid solid-solution components"):
        TargetSpecPayload.model_validate(invalid)


def _headers(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.parametrize("invalid", [float("nan"), float("inf"), float("-inf")])
def test_instrument_create_rejects_non_finite_capability_json(
    admin_user,
    invalid: float,
) -> None:
    response = client.post(
        "/api/v1/instruments",
        content=json.dumps(
            {
                "instrument_code": "RAMAN-NON-FINITE",
                "name_type": "Raman",
                "capabilities": [{"value": invalid}],
            }
        ),
        headers={**_headers(admin_user.email), "Content-Type": "application/json"},
    )

    assert response.status_code == 422, response.text


def test_other_instrument_methods_round_trip_and_preserve_versions(admin_user, db_session) -> None:
    from sqlalchemy import select

    from app.models.v2_entities import InstrumentCapability

    headers = _headers(admin_user.email)
    payload = {
        "instrument_code": "CUSTOM-METHODS-01",
        "name_type": "other",
        "capabilities": [
            {"code": "Raman", "configuration": {}},
            {"code": "other", "configuration": {"method_names": [" XPS ", "FTIR"]}},
        ],
    }
    created = client.post("/api/v1/instruments", json=payload, headers=headers)
    assert created.status_code == 201, created.text
    entity_id = created.json()["id"]
    expected = ["XPS", "FTIR"]
    assert (
        created.json()["latest_version"]["data"]["capabilities"][1]["configuration"]["method_names"]
        == expected
    )
    stored = db_session.scalar(
        select(InstrumentCapability).where(InstrumentCapability.capability_code == "other")
    )
    assert stored.configuration_json == {"method_names": expected}
    payload["capabilities"][1]["configuration"]["method_names"] = ["XPS", "UPS"]
    updated = client.post(
        f"/api/v1/instruments/{entity_id}/versions", json=payload, headers=headers
    )
    assert updated.status_code == 201, updated.text
    versions = client.get(f"/api/v1/instruments/{entity_id}/versions", headers=headers)
    assert versions.status_code == 200, versions.text
    old = next(item for item in versions.json()["items"] if item["version"] == 1)
    assert old["data"]["capabilities"][1]["configuration"]["method_names"] == expected


@pytest.mark.parametrize(
    "names", [None, [], [""], ["  "], ["XPS", " xps "], ["X" * 129], [123], "XPS"]
)
def test_other_instrument_methods_reject_invalid_names(admin_user, names) -> None:
    response = client.post(
        "/api/v1/instruments",
        json={
            "instrument_code": "CUSTOM-INVALID",
            "name_type": "other",
            "capabilities": [{"code": "other", "configuration": {"method_names": names}}],
        },
        headers=_headers(admin_user.email),
    )
    assert response.status_code == 422, response.text


def _put_module(
    headers: dict[str, str],
    run_id: str,
    module: str,
    payload: dict,
) -> dict:
    response = client.put(
        f"/api/v1/experiments/{run_id}/modules/{module}",
        json={"payload_json": payload},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_simple_product_create_keeps_manual_environment_and_performers(
    active_user,
) -> None:
    headers = _headers(active_user.email)
    started_at = "2026-07-30T10:30:00+08:00"
    response = client.post(
        "/api/v1/experiments",
        json={
            "run_code": "CVD-2026-0910",
            "started_at": started_at,
            "synthesis_method": "CVD",
            "performed_by_user_ids": [str(active_user.id)],
            "ambient_temperature": {
                "value": 25,
                "measured_at": started_at,
                "source_type": "manual_entry",
            },
            "ambient_humidity": {
                "value": 45,
                "measured_at": started_at,
                "source_type": "manual_entry",
            },
            "precheck_confirmed": False,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text

    basic_info = client.get(
        f"/api/v1/experiments/{response.json()['id']}/modules/basic_info",
        headers=headers,
    ).json()["payload_json"]
    assert basic_info["performed_by_user_ids"] == [str(active_user.id)]
    assert basic_info["ambient_temperature"] == {
        "value": 25.0,
        "measured_at": started_at,
        "source_type": "manual_entry",
    }
    assert basic_info["ambient_humidity"]["source_type"] == "manual_entry"

    basic_info["recorded_by_user_id"] = str(uuid4())
    basic_info["note"] = "补充说明"
    updated = client.put(
        f"/api/v1/experiments/{response.json()['id']}/modules/basic_info",
        json={"payload_json": basic_info},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["payload_json"]["recorded_by_user_id"] == str(active_user.id)
    assert updated.json()["payload_json"]["note"] == "补充说明"


def test_scientific_revision_measurement_and_query_chain(
    active_user,
    admin_user,
    db_session,
) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)

    run_response = client.post(
        "/api/v1/experiments",
        json={
            "run_code": "CVD-2026-0901",
            "started_at": "2026-07-28T09:00:00+08:00",
            "synthesis_method": "CVD",
            "chemical_formula": "MoS2",
            "ambient_temperature": {
                "value": 25,
                "measured_at": "2026-07-28T08:55:00+08:00",
                "source_type": "room_sensor",
                "sensor_ref": "room-sensor-01",
            },
            "ambient_humidity": {
                "value": 45,
                "measured_at": "2026-07-28T08:55:00+08:00",
                "source_type": "manual_estimate",
            },
            "precheck_confirmed": True,
        },
        headers=headers,
    )
    assert run_response.status_code == 201, run_response.text
    run_id = run_response.json()["id"]

    setup_response = client.post(
        "/api/v1/setups",
        json=setup_payload(setup_code="SETUP-SCI-V4"),
        headers=admin_headers,
    )
    assert setup_response.status_code == 201, setup_response.text
    setup_id = setup_response.json()["id"]
    set_setup = client.put(
        f"/api/v1/experiments/{run_id}/setup-reference",
        json={
            "setup_id": setup_id,
            "version": 1,
            "tube_usage_history": {"reset_count": 0, "use_number_since_reset": 1},
        },
        headers=headers,
    )
    assert set_setup.status_code == 200, set_setup.text

    source_response = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "cas_number": "1313-27-5",
            "batch_number": "MO-V4-01",
            "purity": 99.99,
        },
        headers=admin_headers,
    )
    assert source_response.status_code == 201, source_response.text
    source_lot = source_response.json()
    gas_response = client.post(
        "/api/v1/material-lots",
        json=gas_lot_payload(batch_number="AR-V4-01"),
        headers=admin_headers,
    )
    assert gas_response.status_code == 201, gas_response.text
    gas_lot = gas_response.json()
    container_response = client.post(
        "/api/v1/container-instances",
        json={
            "material_lot_id": source_lot["id"],
            "container_code": "MO-V4-01-BOTTLE",
            "container_type": "bottle",
            "opened_date": "2026-07-01",
            "remaining_amount": 40,
            "remaining_unit": "g",
            "storage_history": [{"location": "desiccator_A"}],
        },
        headers=admin_headers,
    )
    assert container_response.status_code == 201, container_response.text
    container = container_response.json()

    substrate_response = client.post(
        "/api/v1/material-lots",
        json=substrate_lot_payload(batch_number="SUB-V4-01"),
        headers=admin_headers,
    )
    assert substrate_response.status_code == 201, substrate_response.text
    substrate_lot = substrate_response.json()

    _put_module(
        headers,
        run_id,
        "target_product",
        {
            "architecture_type": "single_region",
            "material_regions": [
                {
                    "region_key": "film",
                    "formula": "MoS2",
                    "spatial_role": "single_region",
                    "target_layer_count": 1,
                    "target_bulk_phase": "2H",
                    "target_bulk_space_group_number": 194,
                }
            ],
            "composition_relations": [],
            "dimensional_form": "discrete_planar_crystal",
            "in_plane_outline": "triangle",
        },
    )
    _put_module(
        headers,
        run_id,
        "precursors",
        {
            "items": [
                {
                    "load_key": "metal_source",
                    "container_instance_id": container["id"],
                    "loading_method": "boat",
                    "heating_zone_ref": "zone_1",
                    "initial_position": {
                        "axial_mm": 0,
                        "reference": "zone_thermocouple",
                    },
                    "ingredients": [
                        {
                            "material_lot_id": source_lot["id"],
                            "material_lot_version": 1,
                            "process_roles": [],
                            "amount": 10,
                            "unit": "mg",
                        }
                    ],
                }
            ]
        },
    )
    _put_module(
        headers,
        run_id,
        "substrates",
        {"items": [substrate_item(substrate_lot)]},
    )
    temperature_upload = client.post(
        f"/api/v1/experiments/{run_id}/files",
        headers=headers,
        data={
            "asset_role": "process_timeseries",
            "binding_type": "process_channel",
            "binding_id": "channel_22222222_2222_4222_8222_222222222222",
        },
        files={
            "file": (
                "temperature.csv",
                b"time_s,value\n0,25\n600,750\n1200,750\n1800,100\n",
                "text/csv",
            )
        },
    )
    assert temperature_upload.status_code == 201, temperature_upload.text
    pressure_upload = client.post(
        f"/api/v1/experiments/{run_id}/files",
        headers=headers,
        data={
            "asset_role": "process_timeseries",
            "binding_type": "process_channel",
            "binding_id": "channel_33333333_3333_4333_8333_333333333333",
        },
        files={
            "file": (
                "pressure.csv",
                b"time_s,value\n0,1\n900,2\n1800,1\n",
                "text/csv",
            )
        },
    )
    assert pressure_upload.status_code == 201, pressure_upload.text
    orphan_timeseries = client.post(
        f"/api/v1/experiments/{run_id}/files",
        headers=headers,
        data={
            "asset_role": "process_timeseries",
            "binding_type": "process_channel",
            "binding_id": "channel_99999999_9999_4999_8999_999999999999",
        },
        files={
            "file": (
                "orphan.csv",
                b"time_s,value\n0,1\n1800,2\n",
                "text/csv",
            )
        },
    )
    assert orphan_timeseries.status_code == 201, orphan_timeseries.text
    saved_process = _put_module(
        headers,
        run_id,
        "process_steps",
        {
            "segments": [
                {
                    "segment_key": "growth",
                    "segment_type": "growth",
                    "sequence": 1,
                    "start_s": 0,
                    "end_s": 1800,
                }
            ],
            "channels": [
                {
                    "channel_key": "channel_11111111_1111_4111_8111_111111111111",
                    "channel_type": "temperature",
                    "subject_type": "temperature_zone",
                    "subject_ref": "zone_1",
                    "subject_instance_ref": "zone_1_controller",
                    "zone_index": 1,
                    "source_type": "setpoint",
                    "unit": "K",
                    "data_kind": "interval_series",
                    "series": [{"start_s": 0, "end_s": 1800, "value": 1023}],
                },
                {
                    "channel_key": "channel_66666666_6666_4666_8666_666666666666",
                    "channel_type": "temperature",
                    "subject_type": "temperature_zone",
                    "subject_ref": "zone_2",
                    "subject_instance_ref": "zone_2_controller",
                    "zone_index": 2,
                    "source_type": "setpoint",
                    "unit": "K",
                    "data_kind": "interval_series",
                    "series": [{"start_s": 0, "end_s": 1800, "value": 973}],
                },
                {
                    "channel_key": "channel_22222222_2222_4222_8222_222222222222",
                    "channel_type": "temperature",
                    "subject_type": "temperature_zone",
                    "subject_ref": "zone_1",
                    "subject_instance_ref": "tc_zone_1",
                    "zone_index": 1,
                    "source_type": "measured",
                    "unit": "°C",
                    "data_kind": "timeseries_file",
                    "file_asset_id": temperature_upload.json()["id"],
                },
                {
                    "channel_key": "channel_33333333_3333_4333_8333_333333333333",
                    "channel_type": "pressure",
                    "subject_type": "pressure_location",
                    "subject_ref": "tube_outlet",
                    "subject_instance_ref": "pressure_gauge_outlet",
                    "pressure_location": "tube_outlet",
                    "pressure_type": "absolute",
                    "source_type": "measured",
                    "unit": "Torr",
                    "data_kind": "timeseries_file",
                    "file_asset_id": pressure_upload.json()["id"],
                },
                {
                    "channel_key": "channel_55555555_5555_4555_8555_555555555555",
                    "channel_type": "pressure",
                    "subject_type": "pressure_location",
                    "subject_ref": "reactor",
                    "subject_instance_ref": "pressure_setpoint_reactor",
                    "pressure_location": "reactor",
                    "pressure_type": "absolute",
                    "source_type": "setpoint",
                    "unit": "Torr",
                    "data_kind": "scalar",
                    "scalar_value": 1,
                },
                {
                    "channel_key": "channel_44444444_4444_4444_8444_444444444444",
                    "channel_type": "flow",
                    "subject_type": "gas_species",
                    "subject_ref": "氩气",
                    "subject_instance_ref": "mfc_ar_1",
                    "gas_species_code": "氩气",
                    "gas_lot_id": gas_lot["id"],
                    "gas_lot_version": 1,
                    "measurement_source": "mfc",
                    "source_type": "setpoint",
                    "unit": "sccm",
                    "data_kind": "scalar",
                    "scalar_value": 100,
                },
            ],
            "pressure_regime": "low_pressure",
            "cooling_method": "furnace_cooling",
            "preparation_operations": [
                {
                    "operation_type": "gas_exchange",
                    "duration_min": 10,
                    "exchange_mode": "continuous_flow",
                    "gas_sources": [
                        {
                            "material_lot_id": gas_lot["id"],
                            "material_lot_version": 1,
                            "flow_sccm": 120,
                        }
                    ],
                }
            ],
        },
    )
    assert saved_process["payload_json"]["preparation_operations"][0]["gas_sources"][0]["snapshot"][
        "attrs"
    ]["gas_components"] == [{"species": "Ar", "volume_percent": 100.0}]
    db_session.expire_all()
    assert db_session.get(FileAsset, UUID(temperature_upload.json()["id"])).deleted_at is None
    assert db_session.get(FileAsset, UUID(pressure_upload.json()["id"])).deleted_at is None
    assert db_session.get(FileAsset, UUID(orphan_timeseries.json()["id"])).deleted_at is not None
    event_attachment = client.post(
        f"/api/v1/experiments/{run_id}/files",
        headers=headers,
        data={
            "asset_role": "process_event_attachment",
            "binding_type": "process_event",
            "binding_id": "gas_line_event",
        },
        files={"file": ("event.txt", b"gas line interruption", "text/plain")},
    )
    assert event_attachment.status_code == 201, event_attachment.text
    orphan_attachment = client.post(
        f"/api/v1/experiments/{run_id}/files",
        headers=headers,
        data={
            "asset_role": "process_event_attachment",
            "binding_type": "process_event",
            "binding_id": "orphan_event",
        },
        files={"file": ("orphan.txt", b"orphan", "text/plain")},
    )
    assert orphan_attachment.status_code == 201, orphan_attachment.text
    _put_module(
        headers,
        run_id,
        "process_events",
        {
            "items": [
                {
                    "event_key": "gas_line_event",
                    "start_s": 0,
                    "end_s": 1800,
                    "affected_objects": ["gas_line"],
                    "observed_deviations": ["gas_interruption"],
                    "data_validity_impact": "partial",
                    "excluded_time_ranges": [{"start_s": 0, "end_s": 1800}],
                    "attachment_file_ids": [event_attachment.json()["id"]],
                },
                {
                    "event_key": "channel_gap",
                    "start_s": 0,
                    "end_s": 60,
                    "affected_objects": ["process_channel"],
                    "observed_deviations": ["signal_anomaly"],
                    "data_validity_impact": "partial",
                    "excluded_time_ranges": [{"start_s": 0, "end_s": 60}],
                },
            ]
        },
    )
    db_session.expire_all()
    assert db_session.get(FileAsset, UUID(event_attachment.json()["id"])).deleted_at is None
    assert db_session.get(FileAsset, UUID(orphan_attachment.json()["id"])).deleted_at is not None

    precursor_payload = client.get(
        f"/api/v1/experiments/{run_id}/modules/precursors",
        headers=headers,
    ).json()["payload_json"]
    precursor_payload["items"][0]["heating_zone_ref"] = "zone_99"
    _put_module(headers, run_id, "precursors", precursor_payload)
    invalid_heating = client.post(f"/api/v1/experiments/{run_id}/lock", headers=headers)
    assert invalid_heating.status_code == 422
    precursor_payload["items"][0]["heating_zone_ref"] = "zone_1"
    _put_module(headers, run_id, "precursors", precursor_payload)

    locked = client.post(f"/api/v1/experiments/{run_id}/lock", headers=headers)
    assert locked.status_code == 200, locked.text
    revision_1 = locked.json()["current_revision_id"]
    assert locked.json()["status"] == "locked"
    revision_row = db_session.get(RunRevision, UUID(revision_1))
    assert revision_row is not None
    frozen_gas_source = revision_row.content_json["modules"]["process_steps"][
        "preparation_operations"
    ][0]["gas_sources"][0]
    assert frozen_gas_source["snapshot"]["attrs"]["gas_components"] == [
        {"species": "Ar", "volume_percent": 100.0}
    ]
    assert "tampered" not in frozen_gas_source["snapshot"]
    projected_load = db_session.query(SourceLoad).filter_by(load_key="metal_source").one()
    assert projected_load.container_state_at_loading == "available"
    assert projected_load.container_snapshot_json["remaining_amount"] == 40
    temperature_channel = (
        db_session.query(ProcessChannel)
        .filter_by(
            run_revision_id=UUID(revision_1),
            channel_key="channel_22222222_2222_4222_8222_222222222222",
        )
        .one()
    )
    assert temperature_channel.statistics_json["max"] == 750
    assert temperature_channel.statistics_json["excluded_duration_s"] == 60
    assert temperature_channel.source_file_sha256 == temperature_upload.json()["sha256"]
    assert temperature_channel.parser_version == "process_timeseries_csv_v1"

    samples = client.get(
        f"/api/v1/samples?experiment_id={run_id}",
        headers=headers,
    )
    assert samples.status_code == 200, samples.text
    sample = samples.json()["items"][0]
    assert sample["material_system"] is None
    assert sample["actual_state"] == "unknown"

    measurement = client.post(
        "/api/v1/measurements",
        json={
            "measurement": {
                "sample_id": sample["id"],
                "method_profile": "optical_microscopy",
                "measured_at": "2026-07-28T12:00:00+08:00",
                "sample_region": {
                    "geometry_type": "area",
                    "label": "center",
                    "coordinate_system": "sample_local",
                    "x": 0,
                    "y": 0,
                    "width": 100,
                    "height": 100,
                    "unit": "μm",
                },
                "typed_conditions": {
                    "objective": "50x",
                    "illumination_mode": "bright_field",
                },
            },
            "properties": [
                {
                    "property_code": "coverage_percent",
                    "numeric_value": 0,
                    "unit": "%",
                    "statistic": "single_observation",
                }
            ],
            "assertions": [],
        },
        headers=headers,
    )
    assert measurement.status_code == 201, measurement.text
    assert measurement.json()["run_revision_id"] == revision_1
    db_session.expire_all()
    provenance = (
        db_session.query(RunFeature)
        .filter_by(
            run_revision_id=UUID(revision_1),
            feature_code="provenance_complete",
            ordinal=0,
        )
        .one()
    )
    assert provenance.boolean_value is True
    evidence_upload = client.post(
        f"/api/v1/experiments/{run_id}/files",
        headers=headers,
        data={
            "sample_id": sample["id"],
            "characterization_record_id": measurement.json()["id"],
            "method": "optical_microscopy",
            "asset_role": "characterization_file",
        },
        files={"file": ("optical.png", b"raw optical evidence", "image/png")},
    )
    assert evidence_upload.status_code == 201, evidence_upload.text
    db_session.refresh(provenance)
    assert provenance.boolean_value is True
    deleted_evidence = client.delete(
        f"/api/v1/files/{evidence_upload.json()['id']}",
        headers=headers,
    )
    assert deleted_evidence.status_code == 204
    db_session.refresh(provenance)
    assert provenance.boolean_value is True
    replacement_evidence = client.post(
        f"/api/v1/experiments/{run_id}/files",
        headers=headers,
        data={
            "sample_id": sample["id"],
            "characterization_record_id": measurement.json()["id"],
            "method": "optical_microscopy",
            "asset_role": "characterization_file",
        },
        files={"file": ("optical-replacement.png", b"replacement evidence", "image/png")},
    )
    assert replacement_evidence.status_code == 201, replacement_evidence.text
    db_session.refresh(provenance)
    assert provenance.boolean_value is True

    sample_after = client.get(f"/api/v1/samples/{sample['id']}", headers=headers)
    assert sample_after.status_code == 200, sample_after.text
    assert sample_after.json()["actual_state"] == "unknown"
    assert sample_after.json()["material_system"] is None
    assert sample_after.json()["target_material_system"] == "MoS2"

    dataset = client.post(
        "/api/v1/datasets/query",
        json={
            "filters": [
                {
                    "field": "property",
                    "property_code": "coverage_percent",
                    "operator": "eq",
                    "value": 0,
                },
            ]
        },
        headers=headers,
    )
    assert dataset.status_code == 200, dataset.text
    assert [item["run_id"] for item in dataset.json()["items"]] == [run_id]
    assert dataset.json()["items"][0]["features"]["max_temperature_setpoint_C"] == (
        pytest.approx(749.85)
    )
    assert dataset.json()["items"][0]["features"]["max_temperature_measured_C"] == 750
    assert dataset.json()["items"][0]["features"]["ramp_rate_measured_C_min"] == 72.5
    assert dataset.json()["items"][0]["features"]["pressure_measured_max_Pa"] == (
        pytest.approx(266.64473684210526)
    )
    assert dataset.json()["items"][0]["features"]["gas_species"] == "Ar"
    assert dataset.json()["query_manifest"]["schema_status"] == "INTERNAL_VALIDATION"
    assert dataset.json()["query_manifest"]["run_revision_ids"] == [revision_1]
    not_equal_existing = client.post(
        "/api/v1/datasets/query",
        json={
            "filters": [
                {
                    "field": "property",
                    "property_code": "coverage_percent",
                    "operator": "ne",
                    "value": 0,
                }
            ]
        },
        headers=headers,
    )
    assert not_equal_existing.json()["items"] == []
    not_equal_missing = client.post(
        "/api/v1/datasets/query",
        json={
            "filters": [
                {
                    "field": "property",
                    "property_code": "coverage_percent",
                    "operator": "ne",
                    "value": 1,
                }
            ]
        },
        headers=headers,
    )
    assert [item["run_id"] for item in not_equal_missing.json()["items"]] == [run_id]

    exported = client.get(
        f"/api/v1/experiments/{run_id}/export?revision_id={revision_1}",
        headers=headers,
    )
    assert exported.status_code == 200, exported.text
    export_json = exported.json()
    assert export_json["export_kind"] == "immutable_run_revision"
    assert export_json["citation_status"] == "CITABLE"
    assert export_json["run"]["revision_id"] == revision_1
    assert export_json["modules"]["target_product"]["material_regions"][0]["formula"] == "MoS2"
    assert (
        export_json["modules"]["target_product"]["material_regions"][0][
            "target_bulk_space_group_number"
        ]
        == 194
    )
    projected_target = (
        db_session.query(TargetSpec).filter_by(run_revision_id=UUID(revision_1)).one()
    )
    assert (
        projected_target.dimensional_form,
        projected_target.in_plane_outline,
    ) == ("discrete_planar_crystal", "triangle")
    projected_region = (
        db_session.query(TargetMaterialRegion).filter_by(target_spec_id=projected_target.id).one()
    )
    assert (
        projected_region.target_bulk_phase,
        projected_region.target_bulk_space_group_number,
    ) == (
        "2H",
        194,
    )
    assert export_json["modules"]["basic_info"]["ambient_temperature"]["source_type"] == (
        "room_sensor"
    )
    assert export_json["modules"]["basic_info"]["ambient_humidity"]["source_type"] == (
        "manual_estimate"
    )
    exported_operation = export_json["modules"]["process_steps"]["preparation_operations"][0]
    assert exported_operation["exchange_mode"] == "continuous_flow"
    assert exported_operation["gas_sources"][0]["flow_sccm"] == 120
    assert "cycle_count" not in exported_operation
    assert "gases" not in exported_operation
    assert exported_operation["gas_sources"][0]["snapshot"]["attrs"]["gas_components"] == [
        {"species": "Ar", "volume_percent": 100.0}
    ]
    ProcessTimelinePayload.model_validate(export_json["modules"]["process_steps"])
    assert "samples" not in export_json
    assert export_json["scientific_record"]["revisions"][0]["content_sha256"]
    assert export_json["scientific_record"]["source_loads"][0]["container_snapshot"][
        "container_code"
    ] == ("MO-V4-01-BOTTLE")
    assert (
        export_json["scientific_record"]["sample_revision_associations"][0]["run_revision_id"]
        == revision_1
    )
    assert export_json["scientific_record"]["measurements"][0]["properties"][0] == {
        "id": export_json["scientific_record"]["measurements"][0]["properties"][0]["id"],
        "measurement_run_id": measurement.json()["id"],
        "sample_id": sample["id"],
        "analysis_run_id": None,
        "property_code": "coverage_percent",
        "numeric_value": 0.0,
        "text_value": None,
        "structured_value": None,
        "unit": "%",
        "statistic": "single_observation",
        "uncertainty_value": None,
        "uncertainty_type": None,
        "sample_count": None,
        "quality_flag": "valid",
        "quality_note": None,
    }
    revision_1_file_ids = {item["id"] for item in export_json["scientific_record"]["files"]}
    assert {
        temperature_upload.json()["id"],
        pressure_upload.json()["id"],
        event_attachment.json()["id"],
    } <= revision_1_file_ids
    assert orphan_timeseries.json()["id"] not in revision_1_file_ids
    assert orphan_attachment.json()["id"] not in revision_1_file_ids

    contradictory = client.post(
        "/api/v1/measurements",
        json={
            "measurement": {
                "sample_id": sample["id"],
                "method_profile": "optical_microscopy",
                "measured_at": "2026-07-28T12:30:00+08:00",
                "sample_region": {
                    "geometry_type": "point",
                    "label": "whole-sample observation",
                    "coordinate_system": "sample_local",
                },
                "typed_conditions": {
                    "objective": "10x",
                    "illumination_mode": "bright_field",
                },
            },
            "properties": [{"property_code": "observation_note", "text_value": "Visible islands"}],
        },
        headers=headers,
    )
    assert contradictory.status_code == 201, contradictory.text
    sample_with_conflict = client.get(
        f"/api/v1/samples/{sample['id']}",
        headers=headers,
    )
    assert sample_with_conflict.json()["actual_state"] == "unknown"

    transformed = client.post(
        "/api/v1/transformations",
        json={
            "transformation_type": "cut",
            "input_sample_ids": [sample["id"]],
            "outputs": [
                {
                    "output_role": "left_half",
                    "dimensions": {
                        "length": 5,
                        "width": 10,
                        "unit": "mm",
                    },
                    "current_carrier": "sample_box_A",
                },
                {
                    "output_role": "right_half",
                    "dimensions": {
                        "length": 5,
                        "width": 10,
                        "unit": "mm",
                    },
                    "current_carrier": "sample_box_A",
                },
            ],
            "occurred_at": "2026-07-28T13:00:00+08:00",
            "parameters": {"tool": "diamond_scribe"},
            "consume_inputs": True,
        },
        headers=headers,
    )
    assert transformed.status_code == 201, transformed.text
    assert len(transformed.json()["output_sample_ids"]) == 2
    lineage = client.get(
        f"/api/v1/samples/{sample['id']}/lineage",
        headers=headers,
    )
    assert lineage.status_code == 200, lineage.text
    assert len(lineage.json()["transformations"]) == 1
    assert len(lineage.json()["samples"]) == 3

    review = client.post(
        f"/api/v1/experiments/{run_id}/review",
        json={"note": "scientific review complete"},
        headers=admin_headers,
    )
    assert review.status_code == 200, review.text
    assert review.json()["status"] == "reviewed"

    run_model = db_session.get(ExperimentRun, UUID(run_id))
    assert run_model is not None
    run_model.result_missing_todo = True
    db_session.commit()
    correction = client.post(
        f"/api/v1/experiments/{run_id}/correction-drafts",
        json={"reason": "correct target note"},
        headers=headers,
    )
    assert correction.status_code == 200, correction.text
    assert correction.json()["status"] == "draft"
    assert correction.json()["result_missing_todo"] is False
    corrected_process = client.get(
        f"/api/v1/experiments/{run_id}/modules/process_steps",
        headers=headers,
    ).json()["payload_json"]
    corrected_process["channels"] = [
        channel
        for channel in corrected_process["channels"]
        if channel.get("file_asset_id") != temperature_upload.json()["id"]
    ]
    _put_module(headers, run_id, "process_steps", corrected_process)
    _put_module(headers, run_id, "process_events", {"items": []})
    db_session.expire_all()
    assert db_session.get(FileAsset, UUID(temperature_upload.json()["id"])).deleted_at is None
    assert db_session.get(FileAsset, UUID(event_attachment.json()["id"])).deleted_at is None
    target = client.get(
        f"/api/v1/experiments/{run_id}/modules/target_product",
        headers=headers,
    ).json()["payload_json"]
    target["note"] = "corrected without overwriting revision 1"
    _put_module(headers, run_id, "target_product", target)

    relocked = client.post(f"/api/v1/experiments/{run_id}/lock", headers=headers)
    assert relocked.status_code == 200, relocked.text
    revision_2 = relocked.json()["current_revision_id"]
    assert revision_2 != revision_1
    associations = (
        db_session.query(SampleRevisionAssociation).filter_by(sample_id=UUID(sample["id"])).all()
    )
    assert {str(item.run_revision_id) for item in associations} == {
        revision_1,
        revision_2,
    }
    states = db_session.query(SampleRevisionState).filter_by(sample_id=UUID(sample["id"])).all()
    assert {
        str(item.run_revision_id): (item.growth_state, item.identity_state) for item in states
    } == {
        revision_1: ("unknown", "unknown"),
        revision_2: ("unknown", "unknown"),
    }
    sample_in_revision_2 = client.get(
        f"/api/v1/samples/{sample['id']}",
        headers=headers,
    )
    assert sample_in_revision_2.json()["actual_state"] == "unknown"
    revisions = client.get(
        f"/api/v1/experiments/{run_id}/revisions",
        headers=headers,
    )
    assert revisions.status_code == 200, revisions.text
    assert [item["status"] for item in revisions.json()["items"]] == [
        "locked",
        "superseded",
    ]
    current_revision_query = client.post(
        "/api/v1/datasets/query",
        json={
            "filters": [
                {
                    "field": "property",
                    "property_code": "coverage_percent",
                    "operator": "eq",
                    "value": 0,
                }
            ]
        },
        headers=headers,
    )
    assert current_revision_query.status_code == 200
    assert current_revision_query.json()["items"] == []

    old_export = client.get(
        f"/api/v1/experiments/{run_id}/export?revision_id={revision_1}",
        headers=headers,
    )
    current_export = client.get(
        f"/api/v1/experiments/{run_id}/export?revision_id={revision_2}",
        headers=headers,
    )
    assert old_export.status_code == current_export.status_code == 200
    old_file_ids = {item["id"] for item in old_export.json()["scientific_record"]["files"]}
    current_file_ids = {item["id"] for item in current_export.json()["scientific_record"]["files"]}
    assert {
        temperature_upload.json()["id"],
        pressure_upload.json()["id"],
        event_attachment.json()["id"],
    } <= old_file_ids
    assert pressure_upload.json()["id"] in current_file_ids
    assert temperature_upload.json()["id"] not in current_file_ids
    assert event_attachment.json()["id"] not in current_file_ids

    old_revision = db_session.get(RunRevision, UUID(revision_1))
    assert old_revision is not None
    old_revision.content_json = {"tampered": True}
    with pytest.raises(ValueError, match="immutable"):
        db_session.flush()
    db_session.rollback()


def test_product_golden_workflows(active_user, admin_user, db_session) -> None:
    """G1–G5: create, fill, submit, generate a sample, characterize, and verify."""
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)

    setup = client.post(
        "/api/v1/setups",
        json=setup_payload(setup_code="SETUP-GOLDEN", zone_count=1),
        headers=admin_headers,
    )
    assert setup.status_code == 201, setup.text
    source = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "cas_number": "1313-27-5",
            "batch_number": "DEMO-MOO3",
            "purity": 99.9,
        },
        headers=admin_headers,
    )
    assert source.status_code == 201, source.text
    substrate = client.post(
        "/api/v1/material-lots",
        json=substrate_lot_payload(batch_number="DEMO-SUBSTRATE"),
        headers=admin_headers,
    )
    assert substrate.status_code == 201, substrate.text
    gas = client.post(
        "/api/v1/material-lots",
        json=gas_lot_payload(batch_number="DEMO-AR"),
        headers=admin_headers,
    )
    assert gas.status_code == 201, gas.text

    single = {
        "architecture_type": "single_region",
        "material_regions": [
            {
                "region_key": "film",
                "formula": "MoS2",
                "spatial_role": "single_region",
                "target_bulk_phase": "2H",
                "target_bulk_space_group_number": 194,
            }
        ],
        "composition_relations": [],
    }
    cases = [
        ("G1", single, "growth_present"),
        (
            "G2",
            {
                **single,
                "composition_relations": [
                    {
                        "relation_type": "doped_by",
                        "host_region_key": "film",
                        "species": "Pt",
                        "nominal_value": 1,
                        "value_basis": "at_percent",
                        "site_or_location": "Mo_site",
                    }
                ],
            },
            "growth_present",
        ),
        (
            "G3",
            {
                **single,
                "material_regions": [
                    {
                        **single["material_regions"][0],
                        "formula": "Mo0.5W0.5S2",
                    }
                ],
                "composition_relations": [
                    {
                        "relation_type": "solid_solution_component",
                        "host_region_key": "film",
                        "species": "MoS2",
                        "nominal_value": 0.5,
                        "value_basis": "mol_fraction",
                    },
                    {
                        "relation_type": "solid_solution_component",
                        "host_region_key": "film",
                        "species": "WS2",
                        "nominal_value": 0.5,
                        "value_basis": "mol_fraction",
                    },
                ],
            },
            "growth_present",
        ),
        (
            "G4",
            {
                "architecture_type": "vertical_stack",
                "material_regions": [
                    {
                        "region_key": "layer_1",
                        "formula": "MoS2",
                        "spatial_role": "layer",
                        "layer_index": 1,
                        "target_bulk_phase": "2H",
                        "target_bulk_space_group_number": 194,
                    },
                    {
                        "region_key": "layer_2",
                        "formula": "WS2",
                        "spatial_role": "layer",
                        "layer_index": 2,
                        "target_bulk_phase": "2H",
                        "target_bulk_space_group_number": 194,
                    },
                ],
                "composition_relations": [],
            },
            "growth_present",
        ),
        ("G5", single, "no_growth"),
    ]

    for index, (_case, target, expected_state) in enumerate(cases, start=1):
        started_at = f"2026-07-{index + 20:02d}T09:00:00+08:00"
        created = client.post(
            "/api/v1/experiments",
            json={
                "run_code": f"CVD-2026-10{index:02d}",
                "started_at": started_at,
                "synthesis_method": "CVD",
                "performed_by_user_ids": [str(active_user.id)],
                "ambient_temperature": {
                    "value": 24 + index / 10,
                    "measured_at": started_at,
                    "source_type": "manual_entry",
                },
                "ambient_humidity": {
                    "value": 40 + index,
                    "measured_at": started_at,
                    "source_type": "manual_entry",
                },
                "precheck_confirmed": True,
            },
            headers=headers,
        )
        assert created.status_code == 201, created.text
        run_id = created.json()["id"]
        setup_ref = client.put(
            f"/api/v1/experiments/{run_id}/setup-reference",
            json={
                "setup_id": setup.json()["id"],
                "version": 1,
                "tube_usage_history": {
                    "reset_count": index - 1,
                    "use_number_since_reset": index,
                },
            },
            headers=headers,
        )
        assert setup_ref.status_code == 200, setup_ref.text
        _put_module(headers, run_id, "target_product", target)
        saved_substrates = _put_module(
            headers,
            run_id,
            "substrates",
            {"items": [substrate_item(substrate.json())]},
        )
        substrate_source_id = saved_substrates["payload_json"]["items"][0]["source_id"]
        source_load = {
            "load_key": "metal_source",
            "loading_method": "boat",
            "heating_zone_ref": "zone_1",
            "initial_position": {
                "axial_mm": 0,
                "reference": "zone_thermocouple",
            },
            "ingredients": [
                {
                    "material_lot_id": source.json()["id"],
                    "material_lot_version": 1,
                    "process_roles": [],
                    "amount": 10,
                    "unit": "mg",
                }
            ],
        }
        if index == 1:
            source_load = {
                **source_load,
                "loading_method": "substrate_surface",
                "substrate_source_ids": [substrate_source_id],
            }
            source_load.pop("heating_zone_ref")
            source_load.pop("initial_position")
        _put_module(
            headers,
            run_id,
            "precursors",
            {"items": [source_load]},
        )
        _put_module(
            headers,
            run_id,
            "process_steps",
            {
                "segments": [],
                "channels": [
                    {
                        "channel_key": (
                            f"channel_0000000{index}_0000_4000_8000_00000000000{index}"
                        ),
                        "channel_type": "temperature",
                        "source_type": "setpoint",
                        "subject_type": "temperature_zone",
                        "subject_ref": "zone_1",
                        "subject_instance_ref": (f"setup:{setup.json()['id']}:zone:1"),
                        "zone_index": 1,
                        "unit": "°C",
                        "data_kind": "interval_series",
                        "series": [{"start_s": 0, "value": 750}],
                    },
                    {
                        "channel_key": (
                            f"channel_1000000{index}_0000_4000_8000_00000000000{index}"
                        ),
                        "channel_type": "flow",
                        "source_type": "setpoint",
                        "subject_type": "gas_species",
                        "subject_ref": "Ar",
                        "subject_instance_ref": (f"setup:{setup.json()['id']}:gas:Ar:1"),
                        "gas_species_code": "Ar",
                        "gas_lot_id": gas.json()["id"],
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
        )
        _put_module(
            headers,
            run_id,
            "process_events",
            {
                "items": [
                    {
                        "event_key": f"manual_intervention_{index}",
                        "start_s": 3600,
                        "end_s": 3660,
                        "observed_deviations": ["manual_intervention"],
                    }
                ]
            },
        )
        locked = client.post(
            f"/api/v1/experiments/{run_id}/lock",
            headers=headers,
        )
        assert locked.status_code == 200, locked.text
        revision = db_session.get(RunRevision, UUID(locked.json()["current_revision_id"]))
        assert revision is not None
        if index == 1:
            assert (
                revision.content_json["modules"]["substrates"]["items"][0]["source_id"]
                == substrate_source_id
            )
        samples = client.get(
            f"/api/v1/samples?experiment_id={run_id}",
            headers=headers,
        )
        assert samples.status_code == 200, samples.text
        assert len(samples.json()["items"]) == 1
        sample_id = samples.json()["items"][0]["id"]

        measured = client.post(
            "/api/v1/measurements",
            json={
                "measurement": {
                    "sample_id": sample_id,
                    "method_profile": "optical_microscopy",
                    "measured_at": f"2026-07-{index + 20:02d}T12:00:00+08:00",
                    "sample_region": {
                        "geometry_type": "whole_sample",
                        "label": "whole sample",
                        "coordinate_system": "sample_local",
                    },
                    "typed_conditions": {},
                },
                "properties": [
                    {
                        "property_code": "observation_note",
                        "text_value": "No visible islands"
                        if expected_state == "no_growth"
                        else "Visible islands",
                    }
                ],
            },
            headers=headers,
        )
        assert measured.status_code == 201, measured.text
        sample = client.get(f"/api/v1/samples/{sample_id}", headers=headers)
        assert sample.status_code == 200, sample.text
        assert sample.json()["actual_state"] == "unknown"
        assert sample.json()["characterization_count"] == 1
