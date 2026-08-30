import pytest
from conftest import _assert_safe_postgresql_test_database


def test_postgresql_reset_requires_explicit_test_environment_and_database(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("ALLOW_POSTGRES_TEST_RESET", "1")
    _assert_safe_postgresql_test_database(
        "postgresql+psycopg://user:password@localhost/cvd_test_smoke"
    )

    with pytest.raises(RuntimeError, match="cvd_test"):
        _assert_safe_postgresql_test_database("postgresql+psycopg://user:password@localhost/cvd")
    with pytest.raises(RuntimeError, match="cvd_test"):
        _assert_safe_postgresql_test_database(
            "postgresql+psycopg://user:password@localhost/contest"
        )
    with pytest.raises(RuntimeError, match="cvd_test"):
        _assert_safe_postgresql_test_database(
            "postgresql+psycopg://user:password@localhost/prod_test_backup"
        )
    with pytest.raises(RuntimeError, match="cvd_test"):
        _assert_safe_postgresql_test_database(
            "postgresql+psycopg://user:password@localhost/test_production"
        )

    monkeypatch.delenv("ALLOW_POSTGRES_TEST_RESET")
    with pytest.raises(RuntimeError, match="ALLOW_POSTGRES_TEST_RESET=1"):
        _assert_safe_postgresql_test_database(
            "postgresql+psycopg://user:password@localhost/cvd_test"
        )

    monkeypatch.setenv("ALLOW_POSTGRES_TEST_RESET", "1")
    monkeypatch.delenv("APP_ENV")
    with pytest.raises(RuntimeError, match="APP_ENV=test"):
        _assert_safe_postgresql_test_database(
            "postgresql+psycopg://user:password@localhost/cvd_test"
        )

    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(RuntimeError, match="APP_ENV=test"):
        _assert_safe_postgresql_test_database(
            "postgresql+psycopg://user:password@localhost/cvd_test"
        )
