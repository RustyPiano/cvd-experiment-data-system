"""M1 — 字段字典一致性守卫.

锁定「三套真相」(FieldDefinition / Pydantic / 受控词表) 不漂移。
FieldDefinition 是可发布规范层；Pydantic 是运行时校验权威；这些测试保证两者
以及受控词表互相对得上。新增 / 修改字段时若制造漂移，这里会变红。

设计见 docs/standard/schema-v0.1-tdd-plan.md (M1)。
"""

from __future__ import annotations

from pydantic import BaseModel
from sqlalchemy import select

from app.models.field_definition import FieldDefinition, FieldType
from app.models.module_payload import ExperimentModuleKey
from app.models.vocabulary import ControlledVocabulary
from app.schemas.module_payload import (
    BasicInfoPayload,
    CharacterizationMethodPayload,
    CharacterizationPayload,
    EnvironmentPayload,
    FurnaceInfoPayload,
    FurnacePlacementPayload,
    FurnaceProgramPayload,
    FurnaceTemperatureNodePayload,
    FurnaceZonePayload,
    GasComponentPayload,
    GasProgramPayload,
    GasSegmentPayload,
    PrecheckPayload,
    PrecursorItemPayload,
    PrecursorsPayload,
    ProcessObservationPayload,
    ResultSummaryPayload,
    SubstrateItemPayload,
    SubstratesPayload,
    SubstrateTreatmentParamsPayload,
)

# 每个 module_key 由这些 Pydantic 模型「共同」描述（顶层 + 嵌套 item / 子模型），
# 因为 FieldDefinition 同时描述列表项里的字段。
MODULE_MODELS: dict[str, tuple[type[BaseModel], ...]] = {
    ExperimentModuleKey.BASIC_INFO.value: (BasicInfoPayload,),
    ExperimentModuleKey.ENVIRONMENT.value: (EnvironmentPayload,),
    ExperimentModuleKey.PRECHECK.value: (PrecheckPayload,),
    ExperimentModuleKey.PRECURSORS.value: (PrecursorsPayload, PrecursorItemPayload),
    ExperimentModuleKey.SUBSTRATES.value: (
        SubstratesPayload,
        SubstrateItemPayload,
        SubstrateTreatmentParamsPayload,
    ),
    ExperimentModuleKey.FURNACE_PROGRAM.value: (
        FurnaceProgramPayload,
        FurnaceInfoPayload,
        FurnacePlacementPayload,
        FurnaceZonePayload,
        FurnaceTemperatureNodePayload,
    ),
    ExperimentModuleKey.GAS_PROGRAM.value: (
        GasProgramPayload,
        GasSegmentPayload,
        GasComponentPayload,
    ),
    ExperimentModuleKey.PROCESS_OBSERVATION.value: (ProcessObservationPayload,),
    ExperimentModuleKey.CHARACTERIZATION.value: (
        CharacterizationPayload,
        CharacterizationMethodPayload,
    ),
    ExperimentModuleKey.RESULT_SUMMARY.value: (ResultSummaryPayload,),
}


# 命名已统一（迁移 0028）：FieldDefinition.field_key 直接采用 Pydantic 叶子名，
# 不再需要扁平→canonical 别名映射。T1.3 因此要求 field_key 直接命中已声明字段。


def _declared_field_names(module_key: str) -> set[str]:
    names: set[str] = set()
    for model in MODULE_MODELS.get(module_key, ()):  # type: ignore[arg-type]
        names.update(model.model_fields.keys())
    return names

# ---------------------------------------------------------------------------
# 显式例外白名单（自带文档性）。
# ---------------------------------------------------------------------------

# field_type 为 select / multi_select 但「不」由受控词表驱动的字段：
# 这些下拉的取值来自别处（如用户表），不是 controlled_vocabularies。
SELECT_FIELDS_WITHOUT_VOCAB: frozenset[tuple[str, str]] = frozenset(
    {
        ("basic_info", "operator_id"),  # 取值来自 users 表
        ("basic_info", "experiment_type"),  # 自由选择，暂无受控词表
        ("basic_info", "recipe_id"),  # 取值来自 recipes 表（配方模板选择）
        # TODO(standard): abnormal_events 目前是自由多选，宜引入受控词表
        # `abnormal_event` 以利标准化（登记为后续 M3/词表工作的候选）。
        ("process_observation", "abnormal_events"),
    }
)


def _active_field_definitions(db_session) -> list[FieldDefinition]:
    return list(
        db_session.scalars(
            select(FieldDefinition).where(FieldDefinition.is_active.is_(True))
        ).all()
    )


def _active_vocab_keys(db_session) -> set[str]:
    rows = db_session.scalars(
        select(ControlledVocabulary.vocab_key).where(
            ControlledVocabulary.is_active.is_(True)
        )
    ).all()
    return set(rows)


