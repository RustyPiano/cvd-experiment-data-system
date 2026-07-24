from concurrent.futures import ThreadPoolExecutor
from time import sleep
from unittest.mock import Mock
from uuid import uuid4

from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.repositories.experiment_repository import ExperimentRepository


def test_get_by_id_for_update_uses_postgres_row_lock_and_refreshes_state() -> None:
    db = Mock()
    repository = ExperimentRepository(db)

    repository.get_by_id_for_update(uuid4())

    statement = db.scalar.call_args.args[0]
    sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in sql
    assert statement.get_execution_options()["populate_existing"] is True


def test_sqlite_run_lock_serializes_writers(active_user, db_session) -> None:
    run = ExperimentRun(
        run_code="CVD-2026-9901",
        owner_id=active_user.id,
        schema_version="cvd_v2",
        experiment_date=active_user.created_at.date(),
        status=ExperimentStatus.DRAFT,
    )
    db_session.add(run)
    db_session.commit()

    first = Session(db_session.bind)
    first_run = ExperimentRepository(first).get_by_id_for_update(run.id)
    assert first_run is not None

    def read_after_lock() -> ExperimentStatus:
        with Session(db_session.bind) as second:
            second_run = ExperimentRepository(second).get_by_id_for_update(run.id)
            assert second_run is not None
            return second_run.status

    with ThreadPoolExecutor(max_workers=1) as pool:
        waiting = pool.submit(read_after_lock)
        sleep(0.05)
        assert not waiting.done()
        first_run.status = ExperimentStatus.LOCKED
        first.commit()
        assert waiting.result(timeout=2) == ExperimentStatus.LOCKED
    first.close()
