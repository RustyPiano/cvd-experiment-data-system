from unittest.mock import Mock
from uuid import uuid4

from sqlalchemy.dialects import postgresql

from app.repositories.experiment_repository import ExperimentRepository


def test_get_by_id_for_update_uses_postgres_row_lock_and_refreshes_state() -> None:
    db = Mock()
    repository = ExperimentRepository(db)

    repository.get_by_id_for_update(uuid4())

    statement = db.scalar.call_args.args[0]
    sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in sql
    assert statement.get_execution_options()["populate_existing"] is True
