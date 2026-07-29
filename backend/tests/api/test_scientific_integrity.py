from datetime import UTC, date, datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.sample import Sample
from app.models.scientific import RunRevision, TransformationInput
from app.models.user import User, UserRole
from app.models.v2_entities import (
    Instrument,
    InstrumentCapability,
    InstrumentLifecycleEvent,
    InstrumentVersion,
)
from app.models.v2_results import CharacterizationRecord
from app.schemas.scientific import (
    AmbientMeasurement,
    MaterialAssertionWrite,
    MeasurementBundleCreate,
    ProcessTimelinePayload,
    ScientificProcessEventPayload,
)
from app.services.v2_field_source import SCHEMA_VERSION

client = TestClient(app)


def test_ambient_measurement_preserves_unknown_and_evidence_boundaries() -> None:
    assert AmbientMeasurement(source_type="not_measured").model_dump(exclude_none=True) == {
        "source_type": "not_measured"
    }
    with pytest.raises(ValueError):
        AmbientMeasurement(
            source_type="room_sensor",
            value=25,
            measured_at="2026-07-29T09:00:00+08:00",
        )
    with pytest.raises(ValueError):
        AmbientMeasurement(
            source_type="not_measured",
            value=25,
        )


def test_process_event_uses_unique_controlled_values() -> None:
    payload = {
        "event_key": "gas_interruption_1",
        "start_s": 10,
        "observed_deviations": ["gas_interruption"],
        "affected_objects": ["gas_line"],
        "suspected_causes": ["utility_interruption"],
        "intervention_actions": ["restart_supply"],
    }
    assert ScientificProcessEventPayload.model_validate(payload).observed_deviations == [
        "gas_interruption"
    ]
    with pytest.raises(ValueError):
        ScientificProcessEventPayload.model_validate(
            {**payload, "observed_deviations": ["free text"]}
        )
    with pytest.raises(ValueError):
        ScientificProcessEventPayload.model_validate(
            {**payload, "affected_objects": ["gas_line", "gas_line"]}
        )


def test_process_channels_distinguish_physical_instances_and_normalize_gas() -> None:
    timeline = ProcessTimelinePayload.model_validate(
        {
            "segments": [
                {
                    "segment_key": "growth",
                    "segment_type": "growth",
                    "sequence": 1,
                    "start_s": 0,
                    "end_s": 60,
                }
            ],
            "channels": [
                {
                    "channel_key": f"channel_{uuid4()}".replace("-", "_"),
                    "channel_type": "temperature",
                    "source_type": "measured",
                    "subject_type": "temperature_zone",
                    "subject_ref": "zone_1",
                    "subject_instance_ref": "TC-1A",
                    "zone_index": 1,
                    "unit": "°C",
                    "data_kind": "scalar",
                    "scalar_value": 749,
                },
                {
                    "channel_key": f"channel_{uuid4()}".replace("-", "_"),
                    "channel_type": "temperature",
                    "source_type": "measured",
                    "subject_type": "temperature_zone",
                    "subject_ref": "zone_1",
                    "subject_instance_ref": "TC-1B",
                    "zone_index": 1,
                    "unit": "°C",
                    "data_kind": "scalar",
                    "scalar_value": 751,
                },
                *[
                    {
                        "channel_key": f"channel_{uuid4()}".replace("-", "_"),
                        "channel_type": "flow",
                        "source_type": "measured",
                        "subject_type": "gas_species",
                        "subject_ref": alias,
                        "subject_instance_ref": instance,
                        "gas_species_code": alias,
                        "unit": "sccm",
                        "data_kind": "scalar",
                        "scalar_value": 50,
                    }
                    for alias, instance in (("氩气", "MFC-Ar-1"), ("argon", "MFC-Ar-2"))
                ],
                *[
                    {
                        "channel_key": f"channel_{uuid4()}".replace("-", "_"),
                        "channel_type": "valve_state",
                        "source_type": "measured",
                        "subject_type": "device",
                        "subject_ref": "valve_state",
                        "subject_instance_ref": instance,
                        "unit": "state",
                        "data_kind": "interval_series",
                        "series": [{"start_s": 0, "end_s": 60, "value": "open"}],
                    }
                    for instance in ("valve-1", "valve-2")
                ],
            ],
        }
    )
    assert [item.gas_species_code for item in timeline.channels[2:4]] == ["Ar", "Ar"]


