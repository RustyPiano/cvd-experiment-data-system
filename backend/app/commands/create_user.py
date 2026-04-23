import argparse
import getpass
import sys

from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create a user account.")
    parser.add_argument("--email", required=True, help="User login email")
    parser.add_argument("--name", required=True, help="User display name")
    parser.add_argument(
        "--role",
        required=True,
        choices=[role.value for role in UserRole],
        help="User role",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    password = getpass.getpass("Password: ")
    confirmation = getpass.getpass("Confirm password: ")

    if not password.strip():
        print("Password cannot be empty.", file=sys.stderr)
        return 1
    if password != confirmation:
        print("Passwords do not match.", file=sys.stderr)
        return 1

    db: Session = SessionLocal()
    try:
        users = UserRepository(db)
        if users.get_by_email(args.email) is not None:
            print("User with this email already exists.", file=sys.stderr)
            return 1

        role = UserRole(args.role)
        user = User(
            email=args.email,
            name=args.name,
            password_hash=get_password_hash(password),
            role=role,
            is_active=True,
        )
        db.add(user)
        db.commit()
    finally:
        db.close()

    print(f"Created {role.value} user {args.email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
