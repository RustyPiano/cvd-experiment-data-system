from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool

from app.db import session as db_session_module
from app.main import app


def test_file_sqlite_handles_concurrent_authenticated_reads(active_user) -> None:
    assert not isinstance(db_session_module.engine.pool, StaticPool)
    with db_session_module.engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA journal_mode").scalar() == "wal"
        assert connection.exec_driver_sql("PRAGMA busy_timeout").scalar() == 5000

    with TestClient(app, raise_server_exceptions=False) as client:
        login = client.post(
            "/api/v1/auth/login",
            json={"email": active_user.email, "password": "Password123!"},
        )
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        created = client.post(
            "/api/v1/experiments",
            json={
                "started_at": "2026-07-12T00:05:00",
                "synthesis_method": "CVD",
                "operator": "并发测试",
                "chemical_formula": "MoS2",
            },
            headers=headers,
        )
        assert created.status_code == 201, created.text
        run_id = created.json()["id"]
        paths = [
            f"/api/v1/experiments/{run_id}",
            f"/api/v1/experiments/{run_id}/modules/basic_info",
            f"/api/v1/experiments/{run_id}/modules/target_product",
        ] * 16

        with ThreadPoolExecutor(max_workers=16) as pool:
            responses = list(pool.map(lambda path: client.get(path, headers=headers), paths))

    statuses = [response.status_code for response in responses]
    assert statuses == [200] * len(paths), statuses
