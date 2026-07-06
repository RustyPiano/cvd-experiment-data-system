> ⚠️ **已归档 · 仅历史（v1/早期设想，不代表现状）。** 现行真相见仓库 `docs/standard/STATUS.md`；字段以 `docs/standard/字段草案-v3.xlsx` 为准。归档于 2026-07-06。

# CVD-2D 工艺数据标准 v0.1 — 开发计划（TDD）

> 状态：草案 / 执行中　|　创建：2026-06-09　|　北极星见 memory: standard-database-vision

## 0. 目标与范围

把现有系统升级为「可发布、可追溯、AI-Ready」的二维材料 CVD 工艺数据标准的第一版。

**本轮范围**
- 阶段 1：规范层收敛 + 发布（FieldDefinition 升为权威规范层 + 一致性守卫 + 生成规范产物）
- 阶段 2.1：失败 / 结果模型（最紧迫，数据不可逆）
- 词表友好化：分组 / 排序 / 管理维护（用户反馈痛点）

**定调（已确认）**
- `Pydantic`（`app/schemas/module_payload.py`）= **运行时校验权威**，不重写。
- `FieldDefinition`（`experiment_field_definitions`）= **可发布规范层**（单位 / 类型 / 词表 / 必填 / 中英标签）。
- 加**一致性守卫测试**，保证「三套真相」（FieldDefinition / Pydantic / payload）不漂移。

**不在本轮**（登记为后续，见 M6）：多租户隔离、OPTIMADE 导出、数据集 DOI、JSONB 可查询性 + 批量流式导出、单位 QUDT 映射。

## 1. TDD 工作方式

- 每个里程碑：**先写测试（红）→ 最小实现（绿）→ 重构**。
- 自动化测试：`cd backend && .venv/bin/python -m pytest`（用 conftest 测试库）。
- 已运行在 `:8000` 的是 dev server，用于手动 / 契约核对，**不是**自动化测试目标。
- 每个里程碑收尾门禁：后端 `ruff check app/ tests/` + `pytest` 全绿；涉及前端时 `npm run typecheck && npx eslint && npx prettier --check && npm run test` 全绿。
- 所有新增字段一律 **nullable / optional**，`extra="allow"` 保证旧 payload 向后兼容；迁移必须可 `downgrade`。

## 2. 现状基线（评估摘要）

- 「三套真相」并存且不强一致；`FieldDefinition` 已 seed **67** 条字段定义，但只喂前端表单，未被校验 / 导出 / 规范消费。
- 已 seed 的 `vocab_key`：`material_system, sample_env, precursor_method, precursor_brand, substrate_role, substrate_type, substrate_brand, substrate_size, substrate_treatment_method(+遗留 substrate_treatment), gas_label(+遗留 gas), characterization_method, quality_label, layer_count`。
- `cvd_analysis_v1` 单条导出已是扁平长表（tidy data），形状接近 AI-Ready；缺批量入口与服务端按 payload 字段筛选。
- 失败模型过薄：仅一个扁平 `quality_label` 枚举（success/partial/failed/unknown）。
- 单位为隐含约定（字段名后缀）；`FieldDefinition.unit` 已有单位字符串但无人消费；`size_mm` 是字符串。

---

## 3. 里程碑

### M1 — 字段字典一致性守卫 ⭐ 先做（backbone）

**目标**：让 `FieldDefinition` 成为可信规范层，加守卫测试锁定其与 Pydantic / 词表不漂移。这是后续所有里程碑「不再制造漂移」的前提。

**先写的测试**（`backend/tests/standard/test_field_dictionary_consistency.py`）
- `T1.1 词表无悬空引用`：每个 `FieldDefinition.vocab_key`（非空）在 `controlled_vocabularies` 至少有 1 条 `is_active` 条目。
- `T1.2 下拉必须有词表`：`field_type ∈ {select, multi_select}` 的字段，必须有 `vocab_key`，或登记在显式例外白名单（如 `basic_info.operator_id` → 用户表、`basic_info.experiment_type`）。
- `T1.3 字段存在性`：每条 `FieldDefinition(module_key, field_key)` 能映射到对应 Pydantic 模型「已声明或 `extra=allow` 允许」的字段（list 型模块映射到 item 模型）。
- `T1.4 反向覆盖`：每个 Pydantic「面向用户的标量字段」都有对应 `FieldDefinition`；结构性字段（`node_index / components / fraction / ratio_percent` 等）登记在白名单中豁免。

**实现要点**：建 `introspection` helper（从 `MODULE_PAYLOAD_MODELS` 抽字段集）；修补 seed 漂移；把例外白名单显式写进测试常量（自带文档性）。

**验收**：守卫测试全绿；`ruff + pytest` 绿。

---

### M2 — 失败 / 结果模型 ⭐ 最紧迫（阶段 2.1）

**目标**：把扁平 `quality_label` 升级为可分析的失败 / 结果模型；确保失败炉次是**一等记录**（true negative）；明确 `null`（未测）vs `0`（测得为零）。**理由**：失败数据是核心差异化，且现在不记就永远丢。

