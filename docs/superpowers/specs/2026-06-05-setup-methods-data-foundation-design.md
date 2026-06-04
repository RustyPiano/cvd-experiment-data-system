# CVD 实验 Setup / Methods 数据底座设计

**日期**：2026-06-05
**状态**：待评审
**文档类型**：Explanation + Reference
**范围**：实验 setup/methods 必填上下文、setup 模板、实验快照、提交校验、导出与分阶段路线
**前置文档**：`cvd_experiment_data_system_design_v1.md`、`AGENT_IMPLEMENTATION_BRIEF.md`、`DESIGN.md`

---

## 1. 文档目标

本设计把导师关于 experimental setup / methods 的组会意见转成可实施的系统规格。

目标是让 CVD 实验记录不只保存温度、时间、距离、气流等可调参数，还必须保存这些参数所依赖的装置、流程、样品放置和 methods 语义上下文。系统后续用于主动学习、材料科研 Agent、数据挖掘和科研诚信监督时，必须能区分不同 setup 下表面相同但科学含义不同的数据。

本设计面向：

- 后续实现该功能的开发者和代码 Agent
- 负责组内数据规范推广的管理员
- 需要向导师或外部合作方解释系统定位的人

## 2. 背景与问题

当前系统已具备实验主记录、模块化 payload、样品、文件、审计、字段字典、Recipe 和管理员看板。现有实验编辑器覆盖：

```text
基础信息 -> 环境条件 -> 预检查 -> 前驱体 -> 基底 -> 炉温程序
-> 气体程序 -> 过程观察 -> 表征结果 -> 结果总结
```

这个结构适合记录 CVD 参数，但缺少一个关键层：**experimental setup / methods**。

缺少该层会导致三个问题：

1. **数据不可比风险**：不同 setup 下相同数值不等价。例如北航准平衡生长和组内快速 CVD 都记录 800 ℃，但这个温度对应的传热、反应动力学和生长语义可能完全不同。
2. **数据挖掘污染**：主动学习或 Agent 如果只读取数值字段，会把不同 setup 的数据混成同一分布。
3. **科研记录不可复核**：只有参数，没有装置图、论文式 methods 和样品放置说明，后续很难判断实验是否可复现。

因此，setup/methods 不能是可选备注，必须成为实验记录的可比性边界。

## 3. 设计原则

### 3.1 Setup 是一等语义对象

Setup 不是 Recipe 的描述字段，也不是结果总结里的备注。它描述实验参数成立的物理和方法上下文，包括装置、流程、样品放置、methods 文字、论文来源和外部机构差异。

### 3.2 历史实验以快照为准

Setup 模板后续可能被管理员修改。历史实验不能回读当前模板，否则旧实验的 methods 语义会漂移。因此每次实验必须保存独立的 setup snapshot。

### 3.3 强制点放在提交前

草稿阶段允许 setup/methods 不完整，但系统应持续提示。提交或锁定前必须满足 setup/methods 门禁，避免用户为了快速记录而绕开系统。

### 3.4 模板降低填写成本

实验者不应每次重写一段 methods。常规流程应是选择模板、确认本次是否一致，如有偏差再填写 deviation。

### 3.5 导出必须携带 setup 分组键

JSON、Excel 和 analysis export 必须显式包含 setup key/version/hash。下游主动学习和 Agent 接口不能只拿温度、流量、位置等数值字段。

## 4. 范围定义

本设计包含：

- 新增 Setup / Methods 实验步骤
- 新增 setup 模板概念
- 新增每次实验的 setup snapshot
- 提交前校验规则
- setup 图与文件资产的关联策略
- JSON、Excel、analysis export 的输出要求
- 组内推广和北航外部用户的第一版流程
- V1、V1.5、V2 分阶段路线

本设计不包含：

