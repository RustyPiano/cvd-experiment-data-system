from concurrent.futures import ThreadPoolExecutor
from time import sleep
from unittest.mock import Mock
from uuid import uuid4

from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.models.file_asset import FileAsset
from app.repositories.file_asset_repository import FileAssetRepository


def test_get_by_id_for_update_uses_postgres_row_lock_and_refreshes_state() -> None:
    db = Mock()

    FileAssetRepository(db).get_by_id_for_update(uuid4())

    statement = db.scalar.call_args.args[0]
    sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in sql
    assert statement.get_execution_options()["populate_existing"] is True


def test_sqlite_file_lock_serializes_writers(active_user, db_session) -> None:
    asset = FileAsset(
        uploaded_by_id=active_user.id,
        original_name="evidence.txt",
        storage_path=f"test/{uuid4()}_evidence.txt",
        size_bytes=1,
        sha256="a" * 64,
        method="entity_reference",
        file_category="raw",
        asset_role="entity_attachment",
        file_kind="entity_reference",
        metadata_json={},
    )
    db_session.add(asset)
    db_session.commit()

    first = Session(db_session.bind)
    first_asset = FileAssetRepository(first).get_by_id_for_update(asset.id)
    assert first_asset is not None

    def read_after_lock() -> str | None:
        with Session(db_session.bind) as second:
            second_asset = FileAssetRepository(second).get_by_id_for_update(asset.id)
            assert second_asset is not None
            return second_asset.note

    with ThreadPoolExecutor(max_workers=1) as pool:
        waiting = pool.submit(read_after_lock)
        sleep(0.05)
        assert not waiting.done()
        first_asset.note = "bound"
        first.commit()
        assert waiting.result(timeout=2) == "bound"
    first.close()