def test_t1_1_field_definition_vocab_keys_have_no_dangling_reference(db_session) -> None:
    """T1.1 每个 FieldDefinition.vocab_key 都在受控词表里有 ≥1 个 active 条目。"""
    active_vocab_keys = _active_vocab_keys(db_session)

    dangling: list[tuple[str, str, str]] = []
    for field in _active_field_definitions(db_session):
        if field.vocab_key and field.vocab_key not in active_vocab_keys:
            dangling.append((field.module_key, field.field_key, field.vocab_key))

    assert not dangling, (
        "存在指向空词表的字段定义 (module_key, field_key, vocab_key)："
        f"{sorted(dangling)}"
    )


def test_t1_2_select_fields_are_backed_by_a_vocabulary(db_session) -> None:
    """T1.2 select / multi_select 字段必须有 vocab_key，或登记在例外白名单。"""
    select_types = {FieldType.SELECT.value, FieldType.MULTI_SELECT.value}

    missing: list[tuple[str, str, str]] = []
    for field in _active_field_definitions(db_session):
        if field.field_type not in select_types:
            continue
        if field.vocab_key:
            continue
        if (field.module_key, field.field_key) in SELECT_FIELDS_WITHOUT_VOCAB:
            continue
        missing.append((field.module_key, field.field_key, field.field_type))

    assert not missing, (
        "下拉字段缺少受控词表 (module_key, field_key, field_type)，"
        f"如确属无词表请加入 SELECT_FIELDS_WITHOUT_VOCAB 白名单：{sorted(missing)}"
    )


def test_t1_3_field_definitions_map_to_a_declared_pydantic_field(db_session) -> None:
    """T1.3 每条 FieldDefinition 都能映射到对应模块 Pydantic 模型已声明的字段。"""
    unknown_module: list[tuple[str, str]] = []
    unknown_field: list[tuple[str, str]] = []

    for field in _active_field_definitions(db_session):
        if field.module_key not in MODULE_MODELS:
            unknown_module.append((field.module_key, field.field_key))
            continue
        declared = _declared_field_names(field.module_key)
        if field.field_key in declared:
            continue
        unknown_field.append((field.module_key, field.field_key))

    assert not unknown_module, f"FieldDefinition 指向未知模块：{sorted(unknown_module)}"
    assert not unknown_field, (
        "FieldDefinition 描述了 Pydantic 模型未声明的字段（规范层与校验层漂移）："
        f"{sorted(unknown_field)}"
    )


# 反向覆盖只针对「扁平模块」——其每个声明字段都是面向用户的，理应有字段定义。
# 嵌套 / 列表模块含大量结构性字段（容器、索引），反向覆盖判断模糊，留作后续。
FLAT_MODULES: tuple[str, ...] = (
    ExperimentModuleKey.BASIC_INFO.value,
    ExperimentModuleKey.ENVIRONMENT.value,
    ExperimentModuleKey.PRECHECK.value,
    ExperimentModuleKey.PROCESS_OBSERVATION.value,
    ExperimentModuleKey.RESULT_SUMMARY.value,
)


def test_t1_5_group_labels_are_consistent_within_a_vocabulary(db_session) -> None:
    """T1.5 同一 (vocab_key, group_key) 的分组标签与排序必须一致（后端单一数据源）。"""
    rows = db_session.scalars(
        select(ControlledVocabulary).where(ControlledVocabulary.group_key.isnot(None))
    ).all()

    seen: dict[tuple[str, str], tuple[str | None, str | None, int | None]] = {}
    conflicts: list[tuple[str, str]] = []
    missing_label: list[tuple[str, str]] = []
    for row in rows:
        key = (row.vocab_key, row.group_key)
        triple = (row.group_label_zh, row.group_label_en, row.group_sort_order)
        if row.group_label_zh is None or row.group_sort_order is None:
            missing_label.append(key)
        if key in seen and seen[key] != triple:
            conflicts.append(key)
        seen.setdefault(key, triple)

    assert not missing_label, (
        f"已分组但缺标签/排序的 (vocab_key, group_key)：{sorted(set(missing_label))}"
    )
    assert not conflicts, f"同一分组出现不一致的标签/排序：{sorted(set(conflicts))}"


def test_t1_4_flat_module_fields_all_have_a_definition(db_session) -> None:
    """T1.4 扁平模块里每个 Pydantic 声明字段都有对应 FieldDefinition（规范层完整）。"""
    defined: set[tuple[str, str]] = {
        (field.module_key, field.field_key)
        for field in _active_field_definitions(db_session)
    }

    missing: list[tuple[str, str]] = []
    for module_key in FLAT_MODULES:
        for field_name in _declared_field_names(module_key):
            if (module_key, field_name) not in defined:
                missing.append((module_key, field_name))

    assert not missing, (
        "扁平模块存在未登记进字段字典的字段（规范层缺失）："
        f"{sorted(missing)}"
    )