def test_simple_growth_contract_keeps_atmospheric_pressure_imprecise() -> None:
    payload = {
        "segments": [
            {
                "segment_key": "growth",
                "segment_type": "growth",
                "sequence": 1,
                "start_s": 0,
                "end_s": 3600,
            }
        ],
        "channels": [
            {
                "channel_key": f"channel_{uuid4()}".replace("-", "_"),
                "channel_type": "temperature",
                "source_type": "setpoint",
                "subject_type": "temperature_zone",
                "subject_ref": "zone_1",
                "subject_instance_ref": "setup:demo:zone:1",
                "zone_index": 1,
                "unit": "°C",
                "data_kind": "interval_series",
                "series": [
                    {"start_s": 0, "value": 25},
                    {"start_s": 1800, "value": 750},
                ],
            }
        ],
        "pressure_regime": "atmospheric",
        "cooling_method": "natural",
    }
    assert ProcessTimelinePayload.model_validate(payload).pressure_regime == "atmospheric"

    pressure = {
        "channel_key": f"channel_{uuid4()}".replace("-", "_"),
        "channel_type": "pressure",
        "source_type": "setpoint",
        "subject_type": "pressure_location",
        "subject_ref": "reactor",
        "subject_instance_ref": "setup:demo:pressure:1",
        "pressure_location": "reactor",
        "pressure_type": "unspecified",
        "unit": "Pa",
        "data_kind": "scalar",
        "scalar_value": 1000,
    }
    with pytest.raises(ValueError, match="must not include"):
        ProcessTimelinePayload.model_validate(
            {**payload, "channels": [*payload["channels"], pressure]}
        )

    low_pressure = ProcessTimelinePayload.model_validate(
        {
            **payload,
            "channels": [*payload["channels"], pressure],
            "pressure_regime": "low_pressure",
        }
    )
    assert low_pressure.channels[-1].pressure_type == "unspecified"


def test_measurement_contract_rejects_cross_method_properties_and_bad_composition() -> None:
    with pytest.raises(ValueError, match="sum to one"):
        MaterialAssertionWrite.model_validate(
            {
                "assertion_type": "composition",
                "value": {
                    "basis": "atomic_fraction",
                    "components": [
                        {"species": "Mo", "fraction": 0.8},
                        {"species": "W", "fraction": 0.8},
                    ],
                },
            }
        )
    payload = {
        "measurement": {
            "sample_id": str(uuid4()),
            "method_profile": "AFM",
            "instrument_id": str(uuid4()),
            "instrument_version": 1,
            "measured_at": "2026-07-29T10:00:00+08:00",
            "sample_region": {
                "geometry_type": "area",
                "label": "center",
                "coordinate_system": "sample_local",
                "width": 5,
                "height": 5,
                "unit": "μm",
            },
            "typed_conditions": {
                "mode": "tapping",
                "probe": "Si",
                "scan_size_um": {"x": 5, "y": 5},
                "resolution_px": {"width": 512, "height": 512},
                "scan_rate_hz": 1,
            },
            "raw_file_ids": [str(uuid4())],
        },
        "properties": [
            {
                "property_code": "raman_a1g_peak_position",
                "numeric_value": 405,
                "unit": "cm⁻¹",
            }
        ],
    }
    with pytest.raises(ValueError, match="do not apply to AFM"):
        MeasurementBundleCreate.model_validate(payload)