**设计**
- 新增受控词表 `failure_mode`（分组 v0.1，待师兄确认）：
  - 成核与覆盖：`no_growth`, `sparse_nucleation`, `low_coverage`
  - 形貌与厚度：`multilayer`, `discontinuous`, `poor_uniformity`
  - 结晶质量：`wrong_phase`, `amorphous`
  - 污染与损伤：`contamination`, `cracked`
  - 设备 / 工艺：`equipment_fault`（漏气 / 控温失败 / MFC 异常）
  - 其他：`other`
- 扩展 `ResultSummaryPayload` + 对应 `FieldDefinition`：
  - `failure_modes`: `multi_select` → `failure_mode`（仅当 `quality_label ∈ {partial, failed}` 有意义）
  - `failure_detail`: `textarea`（结构化「为什么」）
- `null` vs `0` 约定：文档化「未填=未测/不适用」，沿用 gas-flow 修复口径（`is None` 而非真值判断）。
- 失败炉次一等化：核对 submit 流程允许 `quality_label=failed` 正常提交并留存。

**先写的测试**（`backend/tests/api/test_result_summary_failure_model.py` 等）
- `T2.1` `failure_mode` 词表 seed 后可按分组列出。
- `T2.2` `result_summary` payload 接受并规范化 `failure_modes / failure_detail`。
- `T2.3` 提交一个 `failed` 实验能成功留存（true negative 不被丢弃）。
- `T2.4` `cvd_analysis_v1` 导出包含 `failure_modes`。
- `T2.5` M1 守卫仍绿（新字段已同步进 `FieldDefinition`）。

**验收**：以上全绿；迁移可回滚。

---

### M3 — 词表分组与排序（友好化①）

**目标**：解决「列表长 / 无分组 / 排序乱」。

**设计**
- `ControlledVocabulary` 增加 `group_key: str | None` 与 `group_label_zh/en`（或用 `metadata_json` 承载分组标签，二选一，在实现时定）；复用 `sort_order`。
- list 接口返回按 `group_key, sort_order` 排序，并带分组元信息。
- 前端 `VocabularyCombobox` 渲染分组（grouped options）。
- 对长词表（`substrate_type / gas_label / failure_mode`）补 `group_key` 与合理 `sort_order` 的迁移。

**并入本里程碑的前端**：M2 失败模型的录入 UI——`result_summary` 的 `failure_modes`
（`multi_select` → `failure_mode`）需要一个多选词表组件 + `failure_detail` 文本域，
与本里程碑的 combobox 改造同属一块，一起做。

**先写的测试**
- `T3.1` 迁移后 vocab 带 `group_key`；list 接口按组 + 序返回。
- `T3.2`（前端 vitest）combobox 分组渲染 + 失败模式多选。

**验收**：后端 + 前端门禁全绿。

---

### M4 — 词表管理增强（友好化②）

**目标**：让管理员方便地增删改 / 排序 / 分组 / 启停词表。

**先做现状核对**：已有 admin `create/update/list`；核对是否缺 reorder / 分组编辑 / 前端管理页（`frontend-next` 是否有词表管理界面）。
**设计**：按核对结果补 reorder 端点 + group 编辑；若前端无管理页则补一个。

**先写的测试**：admin reorder / group 更新端点契约测试 + 权限（仅 ADMIN）。

**验收**：全绿。

---

### M5 — 规范产物生成（阶段 1 下半：发布）

**目标**：从 `FieldDefinition`(+Pydantic) **自动生成** ① JSON Schema（机读）② 人读《CVD-2D 工艺数据字段字典 v0.1》，带语义版本号。这是第一次有「一份可对外展示的标准」。

**设计**：一个生成器（`app/commands/` 命令或只读端点）；版本 `cvd_v1` → 标准号 `cvd-2d-process 1.0.0`；输出落到 `docs/standard/generated/`。

**先写的测试**
- `T5.1` 生成的 JSON Schema 能校验一份已知良好 payload 通过、坏 payload 失败。
- `T5.2` 生成的字段字典覆盖所有 active 字段且带单位。

**验收**：全绿；生成产物纳入仓库。

---

### M6 — 后续（本轮不执行，仅登记）

单位显式化（消费 `FieldDefinition.unit` + `size_mm` 数值化 + QUDT 映射）；可查询性（`payload_json` GIN 索引 + JSONB 过滤查询）；批量 / 流式 `analysis` 导出端点；OPTIMADE `_prefix_` 导出；数据集 DOI / 版本化发布；多机构租户 + 分级共享 + 禁运期。

---

## 4. 执行顺序与里程碑依赖

```
M1（守卫）──→ M2（失败模型，依赖 M1 防漂移）
          └─→ M3（词表分组）──→ M4（词表管理）
M2 + M3 完成后 ──→ M5（规范产物生成）
```

逐个里程碑红→绿→重构→门禁，每完成一个提交一次。
