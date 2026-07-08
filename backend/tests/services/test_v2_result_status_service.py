from __future__ import annotations

from datetime import date

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.sample import Sample, SampleRole
from app.models.v2_results import CharacterizationRecord, MeasuredProduct
from app.services.v2_result_status_service import refresh_result_missing_todo


def _run(db_session, active_user, *, status: ExperimentStatus) -> ExperimentRun:
    run = ExperimentRun(
        run_code=f"RUN-{status.value.upper()}",
        owner_id=active_user.id,
        experiment_type="CVD",
        experiment_date=date(2026, 7, 8),
        status=status,
    )
    db_session.add(run)
    db_session.flush()
    return run


def _sample(db_session, run: ExperimentRun) -> Sample:
    sample = Sample(
        sample_code=f"S-{run.run_code}",
        experiment_run_id=run.id,
        role=SampleRole.PRODUCT,
    )
    db_session.add(sample)
    db_session.flush()
    return sample


def test_locked_run_without_phenomena_or_characterization_is_marked_missing(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user, status=ExperimentStatus.LOCKED)

    assert refresh_result_missing_todo(db_session, run) is True
    assert run.result_missing_todo is True


def test_non_terminal_run_is_not_marked_missing(db_session, active_user) -> None:
    run = _run(db_session, active_user, status=ExperimentStatus.SUBMITTED)

    assert refresh_result_missing_todo(db_session, run) is False
    assert run.result_missing_todo is False


def test_characterization_or_observed_phenomena_clears_missing_flag(
    db_session, active_user
) -> None:
    run = _run(db_session, active_user, status=ExperimentStatus.LOCKED)
    sample = _sample(db_session, run)
    db_session.add(CharacterizationRecord(experiment_run_id=run.id, sample_id=sample.id))
    db_session.commit()

    assert refresh_result_missing_todo(db_session, run) is False
    assert run.result_missing_todo is False

    db_session.delete(db_session.query(CharacterizationRecord).one())
    db_session.add(MeasuredProduct(sample_id=sample.id, observed_phenomena=["未表征"]))
    db_session.commit()

    assert refresh_result_missing_todo(db_session, run) is False
    assert run.result_missing_todo is False