def test_optical_measurement_does_not_require_growth_assertion() -> None:
    bundle = MeasurementBundleCreate.model_validate(
        {
            "measurement": {
                "sample_id": str(uuid4()),
                "method_profile": "optical_microscopy",
                "measured_at": "2026-07-29T10:00:00+08:00",
                "sample_region": {
                    "geometry_type": "whole_sample",
                    "label": "whole sample",
                    "coordinate_system": "sample_local",
                },
                "typed_conditions": {
                    "objective": "10x",
                    "illumination_mode": "bright_field",
                },
            },
            "properties": [
                {
                    "property_code": "coverage_percent",
                    "numeric_value": 10,
                    "unit": "%",
                }
            ],
        }
    )
    assert bundle.assertions == []


def _headers(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _locked_sample(db_session, owner: User, suffix: str) -> tuple[ExperimentRun, Sample]:
    run = ExperimentRun(
        run_code=f"CVD-2026-98{suffix}",
        owner_id=owner.id,
        schema_version=SCHEMA_VERSION,
        material_system="MoS2",
        experiment_date=date(2026, 7, 29),
        status=ExperimentStatus.LOCKED,
    )
    db_session.add(run)
    db_session.flush()
    revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=1,
        schema_version=SCHEMA_VERSION,
        schema_status="INTERNAL_VALIDATION",
        status="locked",
        content_json={"run": {"id": str(run.id)}, "modules": {}},
        content_sha256=suffix[-1] * 64,
        locked_by_id=owner.id,
    )
    db_session.add(revision)
    db_session.flush()
    run.current_revision_id = revision.id
    sample = Sample(
        sample_code=f"{run.run_code}-S01",
        experiment_run_id=run.id,
        run_revision_id=revision.id,
        role="growth",
    )
    db_session.add(sample)
    db_session.commit()
    return run, sample


