import importlib

import pytest

from app.core.security import verify_password
from app.repositories.user_repository import UserRepository


def load_reset_password_main():
    try:
        module = importlib.import_module("app.commands.reset_password")
    except ModuleNotFoundError as exc:  # pragma: no cover - exercised during TDD red phase
        pytest.fail(f"reset_password command module missing: {exc}")
    return module.main


def test_reset_password_updates_existing_user_hash(
    monkeypatch,
    active_user,
    db_session,
    capsys,
) -> None:
    prompts = iter(["UpdatedPassword123!", "UpdatedPassword123!"])
    monkeypatch.setattr("getpass.getpass", lambda _: next(prompts))

    exit_code = load_reset_password_main()(["--email", active_user.email])

    captured = capsys.readouterr()
    db_session.expire_all()
    updated_user = UserRepository(db_session).get_by_email(active_user.email)

    assert exit_code == 0
    assert f"Password reset for {active_user.email}" in captured.out
    assert updated_user is not None
    assert verify_password("UpdatedPassword123!", updated_user.password_hash) is True
    assert verify_password("Password123!", updated_user.password_hash) is False


def test_reset_password_rejects_unknown_email(monkeypatch, capsys) -> None:
    prompts = iter(["UpdatedPassword123!", "UpdatedPassword123!"])
    monkeypatch.setattr("getpass.getpass", lambda _: next(prompts))

    exit_code = load_reset_password_main()(["--email", "missing@example.com"])

    captured = capsys.readouterr()

    assert exit_code == 1
    assert "User with this email does not exist." in captured.err


def test_reset_password_rejects_blank_password(monkeypatch, active_user, capsys) -> None:
    prompts = iter(["", ""])
    monkeypatch.setattr("getpass.getpass", lambda _: next(prompts))

    exit_code = load_reset_password_main()(["--email", active_user.email])

    captured = capsys.readouterr()

    assert exit_code == 1
    assert "Password cannot be empty." in captured.err


def test_reset_password_rejects_mismatched_password_confirmation(
    monkeypatch,
    active_user,
    capsys,
) -> None:
    prompts = iter(["UpdatedPassword123!", "UpdatedPassword456!"])
    monkeypatch.setattr("getpass.getpass", lambda _: next(prompts))

    exit_code = load_reset_password_main()(["--email", active_user.email])

    captured = capsys.readouterr()

    assert exit_code == 1
    assert "Passwords do not match." in captured.err
