from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models.audit import AuditEvent

client = TestClient(app)


def login(email: str, password: str = "Password123!") -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {login(email)}"}


def field_definition_audit_events(db_session) -> list[AuditEvent]:
    db_session.expire_all()
    statement = select(AuditEvent).where(
        AuditEvent.entity_type == "field_definition",
    )
    return list(db_session.scalars(statement).all())


def test_admin_creates_field_definition(admin_user, db_session) -> None:
    response = client.post(
        "/api/v1/admin/field-definitions",
        json={
            "field_key": "test_field",
            "module_key": "basic_info",
            "label_zh": "测试字段",
            "label_en": "Test Field",
            "field_type": "text",
            "required": False,
            "inheritable": True,
            "sort_order": 99,
        },
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["field_key"] == "test_field"
    assert body["module_key"] == "basic_info"
    assert body["label_zh"] == "测试字段"
    assert body["label_en"] == "Test Field"
    assert body["field_type"] == "text"
    assert body["required"] is False
    assert body["inheritable"] is True
    assert body["is_active"] is True

    events = field_definition_audit_events(db_session)
    assert len(events) == 1
    assert events[0].action == "create"
    assert str(events[0].entity_id) == body["id"]


def test_admin_updates_field_definition(admin_user, db_session) -> None:
    create_response = client.post(
        "/api/v1/admin/field-definitions",
        json={
            "field_key": "updateable_field",
            "module_key": "basic_info",
            "label_zh": "可更新字段",
            "field_type": "text",
            "sort_order": 50,
        },
        headers=auth_headers(admin_user.email),
    )

    assert create_response.status_code == 201
    field_id = create_response.json()["id"]

    update_response = client.patch(
        f"/api/v1/admin/field-definitions/{field_id}",
        json={
            "label_zh": "已更新字段",
            "label_en": "Updated Field",
            "required": True,
        },
        headers=auth_headers(admin_user.email),
    )

    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["label_zh"] == "已更新字段"
    assert updated["label_en"] == "Updated Field"
    assert updated["required"] is True


def test_admin_deactivates_field_definition(admin_user, db_session) -> None:
    create_response = client.post(
        "/api/v1/admin/field-definitions",
        json={
            "field_key": "deactivatable_field",
            "module_key": "basic_info",
            "label_zh": "可停用字段",
            "field_type": "text",
            "sort_order": 60,
        },
        headers=auth_headers(admin_user.email),
    )

    assert create_response.status_code == 201
    field_id = create_response.json()["id"]

    deactivate_response = client.post(
        f"/api/v1/admin/field-definitions/{field_id}/deactivate",
        headers=auth_headers(admin_user.email),
    )

    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["is_active"] is False

    events = field_definition_audit_events(db_session)
    deactivate_event = [e for e in events if e.action == "deactivate"]
    assert len(deactivate_event) == 1
    assert deactivate_event[0].before_json["is_active"] is True
    assert deactivate_event[0].after_json["is_active"] is False


def test_admin_reactivates_field_definition(admin_user, db_session) -> None:
    create_response = client.post(
        "/api/v1/admin/field-definitions",
        json={
            "field_key": "reactivable_field",
            "module_key": "basic_info",
            "label_zh": "可重新启用字段",
            "field_type": "text",
            "sort_order": 70,
        },
        headers=auth_headers(admin_user.email),
    )

    field_id = create_response.json()["id"]

    client.post(
        f"/api/v1/admin/field-definitions/{field_id}/deactivate",
        headers=auth_headers(admin_user.email),
    )

    reactivate_response = client.post(
        f"/api/v1/admin/field-definitions/{field_id}/reactivate",
        headers=auth_headers(admin_user.email),
    )

    assert reactivate_response.status_code == 200
    assert reactivate_response.json()["is_active"] is True

    events = field_definition_audit_events(db_session)
    reactivate_event = [e for e in events if e.action == "reactivate"]
    assert len(reactivate_event) == 1
    assert reactivate_event[0].before_json["is_active"] is False
    assert reactivate_event[0].after_json["is_active"] is True


def test_duplicate_module_key_field_key_returns_409(admin_user) -> None:
    payload = {
        "field_key": "unique_test_field",
        "module_key": "basic_info",
        "label_zh": "唯一测试字段",
        "field_type": "text",
        "sort_order": 80,
    }

    first_response = client.post(
        "/api/v1/admin/field-definitions",
        json=payload,
        headers=auth_headers(admin_user.email),
    )
    assert first_response.status_code == 201

    second_response = client.post(
        "/api/v1/admin/field-definitions",
        json=payload,
        headers=auth_headers(admin_user.email),
    )
    assert second_response.status_code == 409
    assert second_response.json()["detail"] == "Field definition already exists"


def test_public_lists_active_field_definitions_with_module_key_filter(
    admin_user,
    active_user,
    db_session,
) -> None:
    client.post(
        "/api/v1/admin/field-definitions",
        json={
            "field_key": "env_test_field",
            "module_key": "environment",
            "label_zh": "环境测试字段",
            "field_type": "text",
            "sort_order": 10,
        },
        headers=auth_headers(admin_user.email),
    )
    client.post(
        "/api/v1/admin/field-definitions",
        json={
            "field_key": "basic_test_field",
            "module_key": "basic_info",
            "label_zh": "基本信息测试字段",
            "field_type": "text",
            "sort_order": 11,
        },
        headers=auth_headers(admin_user.email),
    )

    response = client.get(
        "/api/v1/field-definitions?module_key=environment",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert all(item["module_key"] == "environment" for item in body["items"])
    assert all(item["is_active"] is True for item in body["items"])


def test_non_admin_cannot_create_field_definition(active_user) -> None:
    response = client.post(
        "/api/v1/admin/field-definitions",
        json={
            "field_key": "forbidden_field",
            "module_key": "basic_info",
            "label_zh": "禁止字段",
            "field_type": "text",
            "sort_order": 90,
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 403


def test_get_single_field_definition_by_id(admin_user, active_user) -> None:
    create_response = client.post(
        "/api/v1/admin/field-definitions",
        json={
            "field_key": "gettable_field",
            "module_key": "basic_info",
            "label_zh": "可获取字段",
            "field_type": "text",
            "sort_order": 100,
        },
        headers=auth_headers(admin_user.email),
    )
    field_id = create_response.json()["id"]

    get_response = client.get(
        f"/api/v1/field-definitions/{field_id}",
        headers=auth_headers(active_user.email),
    )

    assert get_response.status_code == 200
    assert get_response.json()["id"] == field_id
    assert get_response.json()["field_key"] == "gettable_field"