def test_transformation_acl_provenance_and_cross_run_lineage(
    active_user,
    admin_user,
    db_session,
) -> None:
    run_a, sample_a = _locked_sample(db_session, active_user, "01")
    run_b, sample_b = _locked_sample(db_session, active_user, "02")
    other = User(
        email="scientific-other@example.com",
        name="Scientific Other",
        password_hash=active_user.password_hash,
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    payload = {
        "transformation_type": "stack",
        "input_sample_ids": [str(sample_a.id), str(sample_b.id)],
        "outputs": [{"output_role": "stacked_sample"}],
        "occurred_at": "2026-07-29T10:00:00+08:00",
        "consume_inputs": False,
    }

    missing_context = client.post(
        "/api/v1/transformations",
        json=payload,
        headers=_headers(active_user.email),
    )
    assert missing_context.status_code == 422
    forbidden = client.post(
        "/api/v1/transformations",
        json={**payload, "output_experiment_run_id": str(run_a.id)},
        headers=_headers(other.email),
    )
    assert forbidden.status_code == 403
    created = client.post(
        "/api/v1/transformations",
        json={**payload, "output_experiment_run_id": str(run_a.id)},
        headers=_headers(active_user.email),
    )
    assert created.status_code == 201, created.text
    output_id = created.json()["output_sample_ids"][0]
    input_edges = (
        db_session.query(TransformationInput)
        .filter_by(transformation_run_id=UUID(created.json()["id"]))
        .all()
    )
    assert {edge.run_revision_id for edge in input_edges} == {
        run_a.current_revision_id,
        run_b.current_revision_id,
    }
    assert {edge.provenance_json["experiment_run_id"] for edge in input_edges} == {
        str(run_a.id),
        str(run_b.id),
    }
    lineage = client.get(
        f"/api/v1/samples/{output_id}/lineage",
        headers=_headers(active_user.email),
    )
    assert {item["id"] for item in lineage.json()["samples"]} >= {
        str(sample_a.id),
        str(sample_b.id),
        output_id,
    }

    consume = client.post(
        "/api/v1/transformations",
        json={
            **payload,
            "output_experiment_run_id": str(run_a.id),
            "consume_inputs": True,
        },
        headers=_headers(active_user.email),
    )
    assert consume.status_code == 201
    repeated = client.post(
        "/api/v1/transformations",
        json={**payload, "output_experiment_run_id": str(run_a.id)},
        headers=_headers(active_user.email),
    )
    assert repeated.status_code == 409

    member_review = client.post(
        f"/api/v1/experiments/{run_a.id}/review",
        json={},
        headers=_headers(active_user.email),
    )
    assert member_review.status_code == 403
    admin_review = client.post(
        f"/api/v1/experiments/{run_a.id}/review",
        json={},
        headers=_headers(admin_user.email),
    )
    assert admin_review.status_code == 200
    still_visible = client.get(
        f"/api/v1/experiments/{run_a.id}",
        headers=_headers(other.email),
    )
    assert still_visible.status_code == 200


def test_measurement_freezes_calibration_state(active_user, db_session) -> None:
    run, sample = _locked_sample(db_session, active_user, "03")
    instrument = Instrument()
    db_session.add(instrument)
    db_session.flush()
    version = InstrumentVersion(
        entity_id=instrument.id,
        version=1,
        instrument_code="RAMAN-QA",
        name_type="Raman",
        attrs={},
    )
    db_session.add(version)
    db_session.flush()
    db_session.add(
        InstrumentCapability(
            instrument_version_id=version.id,
            capability_code="Raman",
            configuration_json={},
        )
    )
    calibration = InstrumentLifecycleEvent(
        instrument_id=instrument.id,
        event_type="calibration",
        occurred_at=datetime(2026, 7, 1, tzinfo=UTC),
        valid_until=datetime(2027, 7, 1, tzinfo=UTC),
        quantity="Raman shift",
        correction=0.2,
        expanded_uncertainty=0.5,
        details_json={"reference": "silicon"},
    )
    db_session.add(calibration)
    raw_file = FileAsset(
        experiment_run_id=run.id,
        sample_id=sample.id,
        uploaded_by_id=active_user.id,
        original_name="raman-spectrum.txt",
        storage_path=f"test/{sample.id}_raman-spectrum.txt",
        content_type="text/plain",
        size_bytes=12,
        sha256="b" * 64,
        method="PL",
        file_category="raw",
        asset_role="characterization_file",
        file_kind="spectrum",
        metadata_json={},
    )
    db_session.add(raw_file)
    db_session.commit()

    payload = {
        "measurement": {
            "sample_id": str(sample.id),
            "method_profile": "Raman",
            "instrument_id": str(instrument.id),
            "instrument_version": 1,
            "measured_at": "2026-07-29T10:00:00+00:00",
            "sample_region": {
                "geometry_type": "point",
                "label": "center",
                "coordinate_system": "sample_local",
            },
            "typed_conditions": {
                "laser_wavelength_nm": 532,
                "power_setting": "1 mW",
                "objective": "50x",
                "integration_time_s": 5,
                "accumulations": 3,
            },
            "raw_file_ids": [str(raw_file.id)],
        },
        "assertions": [
            {
                "assertion_type": "phase_identity",
                "value": {"phase": "2H-MoS2"},
            }
        ],
    }
    headers = _headers(active_user.email)
    wrong_method = client.post(
        "/api/v1/measurements",
        json=payload,
        headers=headers,
    )
    assert wrong_method.status_code == 422
    raw_file.method = "Raman"
    db_session.commit()

    response = client.post(
        "/api/v1/measurements",
        json=payload,
        headers=headers,
    )
    assert response.status_code == 201, response.text
    duplicate = client.post(
        "/api/v1/measurements",
        json=payload,
        headers=headers,
    )
    assert duplicate.status_code == 422
    assert duplicate.json()["detail"] == "Raw data files are already linked to a measurement"
    db_session.refresh(raw_file)
    assert raw_file.characterization_record_id == UUID(response.json()["id"])
    assert db_session.query(CharacterizationRecord).count() == 1
    snapshot = response.json()["instrument_snapshot_json"]["calibration_at_measurement"]
    assert snapshot["event_id"] == str(calibration.id)
    assert snapshot["validity_status"] == "valid"
    assert snapshot["expanded_uncertainty"] == 0.5
    db_session.refresh(sample)
    assert sample.actual_state == "unknown"
    assert sample.identity_state == "asserted"
    assert sample.actual_material_summary == "2H-MoS2"
