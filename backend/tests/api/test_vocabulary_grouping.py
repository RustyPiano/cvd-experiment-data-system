"""M3 — 词表分组与排序.

给受控词表加 group_key，解决「列表长 / 无分组 / 排序乱」。list 接口按
(group_key, sort_order) 返回，同组连续。

设计见 docs/standard/schema-v0.1-tdd-plan.md (M3)。
"""

from __future__ import annotations

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


def _list(vocab_key: str, email: str) -> list[dict]:
    response = client.get(
        f"/api/v1/vocabularies?vocab_key={vocab_key}",
        headers=auth_headers(email),
    )
    assert response.status_code == 200
    return response.json()["items"]


def _assert_groups_contiguous(items: list[dict]) -> None:
    """同一 group_key 的条目在返回顺序里必须连续（已分组）。"""
    seen: set[str] = set()
    previous: str | None = object()  # sentinel != any group_key
    for item in items:
        group = item["group_key"]
        if group != previous:
            assert group not in seen, f"分组未连续：{group} 在 {[i['group_key'] for i in items]}"
            seen.add(group)
            previous = group


def test_t3_1_failure_mode_has_group_keys_and_is_grouped(active_user) -> None:
    items = _list("failure_mode", active_user.email)
    assert items, "failure_mode 应已 seed"
    assert all(item["group_key"] for item in items), "failure_mode 每项都应有 group_key"
    _assert_groups_contiguous(items)
    by_value = {item["value"]: item["group_key"] for item in items}
    assert by_value["no_growth"] == by_value["low_coverage"]  # 同属「成核与覆盖」
    assert by_value["multilayer"] != by_value["no_growth"]  # 不同组


def test_t3_1_gas_label_grouped_by_pure_vs_mixed(active_user) -> None:
    items = _list("gas_label", active_user.email)
    _assert_groups_contiguous(items)
    by_value = {item["value"]: item["group_key"] for item in items}
    assert by_value.get("Ar") == "pure"
    assert by_value.get("Ar+H2") == "mixed"
    # 单一气体与混合气体分到不同组
    assert by_value["Ar"] != by_value["Ar+H2"]


def test_t3_1_substrate_type_grouped_by_material_family(active_user) -> None:
    items = _list("substrate_type", active_user.email)
    _assert_groups_contiguous(items)
    by_value = {item["value"]: item["group_key"] for item in items}
    # _0016 的活跃取值：1 个硅基 + 6 个蓝宝石
    assert by_value.get("硅片单抛N<100>") == "silicon"
    assert by_value.get("蓝宝石单抛<0001>/<11-20>") == "sapphire"


def test_t3_3_grouped_items_carry_group_label(active_user) -> None:
    """T3.3 分组项带中文分组标签（标签是后端数据，非前端写死）。"""
    items = _list("failure_mode", active_user.email)
    by_value = {item["value"]: item for item in items}
    assert by_value["no_growth"]["group_label_zh"] == "成核与覆盖"
    assert by_value["multilayer"]["group_label_zh"] == "形貌与厚度"


def test_t3_4_groups_ordered_logically_not_alphabetically(active_user) -> None:
    """T3.4 分组按 group_sort_order 逻辑排序，而非 group_key 字母序。"""
    items = _list("failure_mode", active_user.email)
    # 首次出现的分组顺序应为「成核与覆盖」在前、「其他」在后。
    group_order: list[str] = []
    for item in items:
        if item["group_key"] not in group_order:
            group_order.append(item["group_key"])
    assert group_order.index("nucleation_coverage") < group_order.index("other")
    # 字母序会把 crystallinity 排到 nucleation_coverage 之前——逻辑序不应如此。
    assert group_order.index("nucleation_coverage") < group_order.index("crystallinity")
