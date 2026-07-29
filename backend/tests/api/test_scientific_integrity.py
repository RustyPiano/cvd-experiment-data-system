from datetime import UTC, date, datetime
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.sample import Sample
from app.models.scientific import RunRevision, TransformationInput
from app.models.user import User, UserRole
from app.models.v2_entities import (
    Instrument,
    InstrumentCapability,
    InstrumentLifecycleEvent,
    InstrumentVersion,
)
from app.schemas.scientific import AmbientMeasurement, ScientificProcessEventPayload
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
    _, sample = _locked_sample(db_session, active_user, "03")
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
    db_session.commit()

    response = client.post(
        "/api/v1/measurements",
        json={
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
            },
            "assertions": [
                {
                    "assertion_type": "phase_identity",
                    "value": {"phase": "2H-MoS2"},
                }
            ],
        },
        headers=_headers(active_user.email),
    )
    assert response.status_code == 201, response.text
    snapshot = response.json()["instrument_snapshot_json"]["calibration_at_measurement"]
    assert snapshot["event_id"] == str(calibration.id)
    assert snapshot["validity_status"] == "valid"
    assert snapshot["expanded_uncertainty"] == 0.5