- 复杂装置图在线绘制器
- 自动从论文、PPT 或 Excel 抽取 methods 的 AI 流程
- 完整 LIMS/ELN 替代品
- 多级审批流
- 装置本体、知识图谱或跨机构通用 ontology
- 实时仪器采集
- 高级主动学习闭环算法
- DOI 自动抓取和论文元数据同步

## 5. 核心设计决策

### 5.1 推荐方案：Setup Template + Experiment Setup Snapshot

采用混合方案：

| 对象 | 职责 |
|---|---|
| `experimental_setups` | 可复用、可版本化的 setup/methods 模板 |
| `experiment_setup_snapshots` | 某次实验实际采用的 setup/methods 历史事实 |
| `recipes` | 参数默认值模板，可引用推荐 setup，但不承载 setup 语义 |
| `experiment_module_payloads` | 继续保存前驱体、基底、炉温、气体等模块 payload |

Recipe 与 Setup 的边界：

- Recipe 回答“这炉参数默认怎么填”。
- Setup 回答“这些参数在哪种装置和 methods 语义下成立”。
- 多个 Recipe 可以共享一个 Setup。
- 同一个 Recipe 在不同 Setup 下执行时，数据不能直接混合。

### 5.2 反对方案

#### 只加 `methods_note`

实现最快，但不满足导师意见。它无法强制装置图、样品放置、反应流程和论文来源，也无法稳定支持分析分组。

#### 只加普通 JSONB 模块

可以快速接入现有编辑器，但缺少模板复用、版本、文件关联和稳定分组键。后续 analysis export 容易继续把不同 setup 的数值混在一起。

#### 把 setup 放进 Recipe

Recipe 是参数模板，不是方法上下文。把 setup/methods 放进 Recipe 会让职责混乱，并且无法表达多个 Recipe 共享同一 setup 的场景。

#### 只建 setup 模板，不保存实验快照

模板后续修改会污染历史实验。科研记录必须保存当时采用的 methods 原文和图。

## 6. 数据模型设计

### 6.1 `experimental_setups`

用于保存可复用 setup/methods 模板。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `setup_key` | text | 稳定标识，例如 `group_fast_cvd`、`buaa_quasi_equilibrium` |
| `setup_version` | integer | 模板版本 |
| `name` | text | 展示名 |
| `experiment_type` | text | 适用实验类型 |
| `material_system` | text nullable | 适用材料体系，可空 |
| `institution` | text nullable | 组内、北航或其他外部机构 |
| `apparatus_description` | text | 装置或流程说明 |
| `methods_text` | text | 类似论文 methods 的文字说明 |
| `sample_placement_description` | text | 样品和前驱体放置方式说明 |
| `reaction_flow_description` | text | 反应流程上下文 |
| `reference_paper_url` | text nullable | 已发表论文链接 |
| `unpublished_reason` | text nullable | 未发表或无论文时的说明 |
| `diagram_file_asset_id` | UUID nullable | setup 示意图文件 |
| `status` | text | `draft` / `approved` / `deprecated` |
| `created_by_id` | UUID | 创建人 |
| `metadata_json` | JSONB | 低频扩展字段 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

约束：

- `(setup_key, setup_version)` 唯一。
- `approved` 模板必须包含 `methods_text`、`sample_placement_description`、`reaction_flow_description` 和示意图。
- 有论文时填写 `reference_paper_url`；未发表时填写 `unpublished_reason`。

`metadata_json` 可保存：

- 炉管尺寸
- 气路拓扑
- 压力 regime
- 温度测量位置
- MFC 或气路设备说明
- 额外参考资料
- 内部 protocol 链接
- 外部用户字段映射说明

这些字段第一版不进入强制列化，避免过度设计。

### 6.2 `experiment_setup_snapshots`

