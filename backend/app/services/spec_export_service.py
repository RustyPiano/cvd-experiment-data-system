"""M5 — 规范产物生成器.

从「可发布规范层」(FieldDefinition + 受控词表) 与「运行时校验权威」(Pydantic
module_payload 模型) 生成带语义版本号的对外标准产物：

- 机读 JSON Schema：直接由 Pydantic 模型导出，确保发布的 schema 与运行时校验一致。
- 人读字段字典：由 FieldDefinition 联结受控词表生成（中英标签、单位、候选值）。

版本：module_payload schema 版本 cvd_v1 → 标准号 cvd-2d-process 1.0.0。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.field_definition import FieldDefinition
from app.models.module_payload import MODULE_PAYLOAD_SCHEMA_VERSION
from app.repositories.vocabulary_repository import VocabularyRepository
from app.schemas.module_payload import MODULE_PAYLOAD_MODELS

STANDARD_ID = "cvd-2d-process"
STANDARD_VERSION = "1.0.0"
JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"
# 每个模块 schema 的 $id 基址。给每个模块一个 $id，使其内部 `#/$defs/...` 引用以该
# 模块子树为解析根——这样无论「抽取该模块单独校验」还是「从顶层文档以 $ref 指向该
# 模块 $id」都能正确解析，避免顶层引用静默失效（fail-open）。
SCHEMA_BASE_URI = f"https://standard.cvd-2d.org/{STANDARD_VERSION}"

# 受词表驱动、需在字段字典里展开候选值的字段类型。
_VOCAB_FIELD_TYPES = frozenset({"select", "multi_select"})

# FieldDefinition 用扁平命名描述了若干嵌套字段，而 Pydantic(JSON Schema) 是嵌套结构。
# 发布字段字典时附上 canonical（Pydantic 叶子）字段名，让两份产物可对接（消除
# 「字典里有、schema 里查不到」的漂移）。与 M1 ALIASED_FIELDS 同源。
# TODO(standard): 后续统一命名后可移除此映射。
_CANONICAL_FIELD_NAMES: dict[tuple[str, str], str] = {
    ("substrates", "treatment_temperature_C"): "temperature_C",
    ("substrates", "treatment_duration_min"): "duration_min",
    ("substrates", "treatment_power_W"): "power_W",
    ("substrates", "treatment_gas"): "gas",
    ("characterization", "characterization_note"): "note",
}


class SpecExportService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.vocabularies = VocabularyRepository(db)

    # ------------------------------------------------------------------ #
    # 机读 JSON Schema
    # ------------------------------------------------------------------ #
    def build_json_schema(self) -> dict[str, Any]:
        """把各模块 payload 的 Pydantic JSON Schema 汇成一份带版本元信息的文档。

        每个模块条目本身是一份可独立校验的 JSON Schema（含自身 $defs + $id）。
        """
        modules: dict[str, Any] = {}
        for module_key, model in MODULE_PAYLOAD_MODELS.items():
            module_schema = model.model_json_schema()
            # 设 $id 使内部 #/$defs 引用以该模块子树为解析根（顶层/抽取两种用法都成立）。
            module_schema["$id"] = f"{SCHEMA_BASE_URI}/{module_key}.schema.json"
            modules[module_key] = module_schema
        return {
            "$schema": JSON_SCHEMA_DIALECT,
            "standard_id": STANDARD_ID,
            "title": "CVD-2D 工艺数据标准 / CVD-2D Process Data Standard",
            "version": STANDARD_VERSION,
            "module_payload_schema_version": MODULE_PAYLOAD_SCHEMA_VERSION,
            "usage": (
                "Validate an experiment module payload against modules.<module_key> "
                "as a standalone JSON Schema (each carries its own $id and $defs)."
            ),
            "modules": modules,
        }

    # ------------------------------------------------------------------ #
    # 人读字段字典
    # ------------------------------------------------------------------ #
    def build_field_dictionary(self) -> dict[str, Any]:
        fields = list(
            self.db.scalars(
                select(FieldDefinition)
                .where(FieldDefinition.is_active.is_(True))
                .order_by(
                    FieldDefinition.module_key.asc(),
                    FieldDefinition.sort_order.asc(),
                    FieldDefinition.field_key.asc(),
                )
            ).all()
        )

        # 候选值按 vocab_key 缓存，避免逐字段重复查询。
        allowed_cache: dict[str, list[dict[str, Any]]] = {}

        grouped: dict[str, list[dict[str, Any]]] = {}
        for field in fields:
            allowed_values: list[dict[str, Any]] = []
            if field.field_type in _VOCAB_FIELD_TYPES and field.vocab_key:
                allowed_values = self._allowed_values(field.vocab_key, allowed_cache)
            grouped.setdefault(field.module_key, []).append(
                {
                    "module_key": field.module_key,
                    "field_key": field.field_key,
                    # canonical_field = 该字段在 Pydantic/JSON Schema 中的叶子名；
                    # 多数与 field_key 相同，少数扁平别名映射到嵌套 canonical 名。
                    "canonical_field": _CANONICAL_FIELD_NAMES.get(
                        (field.module_key, field.field_key), field.field_key
                    ),
                    "label_zh": field.label_zh,
                    "label_en": field.label_en,
                    "field_type": field.field_type,
                    "unit": field.unit,
                    "required": field.required,
                    "inheritable": field.inheritable,
                    "vocab_key": field.vocab_key,
                    "allowed_values": allowed_values,
                }
            )

        # 模块顺序优先沿用 module_payload 的声明顺序，其余追加在后。
        ordered_keys = [key for key in MODULE_PAYLOAD_MODELS if key in grouped]
        ordered_keys += [key for key in grouped if key not in MODULE_PAYLOAD_MODELS]
        modules = [
            {"module_key": key, "fields": grouped[key]} for key in ordered_keys
        ]

        return {
            "standard_id": STANDARD_ID,
            "version": STANDARD_VERSION,
            "module_payload_schema_version": MODULE_PAYLOAD_SCHEMA_VERSION,
            "modules": modules,
            "field_count": len(fields),
        }

    def _allowed_values(
        self,
        vocab_key: str,
        cache: dict[str, list[dict[str, Any]]],
    ) -> list[dict[str, Any]]:
        if vocab_key not in cache:
            entries = self.vocabularies.list_entries(
                vocab_key=vocab_key, active_only=True
            )
            cache[vocab_key] = [
                {
                    "value": entry.value,
                    "label_zh": entry.label_zh,
                    "label_en": entry.label_en,
                    "group_key": entry.group_key,
                    "group_label_zh": entry.group_label_zh,
                }
                for entry in entries
            ]
        return cache[vocab_key]

    @staticmethod
    def _md_cell(value: Any) -> str:
        """转义 Markdown 表格单元格：竖线与换行会破坏表格结构。"""
        text = "" if value is None else str(value)
        return text.replace("\\", "\\\\").replace("|", "\\|").replace("\n", " ")

    def render_field_dictionary_markdown(self, field_dictionary: dict[str, Any]) -> str:
        lines: list[str] = [
            f"# CVD-2D 工艺数据字段字典 · {field_dictionary['standard_id']} "
            f"v{field_dictionary['version']}",
            "",
            f"> module_payload schema 版本：`{field_dictionary['module_payload_schema_version']}`"
            f"　|　字段总数：{field_dictionary['field_count']}",
            "",
            "本文件由 FieldDefinition + 受控词表自动生成，请勿手改。",
            "",
        ]
        for module in field_dictionary["modules"]:
            lines.append(f"## {module['module_key']}")
            lines.append("")
            lines.append(
                "| 字段 | canonical | 中文 | 英文 | 类型 | 单位 | 必填 | 词表 | 候选值 |"
            )
            lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
            for field in module["fields"]:
                allowed = "、".join(
                    self._md_cell(option["value"])
                    for option in field["allowed_values"]
                )
                lines.append(
                    f"| `{self._md_cell(field['field_key'])}` "
                    f"| `{self._md_cell(field['canonical_field'])}` "
                    f"| {self._md_cell(field['label_zh'])} "
                    f"| {self._md_cell(field['label_en'] or '')} "
                    f"| {self._md_cell(field['field_type'])} "
                    f"| {self._md_cell(field['unit'] or '')} "
                    f"| {'是' if field['required'] else ''} "
                    f"| {self._md_cell(field['vocab_key'] or '')} | {allowed} |"
                )
            lines.append("")
        return "\n".join(lines)

    # ------------------------------------------------------------------ #
    # 落盘
    # ------------------------------------------------------------------ #
    def generate(self, output_dir: str | Path) -> dict[str, str]:
        """生成三件产物到 output_dir，返回 {名称: 路径}。"""
        directory = Path(output_dir)
        directory.mkdir(parents=True, exist_ok=True)

        schema = self.build_json_schema()
        field_dictionary = self.build_field_dictionary()
        markdown = self.render_field_dictionary_markdown(field_dictionary)

        json_schema_path = directory / "cvd-2d-process.schema.json"
        field_dictionary_json_path = directory / "cvd-2d-field-dictionary.json"
        field_dictionary_md_path = directory / "cvd-2d-field-dictionary.md"

        json_schema_path.write_text(
            json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        field_dictionary_json_path.write_text(
            json.dumps(field_dictionary, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        field_dictionary_md_path.write_text(markdown + "\n", encoding="utf-8")

        return {
            "json_schema": str(json_schema_path),
            "field_dictionary_json": str(field_dictionary_json_path),
            "field_dictionary_md": str(field_dictionary_md_path),
        }
