import importlib

import pytest

from app.repositories.user_repository import UserRepository


def load_create_user_main():
    try:
        module = importlib.import_module("app.commands.create_user")
    except ModuleNotFoundError as exc:  # pragma: no cover - exercised during TDD red phase
        pytest.fail(f"create_user command module missing: {exc}")
    return module.main


@pytest.mark.parametrize(
    ("role", "expected_role"),
    [
        ("admin", "admin"),
        ("member", "member"),
        ("viewer", "viewer"),
    ],
)
def test_create_user_creates_supported_roles(
    monkeypatch,
    db_session,
    capsys,
    role: str,
    expected_role: str,
) -> None:
    prompts = iter(["Password123!", "Password123!"])
    monkeypatch.setattr("getpass.getpass", lambda _: next(prompts))

    exit_code = load_create_user_main()(
        [
            "--email",
            f"{role}@example.com",
            "--name",
            f"{role.title()} User",
            "--role",
            role,
        ]
    )

    captured = capsys.readouterr()
    created_user = UserRepository(db_session).get_by_email(f"{role}@example.com")

    assert exit_code == 0
    assert f"Created {role} user {role}@example.com" in captured.out
    assert created_user is not None
    assert created_user.role.value == expected_role
    assert created_user.is_active is True


def test_create_user_rejects_duplicate_email(monkeypatch, active_user, capsys) -> None:
    prompts = iter(["Password123!", "Password123!"])
    monkeypatch.setattr("getpass.getpass", lambda _: next(prompts))

    exit_code = load_create_user_main()(
        [
            "--email",
            active_user.email,
            "--name",
            "Duplicated User",
            "--role",
            "member",
        ]
    )

    captured = capsys.readouterr()

    assert exit_code == 1
    assert "User with this email already exists." in captured.err


def test_create_user_rejects_blank_password(monkeypatch, capsys) -> None:
    prompts = iter(["   ", "   "])
    monkeypatch.setattr("getpass.getpass", lambda _: next(prompts))

    exit_code = load_create_user_main()(
        [
            "--email",
            "blank@example.com",
            "--name",
            "Blank Password",
            "--role",
            "member",
        ]
    )

    captured = capsys.readouterr()

    assert exit_code == 1
    assert "Password cannot be empty." in captured.err


def test_create_user_rejects_mismatched_password_confirmation(monkeypatch, capsys) -> None:
    prompts = iter(["Password123!", "Password123?"])
    monkeypatch.setattr("getpass.getpass", lambda _: next(prompts))

    exit_code = load_create_user_main()(
        [
            "--email",
            "mismatch@example.com",
            "--name",
            "Mismatch User",
            "--role",
            "member",
        ]
    )

    captured = capsys.readouterr()

    assert exit_code == 1
    assert "Passwords do not match." in captured.err
