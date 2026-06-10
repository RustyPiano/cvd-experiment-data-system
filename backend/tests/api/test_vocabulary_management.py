"""M4 — 词表管理增强（排序 / 分组编辑）契约 + 权限测试.

在已有 admin create/update/list 之上补：
- 排序（reorder）：按给定顺序重排同一 vocab_key 的 sort_order。
- 分组编辑（group upsert）：把成员归入分组并赋予一致的分组标签/排序（保证
  同一 (vocab_key, group_key) 标签一致，与 M1 的 T1.5 守卫同口径）。
- PATCH 分组成员：置 null 清除分组；置已存在分组则继承其标签（一致性）。
仅 ADMIN 可执行。
"""

from fastapi.testclient import TestClient

from app.main import app

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


def create_entry(admin_email: str, vocab_key: str, value: str, **extra) -> dict:
    response = client.post(
        "/api/v1/admin/vocabularies",
        json={"vocab_key": vocab_key, "value": value, "label_zh": value, **extra},
        headers=auth_headers(admin_email),
    )
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# Reorder
# ---------------------------------------------------------------------------


def test_t4_1_admin_reorder_sets_sort_order_by_position(admin_user) -> None:
    a = create_entry(admin_user.email, "mgmt_reorder", "a", sort_order=0)
    b = create_entry(admin_user.email, "mgmt_reorder", "b", sort_order=1)
    c = create_entry(admin_user.email, "mgmt_reorder", "c", sort_order=2)

    response = client.post(
        "/api/v1/admin/vocabularies/reorder",
        json={"vocab_key": "mgmt_reorder", "ordered_ids": [c["id"], a["id"], b["id"]]},
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert [item["value"] for item in items] == ["c", "a", "b"]
    sort_by_value = {item["value"]: item["sort_order"] for item in items}
    assert sort_by_value == {"c": 0, "a": 1, "b": 2}


def test_t4_2_reorder_requires_admin(active_user, admin_user) -> None:
    a = create_entry(admin_user.email, "mgmt_perm", "a")

    response = client.post(
        "/api/v1/admin/vocabularies/reorder",
        json={"vocab_key": "mgmt_perm", "ordered_ids": [a["id"]]},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 403


def test_t4_2_reorder_rejects_ids_from_another_vocabulary(admin_user) -> None:
    a = create_entry(admin_user.email, "mgmt_a", "a")
    foreign = create_entry(admin_user.email, "mgmt_b", "b")

    response = client.post(
        "/api/v1/admin/vocabularies/reorder",
        json={"vocab_key": "mgmt_a", "ordered_ids": [a["id"], foreign["id"]]},
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 422


def test_t4_2_reorder_rejects_incomplete_id_set(admin_user) -> None:
    a = create_entry(admin_user.email, "mgmt_partial", "a", sort_order=0)
    create_entry(admin_user.email, "mgmt_partial", "b", sort_order=1)

    # 只发其中一个 id：漏掉 b 会让 b 的 sort_order 与 a 撞号，必须拒绝。
    response = client.post(
        "/api/v1/admin/vocabularies/reorder",
        json={"vocab_key": "mgmt_partial", "ordered_ids": [a["id"]]},
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 422


def test_t4_2_reorder_rejects_duplicate_ids(admin_user) -> None:
    a = create_entry(admin_user.email, "mgmt_dup", "a", sort_order=0)
    b = create_entry(admin_user.email, "mgmt_dup", "b", sort_order=1)

    response = client.post(
        "/api/v1/admin/vocabularies/reorder",
        json={
            "vocab_key": "mgmt_dup",
            "ordered_ids": [a["id"], a["id"], b["id"]],
        },
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Group upsert
# ---------------------------------------------------------------------------


def test_t4_3_admin_upsert_group_assigns_members_and_consistent_labels(
    admin_user,
) -> None:
    a = create_entry(admin_user.email, "mgmt_group", "a")
    b = create_entry(admin_user.email, "mgmt_group", "b")

    response = client.put(
        "/api/v1/admin/vocabularies/groups",
        json={
            "vocab_key": "mgmt_group",
            "group_key": "grp1",
            "group_label_zh": "分组一",
            "group_label_en": "Group One",
            "group_sort_order": 1,
            "member_ids": [a["id"], b["id"]],
        },
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 200, response.text
    by_value = {item["value"]: item for item in response.json()["items"]}
    for value in ("a", "b"):
        assert by_value[value]["group_key"] == "grp1"
        assert by_value[value]["group_label_zh"] == "分组一"
        assert by_value[value]["group_label_en"] == "Group One"
        assert by_value[value]["group_sort_order"] == 1


def test_t4_4_upsert_group_relabel_updates_all_existing_members(admin_user) -> None:
    a = create_entry(admin_user.email, "mgmt_relabel", "a")
    b = create_entry(admin_user.email, "mgmt_relabel", "b")
    base = {
        "vocab_key": "mgmt_relabel",
        "group_key": "grp",
        "group_label_zh": "旧名",
        "group_label_en": "Old",
        "group_sort_order": 1,
    }
    client.put(
        "/api/v1/admin/vocabularies/groups",
        json={**base, "member_ids": [a["id"], b["id"]]},
        headers=auth_headers(admin_user.email),
    )

    # 仅改标签/排序，不带新成员；应作用到该分组的全部既有成员。
    response = client.put(
        "/api/v1/admin/vocabularies/groups",
        json={
            "vocab_key": "mgmt_relabel",
            "group_key": "grp",
            "group_label_zh": "新名",
            "group_label_en": "New",
            "group_sort_order": 2,
            "member_ids": [],
        },
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 200, response.text
    by_value = {item["value"]: item for item in response.json()["items"]}
    for value in ("a", "b"):
        assert by_value[value]["group_label_zh"] == "新名"
        assert by_value[value]["group_label_en"] == "New"
        assert by_value[value]["group_sort_order"] == 2


def test_t4_5_upsert_group_requires_admin(active_user, admin_user) -> None:
    a = create_entry(admin_user.email, "mgmt_group_perm", "a")

    response = client.put(
        "/api/v1/admin/vocabularies/groups",
        json={
            "vocab_key": "mgmt_group_perm",
            "group_key": "grp",
            "group_label_zh": "标签",
            "group_sort_order": 1,
            "member_ids": [a["id"]],
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 403


def test_t4_5_upsert_group_rejects_members_from_another_vocabulary(admin_user) -> None:
    a = create_entry(admin_user.email, "mgmt_group_x", "a")
    foreign = create_entry(admin_user.email, "mgmt_group_y", "b")

    response = client.put(
        "/api/v1/admin/vocabularies/groups",
        json={
            "vocab_key": "mgmt_group_x",
            "group_key": "grp",
            "group_label_zh": "标签",
            "group_sort_order": 1,
            "member_ids": [a["id"], foreign["id"]],
        },
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# PATCH group membership
# ---------------------------------------------------------------------------


def test_t4_6_patch_group_key_null_clears_group_fields(admin_user) -> None:
    a = create_entry(admin_user.email, "mgmt_clear", "a")
    client.put(
        "/api/v1/admin/vocabularies/groups",
        json={
            "vocab_key": "mgmt_clear",
            "group_key": "grp",
            "group_label_zh": "标签",
            "group_sort_order": 1,
            "member_ids": [a["id"]],
        },
        headers=auth_headers(admin_user.email),
    )

    response = client.patch(
        f"/api/v1/admin/vocabularies/{a['id']}",
        json={"group_key": None},
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["group_key"] is None
    assert body["group_label_zh"] is None
    assert body["group_label_en"] is None
    assert body["group_sort_order"] is None


def test_t4_7_patch_group_key_inherits_existing_group_labels(admin_user) -> None:
    a = create_entry(admin_user.email, "mgmt_inherit", "a")
    b = create_entry(admin_user.email, "mgmt_inherit", "b")
    client.put(
        "/api/v1/admin/vocabularies/groups",
        json={
            "vocab_key": "mgmt_inherit",
            "group_key": "grp",
            "group_label_zh": "继承标签",
            "group_label_en": "Inherited",
            "group_sort_order": 3,
            "member_ids": [a["id"]],
        },
        headers=auth_headers(admin_user.email),
    )

    response = client.patch(
        f"/api/v1/admin/vocabularies/{b['id']}",
        json={"group_key": "grp"},
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["group_key"] == "grp"
    assert body["group_label_zh"] == "继承标签"
    assert body["group_label_en"] == "Inherited"
    assert body["group_sort_order"] == 3


def test_t4_7_patch_group_key_unknown_group_is_rejected(admin_user) -> None:
    a = create_entry(admin_user.email, "mgmt_ghost", "a")

    response = client.patch(
        f"/api/v1/admin/vocabularies/{a['id']}",
        json={"group_key": "ghost"},
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 422