用于保存每次实验实际采用的 setup/methods。提交、锁定、导出和分析均以该表为准。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `experiment_run_id` | UUID unique | 所属实验 |
| `experimental_setup_id` | UUID nullable | 来源模板，可空 |
| `setup_key_snapshot` | text nullable | 模板 key 快照 |
| `setup_name_snapshot` | text | setup 名称快照 |
| `setup_version_snapshot` | integer nullable | 模板版本快照 |
| `institution_snapshot` | text nullable | 机构来源快照 |
| `apparatus_description_snapshot` | text | 装置说明快照 |
| `methods_text_snapshot` | text | methods 文字快照 |
| `sample_placement_description_snapshot` | text | 样品放置快照 |
| `reaction_flow_description_snapshot` | text | 反应流程快照 |
| `reference_paper_url_snapshot` | text nullable | 论文链接快照 |
| `unpublished_reason_snapshot` | text nullable | 未发表说明快照 |
| `diagram_file_asset_id` | UUID nullable | 本次实验使用的示意图 |
| `is_same_as_template` | boolean | 本次是否与模板一致 |
| `deviation_note` | text nullable | 与模板不一致时的偏差说明 |
| `confirmed_by_id` | UUID nullable | 确认人 |
| `confirmed_at` | timestamptz nullable | 确认时间 |
| `snapshot_hash` | text | 快照内容哈希 |
| `metadata_json` | JSONB | 低频扩展字段 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

校验要求：

- 每个实验最多一条 setup snapshot。
- 草稿阶段 `diagram_file_asset_id` 可空。
- 提交前必须有示意图、methods 文字、样品放置说明、反应流程说明和用户确认。
- `is_same_as_template=false` 时，`deviation_note` 必填。
- `reference_paper_url_snapshot` 与 `unpublished_reason_snapshot` 至少填写一个。

### 6.3 与 `experiment_module_payloads` 的关系

不建议把 setup snapshot 仅作为 `experiment_module_payloads` 中的普通 JSONB 模块保存。

原因：

- setup key/version/hash 是分析分组键，应列化。
- diagram 文件需要稳定 FK。
- snapshot 需要单独审计和锁定语义。
- 后续 Recipe 和外部用户模板会引用 setup。

前端仍可以把 `setup_methods` 当成编辑器 section 展示，但后端应有独立 snapshot 表承载核心数据。

### 6.4 与 `recipes` 的关系

Recipe 可增加可选字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `default_setup_id` | UUID nullable | 从 Recipe 创建实验时推荐使用的 setup 模板 |

从 Recipe 创建实验时：

1. 创建实验 draft。
2. 写入 Recipe 的参数模块 payload。
3. 如果 Recipe 有 `default_setup_id`，复制对应 Setup Template 为 `experiment_setup_snapshots`。
4. 实验者进入编辑器后确认 setup 是否一致。

### 6.5 文件资产关联

当前 `file_assets` 主要面向实验和样品，且 `method` 语义是表征方法。Setup diagram 不应使用 `method=Other` 伪装成表征文件。

分阶段设计：

#### V1

- setup diagram 先作为实验级文件上传。
- `experiment_setup_snapshots.diagram_file_asset_id` 指向该文件。
- 文件 metadata 中记录 `asset_role=setup_diagram`。
- 文件仍关联 `experiment_run_id`。

#### V1.5

给 `file_assets` 增加窄语义字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `experimental_setup_id` | UUID nullable | 关联 setup 模板 |
| `asset_role` | text | `characterization_file` / `setup_diagram` / `methods_attachment` |

这样 setup 模板也能拥有自己的示意图，创建实验时可复制或引用该图。

#### 暂缓

暂不做泛型 `file_asset_links(entity_type, entity_id, file_asset_id, role)`。它更通用，但第一版会增加查询、权限和导出复杂度。

## 7. 前端体验设计

### 7.1 编辑器步骤

调整为：

```text
基础信息 -> Setup / Methods -> 环境条件 -> 预检查 -> 前驱体 -> 基底
-> 炉温程序 -> 气体程序 -> 过程观察 -> 表征结果 -> 结果总结
```

Setup / Methods 放在基础信息之后，因为材料体系、实验类型和合作机构会影响可选 setup。它必须放在温度、气体、距离等参数之前，让用户先确认这些参数所属的 setup 语境。

