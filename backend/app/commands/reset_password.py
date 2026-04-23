import argparse
import getpass
import sys

from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.repositories.user_repository import UserRepository


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Reset a user password.")
    parser.add_argument("--email", required=True, help="User login email")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    password = getpass.getpass("New password: ")
    confirmation = getpass.getpass("Confirm new password: ")

    if not password.strip():
        print("Password cannot be empty.", file=sys.stderr)
        return 1
    if password != confirmation:
        print("Passwords do not match.", file=sys.stderr)
        return 1

    db: Session = SessionLocal()
    try:
        users = UserRepository(db)
        user = users.get_by_email(args.email)
        if user is None:
            print("User with this email does not exist.", file=sys.stderr)
            return 1

        user.password_hash = get_password_hash(password)
        db.add(user)
        db.commit()
    finally:
        db.close()

    print(f"Password reset for {args.email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
