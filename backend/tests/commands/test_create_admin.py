from app.commands.create_admin import main
from app.repositories.user_repository import UserRepository


def test_create_admin_creates_admin_user(monkeypatch, db_session, capsys) -> None:
    prompts = iter(["Password123!", "Password123!"])
    monkeypatch.setattr("getpass.getpass", lambda _: next(prompts))

    exit_code = main(["--email", "admin@example.com", "--name", "Admin User"])

    captured = capsys.readouterr()
    created_user = UserRepository(db_session).get_by_email("admin@example.com")

    assert exit_code == 0
    assert "Created admin user admin@example.com" in captured.out
    assert created_user is not None
    assert created_user.role.value == "admin"
    assert created_user.is_active is True


def test_create_admin_rejects_duplicate_email(monkeypatch, active_user, capsys) -> None:
    prompts = iter(["Password123!", "Password123!"])
    monkeypatch.setattr("getpass.getpass", lambda _: next(prompts))

    exit_code = main(["--email", active_user.email, "--name", "Duplicated User"])

    captured = capsys.readouterr()

    assert exit_code == 1
    assert "User with this email already exists." in captured.err


def test_create_admin_rejects_blank_password(monkeypatch, db_session, capsys) -> None:
    prompts = iter(["   ", "   "])
    monkeypatch.setattr("getpass.getpass", lambda _: next(prompts))

    exit_code = main(["--email", "blank-admin@example.com", "--name", "Blank Admin"])

    captured = capsys.readouterr()
    assert exit_code == 1
    assert "Password cannot be blank." in captured.err
    assert UserRepository(db_session).get_by_email("blank-admin@example.com") is None


def test_create_admin_rejects_blank_identity_and_weak_password(monkeypatch, capsys) -> None:
    for email, name, password in (
        (" ", "Admin", "Password123!"),
        ("admin@example.com", " ", "Password123!"),
        ("admin@example.com", "Admin", "short"),
        ("admin@example.com", "Admin", "x" * 129),
    ):
        prompts = iter([password, password])
        monkeypatch.setattr("getpass.getpass", lambda _, prompts=prompts: next(prompts))

        assert main(["--email", email, "--name", name]) == 1

    assert "must" in capsys.readouterr().err.lower()
