"""separate substrate pose from inter-piece placement relations

Revision ID: 20260903_0014
Revises: 20260903_0013
Create Date: 2026-09-03 18:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa

from alembic import op

revision: str = "20260903_0014"
down_revision: str | None = "20260903_0013"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _legacy_pose(description: str) -> dict[str, Any]:
    return {
        "placement": "other",
        "placement_other": description,
    }


def _upgrade_size_placement(value: dict[str, Any]) -> dict[str, Any]:
    rewritten = dict(value)
    length = rewritten.get("length_mm")
    width = rewritten.get("width_mm")
    if isinstance(length, (int, float)) and isinstance(width, (int, float)) and length < width:
        rewritten["length_mm"], rewritten["width_mm"] = width, length
    placement = rewritten.get("placement")
    legacy_opposed = placement == "face_to_face" or (
        placement == "other" and rewritten.get("placement_other") == "面对另一片衬底"
    )
    if legacy_opposed:
        rewritten.update(_legacy_pose("旧记录：两片生长面相对（未记录配对衬底片及单片姿态）"))
    elif placement == "tilted" and rewritten.get("tilt_azimuth_deg") is None:
        angle = rewritten.get("tilt_angle_deg")
        detail = f"，已记录倾角 {angle}°" if angle is not None else ""
        rewritten.update(_legacy_pose(f"旧记录：倾斜放置{detail}，未记录方位角"))
    elif placement == "upright" and rewritten.get("upright_growth_face_direction") is None:
        rewritten.update(_legacy_pose("旧记录：竖放，未记录生长面朝向"))
    else:
        return rewritten
    rewritten.pop("tilt_angle_deg", None)
    rewritten.pop("tilt_azimuth_deg", None)
    rewritten.pop("upright_growth_face_direction", None)
    return rewritten


def _downgrade_size_placement(value: dict[str, Any]) -> dict[str, Any]:
    rewritten = dict(value)
    rewritten.pop("tilt_azimuth_deg", None)
    rewritten.pop("upright_growth_face_direction", None)
    if rewritten.get("placement_other") == "旧记录：两片生长面相对（未记录配对衬底片及单片姿态）":
        rewritten["placement"] = "face_to_face"
        rewritten.pop("placement_other", None)
    return rewritten


def _rewrite_editable_substrate_placements(*, upgrade: bool) -> None:
    bind = op.get_bind()
    table = sa.Table("experiment_module_payloads", sa.MetaData(), autoload_with=bind)
    rows = bind.execute(
        sa.select(table.c.id, table.c.payload_json).where(table.c.module_key == "substrates")
    ).mappings()
    rewrite = _upgrade_size_placement if upgrade else _downgrade_size_placement
    for row in rows:
        payload = row["payload_json"]
        if not isinstance(payload, dict):
            continue
        rewritten = dict(payload)
        items = []
        changed = False
        for item in payload.get("items") or []:
            if not isinstance(item, dict):
                items.append(item)
                continue
            next_item = dict(item)
            placement = item.get("size_placement")
            if isinstance(placement, dict):
                next_placement = rewrite(placement)
                next_item["size_placement"] = next_placement
                changed = changed or next_placement != placement
            items.append(next_item)
        if not upgrade:
            related_labels = {
                str(relation.get(key))
                for relation in payload.get("placement_relations") or []
                if isinstance(relation, dict)
                for key in ("piece_a_label", "piece_b_label")
                if relation.get(key)
            }
            for item in items:
                if not isinstance(item, dict) or item.get("piece_label") not in related_labels:
                    continue
                placement = item.get("size_placement")
                if isinstance(placement, dict):
                    item["size_placement"] = {
                        **placement,
                        "placement": "face_to_face",
                    }
                    item["size_placement"].pop("placement_other", None)
            if "placement_relations" in rewritten:
                rewritten.pop("placement_relations")
                changed = True
        if changed:
            rewritten["items"] = items
            bind.execute(
                table.update().where(table.c.id == row["id"]).values(payload_json=rewritten)
            )


def upgrade() -> None:
    _rewrite_editable_substrate_placements(upgrade=True)


def downgrade() -> None:
    _rewrite_editable_substrate_placements(upgrade=False)