### 7.2 填写流程

默认流程：

1. 用户创建实验。
2. 系统根据实验类型、材料体系、Recipe 或外部项目推荐 setup 模板。
3. 用户选择 setup 模板。
4. 系统自动带出示意图、methods 文字、论文链接、样品放置和反应流程。
5. 用户确认本次是否与模板一致。
6. 如果一致，一键确认。
7. 如果不一致，填写偏差说明并修改本次 snapshot。
8. 提交前系统检查 setup/methods 完整性。

没有模板时：

1. 用户选择“新建本次 setup”。
2. 必须填写 setup 名称、装置说明、methods、样品放置、反应流程。
3. 必须上传或关联示意图。
4. 已有论文则填写链接；未发表则填写未发表说明。
5. 提交后管理员可以将该 snapshot 提升为 setup template。

### 7.3 字段分层

| 层级 | 字段 | 行为 |
|---|---|---|
| 提交前必填 | setup 名称、示意图、methods、样品放置、反应流程、论文链接或未发表说明、用户确认 | 阻断提交 |
| 条件必填 | deviation note | 仅当本次与模板不一致时阻断提交 |
| 推荐字段 | 装置型号、炉管尺寸、气路、压力、温度测量位置、字段定义差异 | 显示完整性提示，不阻断提交 |
| 管理员预填 | 模板内容、字段解释、外部用户来源资料 | 降低实验者填写成本 |
| 实验者确认 | 本次是否沿用模板、实际偏差 | 记录责任和历史事实 |

### 7.4 完成度与提示

草稿阶段显示：

- 未选择 setup
- 缺少示意图
- 缺少 methods
- 缺少样品放置
- 缺少反应流程
- 缺少论文链接或未发表说明
- 未确认本次是否与模板一致

这些提示不阻断 autosave，但在提交前作为 errors 阻断。

## 8. 后端 API 设计

### 8.1 Setup 模板 API

管理端点：

```text
GET    /api/v1/admin/experimental-setups
POST   /api/v1/admin/experimental-setups
GET    /api/v1/admin/experimental-setups/{id}
PATCH  /api/v1/admin/experimental-setups/{id}
POST   /api/v1/admin/experimental-setups/{id}/approve
POST   /api/v1/admin/experimental-setups/{id}/deprecate
POST   /api/v1/admin/experimental-setups/{id}/new-version
```

普通用户可读端点：

```text
GET    /api/v1/experimental-setups
GET    /api/v1/experimental-setups/{id}
```

V1 可以先实现只读模板选择和管理员创建；模板审批、新版本和停用可以在 V1.5 完成。

### 8.2 实验 setup snapshot API

实验级端点：

```text
GET    /api/v1/experiments/{id}/setup-methods
PUT    /api/v1/experiments/{id}/setup-methods
POST   /api/v1/experiments/{id}/setup-methods/from-template
POST   /api/v1/experiments/{id}/setup-methods/confirm
```

行为：

- 只有 draft 实验允许编辑 snapshot。
- submitted / locked 实验不允许静默修改 setup snapshot。
- locked 实验如需修改，按现有规则 clone 后重新提交。
- snapshot 每次变更记录 audit event。

## 9. 提交校验

提交前校验服务新增 setup/methods 阻断规则。

Errors：

| 条件 | 错误 |
|---|---|
| 无 setup snapshot | `Setup / Methods is required` |
| 缺少 setup 名称 | `Setup name is required` |
| 缺少示意图 | `Setup diagram is required` |
| 缺少 methods 文字 | `Methods text is required` |
| 缺少样品放置说明 | `Sample placement description is required` |
| 缺少反应流程说明 | `Reaction flow description is required` |
| 论文链接和未发表说明均为空 | `Reference paper URL or unpublished reason is required` |
| 未确认本次 setup | `Setup confirmation is required` |
| 与模板不一致但无偏差说明 | `Deviation note is required when setup differs from template` |

