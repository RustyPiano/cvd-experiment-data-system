from datetime import date
from types import MethodType

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models.experiment import ExperimentRun
from app.schemas.sample import ControlSampleCreate
from app.services.sample_service import SampleService


def test_sample_code_integrity_conflict_rolls_back_and_returns_409(
    active_user, db_session, monkeypatch
) -> None:
    service = SampleService(db_session)
    run = ExperimentRun(
        run_code="CVD-2026-7001",
        owner_id=active_user.id,
        schema_version="cvd_v2",
        experiment_date=date(2026, 7, 11),
    )
    db_session.add(run)
    db_session.commit()
    rollback_calls = 0
    real_rollback = db_session.rollback

    def track_rollback(_self) -> None:
        nonlocal rollback_calls
        rollback_calls += 1
        real_rollback()

    monkeypatch.setattr(db_session, "rollback", MethodType(track_rollback, db_session))

    def conflict(_sample):
        raise IntegrityError("unique sample_code", {}, Exception("sample_code"))

    monkeypatch.setattr(service.samples, "create", conflict)

    with pytest.raises(HTTPException) as exc_info:
        service.create_sample(run.id, ControlSampleCreate(), active_user)

    assert exc_info.value.status_code == 409
    assert rollback_calls == 1
