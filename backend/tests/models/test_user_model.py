from app.models.user import User, UserRole


def test_user_role_column_uses_lowercase_enum_values() -> None:
    role_type = User.__table__.c.role.type

    assert role_type.enums == [role.value for role in UserRole]
