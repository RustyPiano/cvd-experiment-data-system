from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def login(email: str, password: str = "Password123!") -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {login(email)}"}


def create_entry(email: str, **overrides) -> dict:
    payload = {
        "name": "Two-zone fast CVD",
        "institution": "group",
        "apparatus_description": "Two-zone tube furnace",
        "methods_text": "Purge, ramp, growth hold, cool",
        "reference_paper_url": "https://example.com/paper",
    }
    payload.update(overrides)
    response = client.post("/api/v1/setup-library", json=payload, headers=auth_headers(email))
    assert response.status_code == 201, response.text
    return response.json()


def test_create_entry_returns_owner_and_can_edit(active_user) -> None:
    entry = create_entry(active_user.email)
    assert entry["owner_id"] == str(active_user.id)
    assert entry["owner_name"] == active_user.name
    assert entry["can_edit"] is True
    assert entry["visibility"] == "private"
    assert entry["has_diagram"] is False
    assert entry["content_hash"]


def test_viewer_cannot_create_entry(viewer_user) -> None:
    response = client.post(
        "/api/v1/setup-library",
        json={"name": "Nope"},
        headers=auth_headers(viewer_user.email),
    )
    assert response.status_code == 403


def test_private_entry_hidden_from_other_member(active_user, inactive_user, db_session) -> None:
    from app.models.user import User, UserRole

    other = User(
        email="other@example.com",
        name="Other Member",
        password_hash=active_user.password_hash,
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()

    entry = create_entry(active_user.email)

    other_list = client.get("/api/v1/setup-library", headers=auth_headers("other@example.com"))
    assert other_list.status_code == 200
    ids = [item["id"] for item in other_list.json()["items"]]
    assert entry["id"] not in ids

    detail = client.get(
        f"/api/v1/setup-library/{entry['id']}",
        headers=auth_headers("other@example.com"),
    )
    assert detail.status_code == 404


def test_group_entry_visible_and_readonly_for_other_member(active_user, db_session) -> None:
    from app.models.user import User, UserRole

    other = User(
        email="peer@example.com",
        name="Peer Member",
        password_hash=active_user.password_hash,
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()

    entry = create_entry(active_user.email, visibility="group")

    detail = client.get(
        f"/api/v1/setup-library/{entry['id']}",
        headers=auth_headers("peer@example.com"),
    )
    assert detail.status_code == 200
    assert detail.json()["can_edit"] is False

    update = client.patch(
        f"/api/v1/setup-library/{entry['id']}",
        json={"name": "Hijack"},
        headers=auth_headers("peer@example.com"),
    )
    assert update.status_code == 403


def test_admin_can_edit_other_entry(active_user, admin_user) -> None:
    entry = create_entry(active_user.email, visibility="group")
    response = client.patch(
        f"/api/v1/setup-library/{entry['id']}",
        json={"name": "Curated by admin"},
        headers=auth_headers(admin_user.email),
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Curated by admin"


def test_update_changes_content_hash(active_user) -> None:
    entry = create_entry(active_user.email)
    response = client.patch(
        f"/api/v1/setup-library/{entry['id']}",
        json={"methods_text": "New detailed methods"},
        headers=auth_headers(active_user.email),
    )
    assert response.status_code == 200
    assert response.json()["content_hash"] != entry["content_hash"]


def test_upload_and_download_diagram(active_user) -> None:
    entry = create_entry(active_user.email)
    upload = client.post(
        f"/api/v1/setup-library/{entry['id']}/diagram",
        files={"file": ("apparatus.png", b"PNGDATA", "image/png")},
        headers=auth_headers(active_user.email),
    )
    assert upload.status_code == 200, upload.text
    body = upload.json()
    assert body["has_diagram"] is True
    assert body["diagram_original_name"] == "apparatus.png"
    assert body["diagram_download_url"] == f"/api/v1/setup-library/{entry['id']}/diagram"

    download = client.get(
        f"/api/v1/setup-library/{entry['id']}/diagram",
        headers=auth_headers(active_user.email),
    )
    assert download.status_code == 200
    assert download.content == b"PNGDATA"


def test_deactivate_hides_entry(active_user) -> None:
    entry = create_entry(active_user.email)
    delete = client.delete(
        f"/api/v1/setup-library/{entry['id']}",
        headers=auth_headers(active_user.email),
    )
    assert delete.status_code == 204

    listing = client.get("/api/v1/setup-library", headers=auth_headers(active_user.email))
    ids = [item["id"] for item in listing.json()["items"]]
    assert entry["id"] not in ids

    detail = client.get(
        f"/api/v1/setup-library/{entry['id']}",
        headers=auth_headers(active_user.email),
    )
    assert detail.status_code == 404