Warnings：

| 条件 | 警告 |
|---|---|
| setup 模板状态不是 approved | `Setup template is not approved` |
| 推荐字段缺失 | `Recommended setup context is incomplete` |
| 外部用户 setup 未确认字段映射 | `External setup field mapping is not confirmed` |

完成度计算应把 setup/methods 纳入核心检查项。缺 setup/methods 的实验不应达到 100 分。

## 10. 导出与 Agent 数据接口

### 10.1 JSON export

JSON export 增加 `setup_methods`：

```json
{
  "setup_methods": {
    "setup_key_snapshot": "group_fast_cvd",
    "setup_name_snapshot": "组内快速 CVD",
    "setup_version_snapshot": 1,
    "institution_snapshot": "group",
    "methods_text_snapshot": "...",
    "sample_placement_description_snapshot": "...",
    "reaction_flow_description_snapshot": "...",
    "reference_paper_url_snapshot": null,
    "unpublished_reason_snapshot": "未发表，组内标准流程",
    "diagram_file_asset_id": "uuid",
    "is_same_as_template": true,
    "deviation_note": null,
    "snapshot_hash": "sha256..."
  }
}
```

导出必须读取 snapshot，不回读模板当前值。

### 10.2 Excel export

Excel 增加 `Setup & Methods` sheet。

字段：

- `setup_key_snapshot`
- `setup_name_snapshot`
- `setup_version_snapshot`
- `institution_snapshot`
- `apparatus_description_snapshot`
- `methods_text_snapshot`
- `sample_placement_description_snapshot`
- `reaction_flow_description_snapshot`
- `reference_paper_url_snapshot`
- `unpublished_reason_snapshot`
- `diagram_file_asset_id`
- `is_same_as_template`
- `deviation_note`
- `snapshot_hash`

### 10.3 Analysis export

Analysis export 不应只新增一张 setup row。为了避免下游忘记 join，以下分组字段应进入主要扁平行 context：

- `setup_key_snapshot`
- `setup_name_snapshot`
- `setup_version_snapshot`
- `institution_snapshot`
- `setup_snapshot_hash`

至少应出现在：

- experiment row
- furnace step rows
- furnace temperature rows
- furnace precursor rows
- gas program rows
- gas segment rows
- gas component rows
- characterization rows
- feature rows

这样主动学习和 Agent 默认不会把不同 setup 的数值混在一起。

## 11. 审计与锁定

### 11.1 Audit events

setup 模板记录：

- create
- update
- approve
- deprecate
- new_version

setup snapshot 记录：

- create_from_template
- manual_create
- update
- confirm
- change_deviation

Audit payload 应包含 before/after JSON，尤其保留 methods 文字和 deviation note 的变更。

### 11.2 Lock 语义

实验 locked 后：

- setup snapshot 不允许直接修改。
- setup template 后续修改不影响 locked 实验。
- export 使用 locked 时的 snapshot。
- `snapshot_hash` 可用于证明历史记录未被模板变更污染。

## 12. 组内推广流程

组内推广不应先讲网页操作，而应先讲数据结构：

1. 展示总表和字段分类。
2. 解释为什么 setup/methods 是可比性边界。
3. 展示几个组内标准 setup 模板。
4. 解释温度、流量、距离等字段在不同 setup 下的语义差异。
5. 快速演示网页填写、上传、查看和管理员看板。
6. 组会后若无重大异议，要求实验数据必须进入 database / 电子实验记录本。

系统内对应能力：

- 管理员维护 approved setup 模板。
- 字段字典解释每个字段含义、单位和适用 setup。
- 管理员看板显示缺 setup/methods 的实验。
- 提交门禁将 setup/methods 作为完成实验的条件。
- 例外通过必须记录原因并进入审计日志。

## 13. 北航外部用户流程

北航主动学习合作是第一类外部用户场景。外部用户不应从空表开始填。

