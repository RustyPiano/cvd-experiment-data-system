from __future__ import annotations

from typing import Any


def render_formula_display(
    chemical_formula: str,
    structure_type: str,
    components: list[dict[str, Any]] | None = None,
) -> str:
    """默认规则，待组内确认（待明确#1）.

    参考实现：v2 显示串目前由前端 formula.ts 的 renderFormulaDisplay 渲染，本函数暂无
    后端生产调用点，仅作为同规则的服务端参考实现与测试基线保留。
    """

    parts = components or []
    if structure_type in {"intrinsic", "本征"} or not parts:
        return chemical_formula
    if structure_type in {"vertical_heterostructure", "垂直异质结"}:
        ordered = sorted(parts, key=_layer_order)
        return "/".join(_formula(part) for part in ordered if _formula(part)) or chemical_formula
    if structure_type in {"lateral_heterostructure", "横向异质结"}:
        return "-".join(_formula(part) for part in parts if _formula(part)) or chemical_formula
    if structure_type in {"doped", "掺杂"}:
        dopant = next(
            (_formula(part) for part in parts if part.get("role") in {"dopant", "掺杂剂"}),
            "",
        )
        matrix = next(
            (_formula(part) for part in parts if part.get("role") in {"matrix", "基体"}),
            "",
        )
        if dopant and matrix:
            return f"{dopant}:{matrix}"
    return chemical_formula


def _formula(component: dict[str, Any]) -> str:
    return str(component.get("formula") or "").strip()


def _layer_order(component: dict[str, Any]) -> tuple[int, str]:
    raw_order = component.get("layer_order")
    try:
        order = int(raw_order)
    except (TypeError, ValueError):
        order = 0
    return order, _formula(component)
