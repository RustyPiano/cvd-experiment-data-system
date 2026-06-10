"""M5 — 规范产物生成.

从 FieldDefinition(+Pydantic) 生成：① 机读 JSON Schema ② 人读字段字典，带语义
版本号。这是第一次产出「一份可对外展示的标准」。设计见 schema-v0.1-tdd-plan.md(M5)。
"""

from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator
from sqlalchemy import func, select

from app.models.field_definition import FieldDefinition
from app.models.module_payload import MODULE_PAYLOAD_SCHEMA_VERSION
from app.schemas.module_payload import MODULE_PAYLOAD_MODELS
from app.services.spec_export_service import (
    STANDARD_ID,
    STANDARD_VERSION,
    SpecExportService,
)


def _active_field_count(db_session) -> int:
    return db_session.scalar(
        select(func.count())
        .select_from(FieldDefinition)
        .where(FieldDefinition.is_active.is_(True))
    )


def test_t5_1_json_schema_validates_good_and_rejects_bad_payload(db_session) -> None:
    schema = SpecExportService(db_session).build_json_schema()

    environment_schema = schema["modules"]["environment"]
    validator = Draft202012Validator(environment_schema)

    # 合法 payload：数值字段为数字、枚举字段为字符串。
    assert validator.is_valid({"indoor_temperature_C": 25.5, "sample_env": "clean"})
    # 非法 payload：数值字段填了字符串，JSON Schema 应判失败。
    assert not validator.is_valid({"indoor_temperature_C": "not-a-number"})


def test_t5_1_json_schema_carries_version_and_all_modules(db_session) -> None:
    schema = SpecExportService(db_session).build_json_schema()

    assert schema["standard_id"] == STANDARD_ID
    assert schema["version"] == STANDARD_VERSION
    assert schema["module_payload_schema_version"] == MODULE_PAYLOAD_SCHEMA_VERSION
    assert set(schema["modules"].keys()) == set(MODULE_PAYLOAD_MODELS.keys())
    # 每个模块自身是一份可独立校验的 JSON Schema。
    for module_schema in schema["modules"].values():
        Draft202012Validator.check_schema(module_schema)


def test_t5_2_field_dictionary_covers_all_active_fields_with_units(db_session) -> None:
    field_dict = SpecExportService(db_session).build_field_dictionary()

    all_fields = [field for module in field_dict["modules"] for field in module["fields"]]
    assert field_dict["field_count"] == _active_field_count(db_session)
    assert field_dict["field_count"] == len(all_fields)

    # 每个字段都带 unit 键（值可为 null）。
    assert all("unit" in field for field in all_fields)

    # 受词表驱动的字段都能列出候选值（T1.1 保证词表非空）。
    vocab_fields = [field for field in all_fields if field["vocab_key"]]
    assert vocab_fields, "应至少有一个受词表驱动的字段"
    for field in vocab_fields:
        assert len(field["allowed_values"]) >= 1, field["field_key"]
        assert all("value" in option for option in field["allowed_values"])


def test_t5_4_module_schema_is_self_contained_and_validates_nested(db_session) -> None:
    """带 $ref 的模块（substrates）抽出后能独立校验嵌套结构，且带 $id。"""
    schema = SpecExportService(db_session).build_json_schema()
    substrates = schema["modules"]["substrates"]
    assert "$id" in substrates

    validator = Draft202012Validator(substrates)
    good = {
        "items": [{"type": "硅片", "treatment_params": {"temperature_C": 300.0}}]
    }
    assert validator.is_valid(good)
    # 嵌套数值字段填字符串 → JSON Schema 应判失败（证明 $ref 正确解析到嵌套子模型）。
    bad = {"items": [{"treatment_params": {"temperature_C": "hot"}}]}
    assert not validator.is_valid(bad)


def test_t5_4_field_dictionary_keys_match_pydantic_leaf_names(db_session) -> None:
    """命名已统一（迁移 0028）：字段字典 field_key 直接采用 Pydantic 叶子名，
    且与机读 JSON Schema 的属性名对接，无需别名/canonical 补丁。"""
    service = SpecExportService(db_session)
    field_dict = service.build_field_dictionary()
    all_fields = [field for module in field_dict["modules"] for field in module["fields"]]
    keys = {(f["module_key"], f["field_key"]) for f in all_fields}

    # 统一后的 canonical 叶子名在位，旧的扁平别名已消失。
    assert ("substrates", "temperature_C") in keys
    assert ("characterization", "note") in keys
    assert ("substrates", "treatment_temperature_C") not in keys
    assert ("characterization", "characterization_note") not in keys

    # 不再发布 canonical_field 补丁字段（field_key 自身即对接键）。
    assert all("canonical_field" not in field for field in all_fields)

    # substrates 的 temperature_C 确实是 JSON Schema 中嵌套子模型的属性。
    schema = service.build_json_schema()
    defs = schema["modules"]["substrates"].get("$defs", {})
    treatment_props = (
        defs.get("SubstrateTreatmentParamsPayload", {}).get("properties", {})
    )
    assert "temperature_C" in treatment_props


def test_t5_5_committed_artifacts_match_regeneration(
    db_session, tmp_path: Path
) -> None:
    """提交在仓库里的产物必须与当前代码/seed 重新生成的一致，否则属漂移须重新发布。"""
    paths = SpecExportService(db_session).generate(tmp_path)
    committed_dir = (
        Path(__file__).resolve().parents[3] / "docs" / "standard" / "generated"
    )
    filenames = {
        "json_schema": "cvd-2d-process.schema.json",
        "field_dictionary_json": "cvd-2d-field-dictionary.json",
        "field_dictionary_md": "cvd-2d-field-dictionary.md",
    }
    for key, filename in filenames.items():
        generated = Path(paths[key]).read_text(encoding="utf-8")
        committed = (committed_dir / filename).read_text(encoding="utf-8")
        assert generated == committed, (
            f"{filename} 与提交的产物不一致；请运行 "
            "`python -m app.commands.generate_spec` 重新生成并提交。"
        )


def test_t5_3_generate_writes_versioned_artifacts(db_session, tmp_path: Path) -> None:
    paths = SpecExportService(db_session).generate(tmp_path)

    for path in paths.values():
        resolved = Path(path)
        assert resolved.exists(), resolved
        assert resolved.stat().st_size > 0, resolved

    schema_doc = json.loads(Path(paths["json_schema"]).read_text(encoding="utf-8"))
    assert schema_doc["version"] == STANDARD_VERSION
    dictionary_doc = json.loads(
        Path(paths["field_dictionary_json"]).read_text(encoding="utf-8")
    )
    assert dictionary_doc["version"] == STANDARD_VERSION
    # 人读 Markdown 含标准号标题。
    markdown = Path(paths["field_dictionary_md"]).read_text(encoding="utf-8")
    assert STANDARD_ID in markdown
