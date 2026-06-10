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


def controlled_vocabulary_audit_events(db_session) -> list[AuditEvent]:
    db_session.expire_all()
    statement = select(AuditEvent).where(
        AuditEvent.entity_type == "controlled_vocabulary",
    )
    return list(db_session.scalars(statement).all())


def test_list_vocabularies_returns_seeded_active_entries(active_user) -> None:
    response = client.get(
        "/api/v1/vocabularies?vocab_key=material_system",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    values = {item["value"] for item in body["items"]}
    assert {"MoS2", "WS2", "graphene"} <= values
    assert all(item["is_active"] is True for item in body["items"])


def test_mvp_0_2_required_vocabulary_keys_are_seeded(active_user) -> None:
    expected_values_by_key = {
        "material_system": {"MoS2", "WS2", "MoSe2", "WSe2", "hBN", "graphene", "other"},
        "sample_env": {"clean", "normal", "contaminated", "unknown"},
        "precursor_method": {"melting", "spin_coating", "powder", "solution", "other"},
        "substrate_type": {
            "硅片单抛N<100>",
            "蓝宝石单抛<0001>/<11-20>",
            "蓝宝石单抛<10-10>/<0001>",
            "蓝宝石单抛<11-20>/<0001>",
            "蓝宝石双抛C<0001>",
            "蓝宝石双抛A<11-20>",
            "蓝宝石双抛M<10-10>",
        },
        "substrate_brand": {"华赫硅材料", "合肥科晶", "苏州研材微纳科技"},
        "substrate_size": {"5x5", "5x8", "5x10", "10x10"},
        "substrate_treatment_method": {
            "none",
            "plasma_cleaning",
            "uv_cleaning",
            "annealing",
        },
        "gas_label": {"Ar", "CO2", "O2", "Ar+H2", "Ar+O2", "H2+CO2", "CO+Ar", "air"},
        "characterization_method": {"OM", "Raman", "PL", "AFM", "SEM", "Other"},
        "quality_label": {"success", "partial", "failed", "unknown"},
    }

    for vocab_key, expected_values in expected_values_by_key.items():
        response = client.get(
            f"/api/v1/vocabularies?vocab_key={vocab_key}",
            headers=auth_headers(active_user.email),
        )

        assert response.status_code == 200
        body = response.json()
        values = {item["value"] for item in body["items"]}
        if vocab_key == "gas_label":
            assert values == expected_values
        else:
            assert expected_values <= values
            assert body["total"] >= len(expected_values)
        assert all(item["is_active"] is True for item in body["items"])


def test_admin_can_create_and_update_vocabulary_entry(admin_user) -> None:
    create_response = client.post(
        "/api/v1/admin/vocabularies",
        json={
            "vocab_key": "substrate_type",
            "value": "mica",
            "label_zh": "云母",
            "label_en": "Mica",
            "sort_order": 99,
        },
        headers=auth_headers(admin_user.email),
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["vocab_key"] == "substrate_type"
    assert created["value"] == "mica"
    assert created["is_active"] is True

    update_response = client.patch(
        f"/api/v1/admin/vocabularies/{created['id']}",
        json={
            "label_zh": "石英片",
            "is_active": False,
            "sort_order": 5,
        },
        headers=auth_headers(admin_user.email),
    )

    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["label_zh"] == "石英片"
    assert updated["is_active"] is False
    assert updated["sort_order"] == 5

    admin_list_response = client.get(
        "/api/v1/admin/vocabularies?vocab_key=substrate_type",
        headers=auth_headers(admin_user.email),
    )
    assert admin_list_response.status_code == 200
    values = {item["value"] for item in admin_list_response.json()["items"]}
    assert "mica" in values


def test_vocabulary_create_and_update_write_audit_events(
    admin_user,
    active_user,
    db_session,
) -> None:
    create_response = client.post(
        "/api/v1/admin/vocabularies",
        json={
            "vocab_key": "substrate_type",
            "value": "mica",
            "label_zh": "云母",
            "label_en": "Mica",
            "sort_order": 99,
            "metadata_json": {"source": "lab"},
        },
        headers=auth_headers(admin_user.email),
    )

    assert create_response.status_code == 201
    created = create_response.json()

    create_events = controlled_vocabulary_audit_events(db_session)
    assert len(create_events) == 1
    create_event = create_events[0]
    assert create_event.entity_type == "controlled_vocabulary"
    assert str(create_event.entity_id) == created["id"]
    assert create_event.action == "create"
    assert create_event.before_json is None
    assert create_event.after_json["value"] == "mica"
    assert create_event.after_json["metadata_json"] == {"source": "lab"}

    update_response = client.patch(
        f"/api/v1/admin/vocabularies/{created['id']}",
        json={
            "label_zh": "云母片",
            "is_active": False,
            "sort_order": 5,
        },
        headers=auth_headers(admin_user.email),
    )

    assert update_response.status_code == 200
    events_by_action = {
        event.action: event for event in controlled_vocabulary_audit_events(db_session)
    }
    assert set(events_by_action) == {"create", "update"}
    update_event = events_by_action["update"]
    assert update_event.entity_type == "controlled_vocabulary"
    assert str(update_event.entity_id) == created["id"]
    assert update_event.before_json["label_zh"] == "云母"
    assert update_event.before_json["is_active"] is True
    assert update_event.after_json["label_zh"] == "云母片"
    assert update_event.after_json["is_active"] is False
    assert update_event.after_json["sort_order"] == 5

    forbidden_response = client.post(
        "/api/v1/admin/vocabularies",
        json={
            "vocab_key": "gas_label",
            "value": "N2",
            "label_zh": "氮气",
            "label_en": "Nitrogen",
            "sort_order": 10,
        },
        headers=auth_headers(active_user.email),
    )

    assert forbidden_response.status_code == 403
    assert len(controlled_vocabulary_audit_events(db_session)) == 2


def test_update_vocabulary_rejects_duplicate_value(admin_user) -> None:
    first_response = client.post(
        "/api/v1/admin/vocabularies",
        json={
            "vocab_key": "substrate_type",
            "value": "quartz-a",
            "label_zh": "石英A",
            "label_en": "Quartz A",
            "sort_order": 10,
        },
        headers=auth_headers(admin_user.email),
    )
    second_response = client.post(
        "/api/v1/admin/vocabularies",
        json={
            "vocab_key": "substrate_type",
            "value": "quartz-b",
            "label_zh": "石英B",
            "label_en": "Quartz B",
            "sort_order": 11,
        },
        headers=auth_headers(admin_user.email),
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 201

    update_response = client.patch(
        f"/api/v1/admin/vocabularies/{second_response.json()['id']}",
        json={"value": "quartz-a"},
        headers=auth_headers(admin_user.email),
    )

    assert update_response.status_code == 409
    assert update_response.json()["detail"] == "Vocabulary entry already exists"


def test_user_can_add_brand_value_to_shared_list(active_user) -> None:
    response = client.post(
        "/api/v1/vocabularies",
        json={"vocab_key": "precursor_brand", "value": "新品牌X"},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 201
    created = response.json()
    assert created["vocab_key"] == "precursor_brand"
    assert created["value"] == "新品牌X"
    assert created["label_zh"] == "新品牌X"
    assert created["is_active"] is True
    assert created["metadata_json"]["source"] == "user"

    list_response = client.get(
        "/api/v1/vocabularies?vocab_key=precursor_brand",
        headers=auth_headers(active_user.email),
    )
    values = {item["value"] for item in list_response.json()["items"]}
    assert "新品牌X" in values


def test_user_add_brand_value_is_idempotent(active_user) -> None:
    payload = {"vocab_key": "substrate_brand", "value": "重复品牌"}
    first = client.post(
        "/api/v1/vocabularies",
        json=payload,
        headers=auth_headers(active_user.email),
    )
    second = client.post(
        "/api/v1/vocabularies",
        json={"vocab_key": "substrate_brand", "value": "  重复品牌  "},
        headers=auth_headers(active_user.email),
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]

    list_response = client.get(
        "/api/v1/vocabularies?vocab_key=substrate_brand",
        headers=auth_headers(active_user.email),
    )
    matches = [
        item
        for item in list_response.json()["items"]
        if item["value"] == "重复品牌"
    ]
    assert len(matches) == 1


def test_user_revalue_reactivation_writes_audit_event(
    admin_user,
    active_user,
    db_session,
) -> None:
    """重新激活一个被停用的词条也应留审计痕迹（与其它变更一致）。"""
    added = client.post(
        "/api/v1/vocabularies",
        json={"vocab_key": "substrate_brand", "value": "停用再启用品牌"},
        headers=auth_headers(active_user.email),
    )
    assert added.status_code == 201
    vocab_id = added.json()["id"]

    deactivate = client.patch(
        f"/api/v1/admin/vocabularies/{vocab_id}",
        json={"is_active": False},
        headers=auth_headers(admin_user.email),
    )
    assert deactivate.status_code == 200

    def event_count() -> int:
        return len(
            [
                event
                for event in controlled_vocabulary_audit_events(db_session)
                if str(event.entity_id) == vocab_id
            ]
        )

    before = event_count()

    reactivated = client.post(
        "/api/v1/vocabularies",
        json={"vocab_key": "substrate_brand", "value": "停用再启用品牌"},
        headers=auth_headers(active_user.email),
    )
    assert reactivated.status_code == 201
    assert reactivated.json()["is_active"] is True
    assert event_count() == before + 1


def test_user_cannot_extend_non_whitelisted_vocabulary(active_user) -> None:
    response = client.post(
        "/api/v1/vocabularies",
        json={"vocab_key": "material_system", "value": "FakeMaterial"},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 403


def test_viewer_cannot_add_brand_value(viewer_user, db_session) -> None:
    response = client.post(
        "/api/v1/vocabularies",
        json={"vocab_key": "precursor_brand", "value": "只读用户品牌"},
        headers=auth_headers(viewer_user.email),
    )

    assert response.status_code == 403
    list_response = client.get(
        "/api/v1/vocabularies?vocab_key=precursor_brand",
        headers=auth_headers(viewer_user.email),
    )
    values = {item["value"] for item in list_response.json()["items"]}
    assert "只读用户品牌" not in values


def test_non_admin_cannot_mutate_vocabulary_entries(active_user) -> None:
    response = client.post(
        "/api/v1/admin/vocabularies",
        json={
            "vocab_key": "gas_label",
            "value": "N2",
            "label_zh": "氮气",
            "label_en": "Nitrogen",
            "sort_order": 10,
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 403
