from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError

from app.schemas.experiment import ExperimentCreate
from app.services.experiment_service import ExperimentService


def test_create_experiment_retries_run_code_collision(active_user, db_session, monkeypatch) -> None:
    service = ExperimentService(db_session)
    payload = ExperimentCreate(
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date="2026-04-23",
        objective="Retry create",
    )

    run_codes = iter(["CVD-2026-0001", "CVD-2026-0002"])
    attempts = {"count": 0}

    def fake_next_run_code(_experiment_date):
        return next(run_codes)

    def fake_create(experiment):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise IntegrityError("insert", {}, Exception("duplicate key"))
        experiment.id = active_user.id
        experiment.created_at = datetime.now(UTC)
        experiment.updated_at = datetime.now(UTC)
        return experiment

    monkeypatch.setattr(service.experiments, "next_run_code", fake_next_run_code)
    monkeypatch.setattr(service.experiments, "create", fake_create)
    monkeypatch.setattr(service.audit, "record_event", lambda **_: None)
    monkeypatch.setattr(db_session, "rollback", lambda: None)
    monkeypatch.setattr(db_session, "commit", lambda: None)

    result = service.create_experiment(payload, active_user)

    assert attempts["count"] == 2
    assert result.run_code == "CVD-2026-0002"
