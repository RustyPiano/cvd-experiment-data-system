from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.scientific import RunRevision, SampleRevisionAssociation, SourceLoad
from tests.helpers.v2_payloads import setup_payload, substrate_item, substrate_lot_payload

client = TestClient(app)


def _headers(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _put_module(
    headers: dict[str, str],
    run_id: str,
    module: str,
    payload: dict,
) -> None:
    response = client.put(
        f"/api/v1/experiments/{run_id}/modules/{module}",
        json={"payload_json": payload},
        headers=headers,
    )
    assert response.status_code == 200, response.text


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
            "purity_basis": "mass_fraction",
            "purity_source": "supplier_declared",
        },
        headers=admin_headers,
    )
    assert source_response.status_code == 201, source_response.text
    source_lot = source_response.json()
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
                }
            ],
            "composition_relations": [],
            "dimensional_form": "sheet",
            "coverage_state": "continuous",
            "orientation": "in_plane",
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
                    "initial_position": {
                        "axial_mm": 0,
                        "reference": "setup_origin",
                    },
                    "ingredients": [
                        {
                            "material_lot_id": source_lot["id"],
                            "material_lot_version": 1,
                            "function_role": "metal_source",
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
    _put_module(
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
                    "zone_index": 1,
                    "source_type": "setpoint",
                    "unit": "K",
                    "data_kind": "interval_series",
                    "series": [{"start_s": 0, "end_s": 1800, "value": 1023}],
                },
                {
                    "channel_key": "channel_22222222_2222_4222_8222_222222222222",
                    "channel_type": "temperature",
                    "subject_type": "temperature_zone",
                    "subject_ref": "zone_1",
                    "zone_index": 1,
                    "source_type": "measured",
                    "unit": "°C",
                    "data_kind": "scalar",
                    "scalar_value": 749,
                },
                {
                    "channel_key": "channel_33333333_3333_4333_8333_333333333333",
                    "channel_type": "pressure",
                    "subject_type": "pressure_location",
                    "subject_ref": "tube_outlet",
                    "pressure_location": "tube_outlet",
                    "pressure_type": "absolute",
                    "source_type": "measured",
                    "unit": "Torr",
                    "data_kind": "scalar",
                    "scalar_value": 760,
                },
                {
                    "channel_key": "channel_44444444_4444_4444_8444_444444444444",
                    "channel_type": "flow",
                    "subject_type": "gas_species",
                    "subject_ref": "氩气",
                    "gas_species": "氩气",
                    "source_type": "setpoint",
                    "unit": "sccm",
                    "data_kind": "scalar",
                    "scalar_value": 100,
                },
            ],
        },
    )
    _put_module(headers, run_id, "process_events", {"items": []})

    precursor_payload = client.get(
        f"/api/v1/experiments/{run_id}/modules/precursors",
        headers=headers,
    ).json()["payload_json"]
    precursor_payload["items"][0]["heating_channel"] = (
        "channel_44444444_4444_4444_8444_444444444444"
    )
    _put_module(headers, run_id, "precursors", precursor_payload)
    invalid_heating = client.post(f"/api/v1/experiments/{run_id}/lock", headers=headers)
    assert invalid_heating.status_code == 422
    precursor_payload["items"][0]["heating_channel"] = (
        "channel_11111111_1111_4111_8111_111111111111"
    )
    _put_module(headers, run_id, "precursors", precursor_payload)

    locked = client.post(f"/api/v1/experiments/{run_id}/lock", headers=headers)
    assert locked.status_code == 200, locked.text
    revision_1 = locked.json()["current_revision_id"]
    assert locked.json()["status"] == "locked"
    projected_load = db_session.query(SourceLoad).filter_by(load_key="metal_source").one()
    assert projected_load.container_state_at_loading == "available"
    assert projected_load.container_snapshot_json["remaining_amount"] == 40

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
            "assertions": [
                {
                    "assertion_type": "growth_presence",
                    "value": {"state": "absent"},
                    "confidence": 0.95,
                }
            ],
        },
        headers=headers,
    )
    assert measurement.status_code == 201, measurement.text
    assert measurement.json()["run_revision_id"] == revision_1

    sample_after = client.get(f"/api/v1/samples/{sample['id']}", headers=headers)
    assert sample_after.status_code == 200, sample_after.text
    assert sample_after.json()["actual_state"] == "no_growth"
    assert sample_after.json()["material_system"] is None
    assert sample_after.json()["target_material_system"] == "MoS2"

    dataset = client.post(
        "/api/v1/datasets/query",
        json={
            "filters": [
                {
                    "field": "growth_presence",
                    "operator": "eq",
                    "value": "absent",
                },
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
    assert dataset.json()["items"][0]["features"]["pressure_measured_max_Pa"] == (
        pytest.approx(101_325)
    )
    assert dataset.json()["items"][0]["features"]["gas_species"] == "氩气"
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
    assert export_json["modules"]["basic_info"]["ambient_temperature"]["source_type"] == (
        "room_sensor"
    )
    assert export_json["modules"]["basic_info"]["ambient_humidity"]["source_type"] == (
        "manual_estimate"
    )
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
    }

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
            "assertions": [
                {
                    "assertion_type": "growth_presence",
                    "value": {"state": "present"},
                }
            ],
        },
        headers=headers,
    )
    assert contradictory.status_code == 201, contradictory.text
    sample_with_conflict = client.get(
        f"/api/v1/samples/{sample['id']}",
        headers=headers,
    )
    assert sample_with_conflict.json()["actual_state"] == "uncertain"

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

    correction = client.post(
        f"/api/v1/experiments/{run_id}/correction-drafts",
        json={"reason": "correct target note"},
        headers=headers,
    )
    assert correction.status_code == 200, correction.text
    assert correction.json()["status"] == "draft"
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

    old_revision = db_session.get(RunRevision, UUID(revision_1))
    assert old_revision is not None
    old_revision.content_json = {"tampered": True}
    with pytest.raises(ValueError, match="immutable"):
        db_session.flush()
    db_session.rollback()