第一版流程：

1. 管理员收集北航已有 PPT、论文、Excel、装置图和口头说明。
2. 管理员建立“北航某 setup”模板。
3. 系统预填 setup 图、methods、论文链接或来源说明、字段解释。
4. 管理员将北航现有 Excel 字段映射到系统字段。
5. 北航用户确认 setup 是否准确。
6. 北航用户补充主动学习变量之外的完整实验上下文。
7. 首批历史数据用 completeness score 标记完整度，不强求全自动清洗。

关键规则：

- 主动学习调的 5-6 个变量只是优化变量子集。
- 系统仍保留完整实验上下文、setup、methods、表征数据和文件。
- 北航字段按其实际 setup 适配，不机械复制组内字段。

## 14. 分阶段路线

### V1：先建立科研记录底线

交付：

- 新增 Setup / Methods 编辑器步骤。
- 新增实验 setup snapshot。
- 提交前强制 methods、示意图、样品放置、反应流程、论文链接或未发表说明。
- 导出 JSON/Excel/analysis 显式包含 setup snapshot。
- 完成度和 validation summary 纳入 setup/methods。
- setup diagram 作为实验级文件关联。

V1 不要求完整 setup 模板后台，但应支持从已有模板或手工输入创建 snapshot。

### V1.5：建立可复用 setup library

交付：

- 新增 `experimental_setups` 管理后台。
- 支持 draft / approved / deprecated 状态。
- 支持从 snapshot 提升为 template。
- 支持 Recipe 的 `default_setup_id`。
- 支持 setup 级示意图文件关联。
- 管理员看板显示缺 setup/methods、未确认 setup、未 approved setup 的实验。
- 支持北航第一版 setup 预填和字段说明。

### V2：平台化与 Agent 数据治理

交付：

- 外部用户字段映射管理。
- setup 相似性和可比性标签。
- Agent 数据质量评分。
- AI 辅助从论文/PPT/Excel 生成 setup 草稿。
- 多图、多引用和更结构化 apparatus 信息。
- 主动学习变量与完整实验上下文联合导出。

## 15. 风险与应对

| 风险 | 应对 |
|---|---|
| 用户把模板确认当形式主义 | 提供偏差确认，关键字段变更需填写 deviation note |
| 必填项太多导致绕开系统 | 草稿阶段不阻断，提交前才强制；优先模板预填 |
| 模板修改污染历史 | 实验保存 snapshot，导出只读 snapshot |
| setup 图混入表征文件 | 使用 `asset_role=setup_diagram`，不滥用 `method=Other` |
| Agent 仍只读取数值字段 | analysis export 将 setup key/version/hash 带入主要 rows |
| 外部用户字段定义不同 | 先预填和确认字段映射，不机械复制组内表头 |
| methods 文字过粗无法复核 | 提交前要求样品放置和反应流程单独填写 |

## 16. 验收标准

V1 完成时应满足：

1. 新实验编辑器包含 Setup / Methods 步骤。
2. 草稿可以保存不完整 setup/methods。
3. 提交时缺 setup/methods 必填项会被阻断。
4. 至少能上传或关联 setup diagram。
5. 实验导出 JSON 包含 setup snapshot。
6. Excel 导出包含 `Setup & Methods` sheet。
7. Analysis export 的主要行包含 setup key/version/hash。
8. locked 实验导出不受 setup template 后续修改影响。
9. 管理员能识别缺 setup/methods 的实验。
10. 北航外部用户可以通过预填 setup 模板开始确认，而不是从空表填写。

## 17. 实施边界说明

该设计不要求一次性完成所有后台和外部用户能力。第一轮实现应优先保证：

- 每条实验提交前有 setup snapshot。
- snapshot 中包含图、methods、样品放置和反应流程。
- 导出和 analysis 不会丢失 setup 分组键。

只要这三点完成，系统就从“参数记录表单”推进到“可追溯、可复核、可用于 Agent 的科研数据底座”。
