from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.main import app
from app.models.audit import AuditEvent
from app.models.recipe import Recipe

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


def recipe_audit_events(db_session) -> list[AuditEvent]:
    db_session.expire_all()
    statement = select(AuditEvent).where(AuditEvent.entity_type == "recipe")
    return list(db_session.scalars(statement).all())


def recipe_count(db_session) -> int:
    db_session.expire_all()
    return db_session.scalar(select(func.count()).select_from(Recipe)) or 0


def create_recipe_row(
    db_session,
    *,
    created_by,
    name: str,
    material_system: str | None,
    is_active: bool = True,
) -> Recipe:
    recipe = Recipe(
        name=name,
        material_system=material_system,
        default_payload_json={"temperature": 750},
        description=f"{name} description",
        created_by=created_by.id,
        is_active=is_active,
    )
    db_session.add(recipe)
    db_session.commit()
    db_session.refresh(recipe)
    return recipe


def test_admin_creates_recipe_and_writes_audit_event(admin_user, db_session) -> None:
    response = client.post(
        "/api/v1/admin/recipes",
        json={
            "name": "MoS2 baseline",
            "material_system": "MoS2",
            "default_payload_json": {"temperature": 720, "gas": "Ar"},
            "description": "Standard MoS2 growth",
        },
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "MoS2 baseline"
    assert body["material_system"] == "MoS2"
    assert body["default_payload_json"] == {"temperature": 720, "gas": "Ar"}
    assert body["description"] == "Standard MoS2 growth"
    assert body["created_by"] == str(admin_user.id)
    assert body["is_active"] is True

    events = recipe_audit_events(db_session)
    assert len(events) == 1
    event = events[0]
    assert event.action == "create"
    assert str(event.entity_id) == body["id"]
    assert event.before_json is None
    assert event.after_json["name"] == "MoS2 baseline"
    assert event.after_json["created_by"] == str(admin_user.id)


def test_admin_updates_recipe_and_writes_before_after_audit(
    admin_user,
    db_session,
) -> None:
    recipe = create_recipe_row(
        db_session,
        created_by=admin_user,
        name="WS2 baseline",
        material_system="WS2",
    )

    response = client.patch(
        f"/api/v1/admin/recipes/{recipe.id}",
        json={
            "name": "WS2 tuned",
            "default_payload_json": {"temperature": 810, "gas": "Ar+H2"},
            "description": "Tuned WS2 growth",
        },
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "WS2 tuned"
    assert body["default_payload_json"] == {"temperature": 810, "gas": "Ar+H2"}
    assert body["description"] == "Tuned WS2 growth"

    events = recipe_audit_events(db_session)
    assert len(events) == 1
    event = events[0]
    assert event.action == "update"
    assert str(event.entity_id) == str(recipe.id)
    assert event.before_json["name"] == "WS2 baseline"
    assert event.before_json["default_payload_json"] == {"temperature": 750}
    assert event.after_json["name"] == "WS2 tuned"
    assert event.after_json["default_payload_json"] == {"temperature": 810, "gas": "Ar+H2"}


def test_admin_deactivates_recipe_and_public_list_excludes_it(
    admin_user,
    active_user,
    db_session,
) -> None:
    active_recipe = create_recipe_row(
        db_session,
        created_by=admin_user,
        name="MoSe2 active",
        material_system="MoSe2",
    )
    deactivated_recipe = create_recipe_row(
        db_session,
        created_by=admin_user,
        name="MoSe2 old",
        material_system="MoSe2",
    )

    delete_response = client.delete(
        f"/api/v1/admin/recipes/{deactivated_recipe.id}",
        headers=auth_headers(admin_user.email),
    )

    assert delete_response.status_code == 204
    assert delete_response.content == b""

    list_response = client.get(
        "/api/v1/recipes?material_system=MoSe2",
        headers=auth_headers(active_user.email),
    )
    assert list_response.status_code == 200
    ids = {item["id"] for item in list_response.json()["items"]}
    assert str(active_recipe.id) in ids
    assert str(deactivated_recipe.id) not in ids

    events = recipe_audit_events(db_session)
    assert len(events) == 1
    event = events[0]
    assert event.action == "deactivate"
    assert str(event.entity_id) == str(deactivated_recipe.id)
    assert event.before_json["is_active"] is True
    assert event.after_json["is_active"] is False


def test_public_recipe_list_returns_active_recipes_with_material_filter(
    admin_user,
    active_user,
    db_session,
) -> None:
    mos2_recipe = create_recipe_row(
        db_session,
        created_by=admin_user,
        name="MoS2 active",
        material_system="MoS2",
    )
    create_recipe_row(
        db_session,
        created_by=admin_user,
        name="MoS2 inactive",
        material_system="MoS2",
        is_active=False,
    )
    create_recipe_row(
        db_session,
        created_by=admin_user,
        name="WS2 active",
        material_system="WS2",
    )

    response = client.get(
        "/api/v1/recipes?material_system=MoS2",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == str(mos2_recipe.id)
    assert body["items"][0]["material_system"] == "MoS2"
    assert body["items"][0]["is_active"] is True


def test_non_admin_create_returns_403_and_writes_no_recipe_or_audit(
    active_user,
    db_session,
) -> None:
    before_count = recipe_count(db_session)

    response = client.post(
        "/api/v1/admin/recipes",
        json={
            "name": "Unauthorized",
            "material_system": "MoS2",
            "default_payload_json": {},
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 403
    assert recipe_count(db_session) == before_count
    assert recipe_audit_events(db_session) == []


def test_public_get_active_recipe_and_admin_get_inactive_recipe(
    admin_user,
    active_user,
    db_session,
) -> None:
    active_recipe = create_recipe_row(
        db_session,
        created_by=admin_user,
        name="Graphene active",
        material_system="graphene",
    )
    inactive_recipe = create_recipe_row(
        db_session,
        created_by=admin_user,
        name="Graphene inactive",
        material_system="graphene",
        is_active=False,
    )

    active_response = client.get(
        f"/api/v1/recipes/{active_recipe.id}",
        headers=auth_headers(active_user.email),
    )
    inactive_public_response = client.get(
        f"/api/v1/recipes/{inactive_recipe.id}",
        headers=auth_headers(active_user.email),
    )
    inactive_admin_response = client.get(
        f"/api/v1/admin/recipes/{inactive_recipe.id}",
        headers=auth_headers(admin_user.email),
    )

    assert active_response.status_code == 200
    assert active_response.json()["id"] == str(active_recipe.id)
    assert inactive_public_response.status_code == 404
    assert inactive_admin_response.status_code == 200
    assert inactive_admin_response.json()["id"] == str(inactive_recipe.id)
    assert inactive_admin_response.json()["is_active"] is False
