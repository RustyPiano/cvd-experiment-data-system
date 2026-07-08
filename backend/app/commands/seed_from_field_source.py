from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.field_definition import FieldDefinition, FieldType
from app.models.vocabulary import ControlledVocabulary

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_FIELD_SOURCE = REPO_ROOT / "docs" / "standard" / "field-source.yaml"
SCHEMA_VERSION = "cvd_v2"


@dataclass(frozen=True)
class SeedStats:
    fields_created: int = 0
    fields_updated: int = 0
    fields_deactivated: int = 0
    vocab_created: int = 0
    vocab_updated: int = 0
    vocab_deactivated: int = 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Seed cvd_v2 field definitions and vocabularies from field-source.yaml."
    )
    parser.add_argument(
        "--field-source",
        default=str(DEFAULT_FIELD_SOURCE),
        help="Path to docs/standard/field-source.yaml.",
    )
    return parser


def load_field_source(path: str | Path = DEFAULT_FIELD_SOURCE) -> dict[str, Any]:
    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def seed_from_field_source(db: Session, path: str | Path = DEFAULT_FIELD_SOURCE) -> SeedStats:
    doc = load_field_source(path)
    fields = _iter_seed_fields(doc)
    field_stats = _upsert_field_definitions(db, fields)
    vocab_stats = _upsert_vocabularies(db, fields)
    return SeedStats(*field_stats, *vocab_stats)


def _iter_seed_fields(doc: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    sources = (
        ("experiment_record", doc["modules"]),
        ("entities", doc["entity_keys"]),
    )
    sort_order = 0
    for part, module_map in sources:
        for section in doc[part]["sections"]:
            for field in section["fields"]:
                module_key = module_map[field["module"]]
                rows.append(
                    {
                        "module_key": module_key,
                        "field_key": field["key"],
                        "label_zh": field["label"],
                        "label_en": field.get("label_en"),
                        "field_type": _field_type(field),
                        "unit": None if field.get("unit") == "—" else field.get("unit"),
                        "required": field["requirement"]["level"] == "required",
                        "vocab_key": _vocab_key(module_key, field)
                        if _option_values(field)
                        else None,
                        "sort_order": sort_order,
                        "metadata_json": {
                            "schema_version": SCHEMA_VERSION,
                            "source": "field-source.yaml",
                            "source_part": part,
                            "input": field.get("input"),
                            "options": field.get("options"),
                            "requirement": field.get("requirement"),
                            "r0": bool(field.get("r0")),
                        },
                        "option_values": _option_values(field),
                    }
                )
                sort_order += 1
    return rows


def _field_type(field: dict[str, Any]) -> str:
    input_kind = str(field.get("input") or "")
    if "多选" in input_kind:
        return FieldType.MULTI_SELECT.value
    if "下拉" in input_kind:
        return FieldType.SELECT.value
    if "数组" in input_kind or "每条" in str(field.get("options") or ""):
        return FieldType.ARRAY.value
    if "数值" in input_kind:
        return FieldType.NUMBER.value
    if "日期" in input_kind:
        return FieldType.DATE.value
    if "勾选" in input_kind:
        return FieldType.BOOLEAN.value
    if "自由" in input_kind or "描述" in input_kind:
        return FieldType.TEXTAREA.value
    return FieldType.TEXT.value


def _vocab_key(module_key: str, field: dict[str, Any]) -> str:
    return f"{SCHEMA_VERSION}.{module_key}.{field['key']}"


def _option_values(field: dict[str, Any]) -> list[str]:
    input_kind = str(field.get("input") or "")
    options = str(field.get("options") or "").strip()
    if "下拉" not in input_kind and "多选" not in input_kind:
        return []
    if not options or options in {"—", "受控+其他", "课题组成员", "装置库", "批次库"}:
        return []
    if any(marker in options for marker in ("标准写法", "示例", "如 ", "每条:", "建议含")):
        return []

    raw_values = re.split(r"[/·]", options)
    values: list[str] = []
    for raw in raw_values:
        value = raw.strip()
        if not value:
            continue
        value = re.sub(r"[（(].*可加.*[）)]", "", value).strip()
        if value and value not in values:
            values.append(value)
    return values if len(values) > 1 else []


def _upsert_field_definitions(
    db: Session,
    fields: list[dict[str, Any]],
) -> tuple[int, int, int]:
    existing = {
        (row.module_key, row.field_key): row
        for row in db.scalars(select(FieldDefinition)).all()
        if row.metadata_json.get("schema_version") == SCHEMA_VERSION
    }
    wanted_keys = {(field["module_key"], field["field_key"]) for field in fields}
    created = updated = deactivated = 0

    for field in fields:
        key = (field["module_key"], field["field_key"])
        row = existing.get(key)
        values = {name: value for name, value in field.items() if name != "option_values"}
        if row is None:
            db.add(FieldDefinition(**values, is_active=True))
            created += 1
            continue
        changed = not row.is_active
        for name, value in values.items():
            if getattr(row, name) != value:
                setattr(row, name, value)
                changed = True
        row.is_active = True
        if changed:
            updated += 1

    for key, row in existing.items():
        if key not in wanted_keys and row.is_active:
            row.is_active = False
            deactivated += 1
    return created, updated, deactivated


def _upsert_vocabularies(
    db: Session,
    fields: list[dict[str, Any]],
) -> tuple[int, int, int]:
    wanted: dict[str, list[str]] = {
        field["vocab_key"]: field["option_values"]
        for field in fields
        if field["vocab_key"] and field["option_values"]
    }
    existing = {
        (row.vocab_key, row.value): row
        for row in db.scalars(
            select(ControlledVocabulary).where(ControlledVocabulary.vocab_key.like("cvd_v2.%"))
        ).all()
    }
    wanted_keys = {(vocab_key, value) for vocab_key, values in wanted.items() for value in values}
    created = updated = deactivated = 0

    for vocab_key, values in wanted.items():
        for index, value in enumerate(values):
            row = existing.get((vocab_key, value))
            metadata_json = {
                "schema_version": SCHEMA_VERSION,
                "source": "field-source.yaml",
            }
            if row is None:
                db.add(
                    ControlledVocabulary(
                        vocab_key=vocab_key,
                        value=value,
                        label_zh=value,
                        label_en=None,
                        sort_order=index,
                        is_active=True,
                        metadata_json=metadata_json,
                    )
                )
                created += 1
                continue
            new_values = {
                "label_zh": value,
                "sort_order": index,
                "is_active": True,
                "metadata_json": metadata_json,
            }
            changed = False
            for name, new_value in new_values.items():
                if getattr(row, name) != new_value:
                    setattr(row, name, new_value)
                    changed = True
            if changed:
                updated += 1

    for key, row in existing.items():
        if key not in wanted_keys and row.is_active:
            row.is_active = False
            deactivated += 1
    return created, updated, deactivated


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    db: Session = SessionLocal()
    try:
        stats = seed_from_field_source(db, args.field_source)
        db.commit()
    finally:
        db.close()

    print(
        "cvd_v2 field definitions: "
        f"+{stats.fields_created} / ~{stats.fields_updated} / -{stats.fields_deactivated}; "
        "vocabularies: "
        f"+{stats.vocab_created} / ~{stats.vocab_updated} / -{stats.vocab_deactivated}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
