# CVD 实验 Setup / Methods 数据底座设计

**日期**：2026-06-05
**状态**：已根据实现边界评审修订
**文档类型**：Explanation + Reference
**范围**：实验 setup/methods 必填上下文、实验快照、提交/锁定校验、导出与分阶段路线
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

### 3.3 强制点放在提交和锁定前

草稿阶段允许 setup/methods 不完整，但系统应持续提示。提交或锁定前必须满足 setup/methods 门禁，避免用户为了快速记录而绕开系统。

### 3.4 模板降低填写成本

实验者不应每次重写一段 methods。常规流程应是选择模板、确认本次是否一致，如有偏差再填写 deviation。

### 3.5 导出必须携带 setup 分组键

JSON、Excel 和 analysis export 必须显式包含 setup key/version/hash。下游主动学习和 Agent 接口不能只拿温度、流量、位置等数值字段。

## 4. 范围定义

本设计包含：

- 新增 Setup / Methods 实验步骤
- 新增每次实验的 setup snapshot
- 提交和锁定前校验规则
- setup 图作为实验级文件资产的关联策略
- JSON、Excel、analysis export 的输出要求
- 组内推广流程
- 北航外部用户预填流程的 V1.5 边界
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
- V1 内完整 `experimental_setups` 管理后台
- V1 内 Recipe 默认 setup 绑定
- V1 内北航字段映射管理

## 4.1 V1 实施边界

首轮实现必须收敛为 V1，不跨入模板库平台化：

- V1 建立 `experiment_setup_snapshots`，每条实验提交和锁定前必须有 snapshot。
- V1 可提供少量“种子 setup 模板”用于复制到 snapshot，但不要求持久化 `experimental_setups` 表和管理后台。
- V1 支持手工创建本次实验 setup snapshot。
- V1 对 submit 和 lock 都执行 setup/methods 门禁。
- V1 的 setup diagram 只作为当前实验的文件资产上传，并通过 `asset_role=setup_diagram` 标识。
- V1 导出 JSON、Excel 和 analysis rows 时必须使用 snapshot，不读取任何当前模板。

后续 `experimental_setups` 持久化模板库、Recipe `default_setup_id`、模板级文件关联和北航字段映射管理进入 V1.5/V2。

## 5. 核心设计决策

### 5.1 推荐方案：Experiment Setup Snapshot 优先，Setup Template 后续平台化

采用混合方案：

| 对象 | 职责 |
|---|---|
| `experiment_setup_snapshots` | V1 必做；某次实验实际采用的 setup/methods 历史事实 |
| 种子 setup 模板 | V1 可选；以代码或种子数据提供少量可复制模板，不提供完整管理后台 |
| `experimental_setups` | V1.5；可复用、可版本化的 setup/methods 模板库 |
| `recipes` | 参数默认值模板；V1.5 后可引用推荐 setup，但不承载 setup 语义 |
| `experiment_module_payloads` | 继续保存前驱体、基底、炉温、气体等模块 payload |

Recipe 与 Setup 的边界：

- Recipe 回答“这炉参数默认怎么填”。
- Setup 回答“这些参数在哪种装置和 methods 语义下成立”。
- V1 的 Recipe 不保存 setup 绑定，避免首轮把模板库和 Recipe 改造耦合在一起。
- V1.5 后多个 Recipe 可以共享一个 Setup。
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

### 6.1 `experiment_setup_snapshots`（V1）

用于保存每次实验实际采用的 setup/methods。提交、锁定、导出和分析均以该表为准。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `experiment_run_id` | UUID unique | 所属实验 |
| `source_template_key` | text nullable | 来源种子模板 key；手工 setup 可空 |
| `source_template_version` | integer nullable | 来源种子模板版本；手工 setup 可空 |
| `setup_key_snapshot` | text nullable | 分析分组 key；模板来源保存时使用模板 key，手工 setup 在确认/提交/锁定时使用 `manual:<snapshot_hash_prefix>` |
| `setup_name_snapshot` | text | setup 名称快照 |
| `setup_version_snapshot` | integer | 分析分组版本；模板来源使用模板版本，手工 setup 固定为 `1` |
| `institution_snapshot` | text nullable | 机构来源快照 |
| `apparatus_description_snapshot` | text | 装置说明快照 |
| `methods_text_snapshot` | text | methods 文字快照 |
| `sample_placement_description_snapshot` | text | 样品放置快照 |
| `reaction_flow_description_snapshot` | text | 反应流程快照 |
| `reference_paper_url_snapshot` | text nullable | 论文链接快照 |
| `unpublished_reason_snapshot` | text nullable | 未发表说明快照 |
| `diagram_file_asset_id` | UUID nullable | 本次实验使用的示意图 |
| `is_same_as_template` | boolean | 本次是否与来源模板一致；手工 setup 固定为 `false` |
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
- 提交和锁定前必须有示意图、methods 文字、样品放置说明、反应流程说明和用户确认。
- `is_same_as_template=false` 且 `source_template_key` 非空时，`deviation_note` 必填。
- `reference_paper_url_snapshot` 与 `unpublished_reason_snapshot` 至少填写一个。
- 草稿阶段允许 `setup_key_snapshot` 为空。确认、提交和锁定前不允许为空。
- 手工 setup 在确认、提交或锁定校验时生成 `manual:<snapshot_hash 前 16 位>`。
- `setup_version_snapshot` 不允许为空。手工 setup 使用 `1`。

### 6.2 `snapshot_hash` 规则

`snapshot_hash` 用于证明实验导出使用的是当时的 methods 快照，而不是后续被修改的模板。

哈希算法：

1. 取 canonical JSON。
2. 按 key 排序。
3. 去除值为 `null` 的可选字段。
4. 使用 UTF-8 编码。
5. 计算 SHA-256，保存为小写十六进制字符串。

纳入哈希的字段：

- `setup_name_snapshot`
- `setup_version_snapshot`
- `institution_snapshot`
- `apparatus_description_snapshot`
- `methods_text_snapshot`
- `sample_placement_description_snapshot`
- `reaction_flow_description_snapshot`
- `reference_paper_url_snapshot`
- `unpublished_reason_snapshot`
- setup diagram 文件的 `sha256`
- `is_same_as_template`
- `deviation_note`
- `metadata_json.semantic_context`

不纳入哈希的字段：

- `id`
- `experiment_run_id`
- `source_template_key`
- `source_template_version`
- `setup_key_snapshot`
- `diagram_file_asset_id`
- `confirmed_by_id`
- `confirmed_at`
- `created_at`
- `updated_at`
- `snapshot_hash`

说明：

- 不把 `setup_key_snapshot` 纳入哈希，是为了允许手工 setup 使用 `manual:<snapshot_hash 前 16 位>` 作为稳定分组 key。
- diagram 使用文件内容 `sha256`，不使用文件 ID，避免同一文件重新上传后 hash 不必要变化。
- `metadata_json.semantic_context` 全量参与 hash。
- `metadata_json` 其他 key 不参与 hash，只能放 UI 状态、导入来源、显示偏好等非语义元数据。
- 每次保存影响哈希字段时，后端必须重算 `snapshot_hash`。
- 如果 `source_template_key` 为空，后端每次重算 `snapshot_hash` 后必须同步更新 `setup_key_snapshot=manual:<snapshot_hash 前 16 位>`。
- 如果 `source_template_key` 非空，`setup_key_snapshot` 始终使用模板 key，不随 hash 变化。

### 6.3 `experimental_setups`（V1.5）

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

### 6.4 与 `experiment_module_payloads` 的关系

不建议把 setup snapshot 仅作为 `experiment_module_payloads` 中的普通 JSONB 模块保存。

原因：

- setup key/version/hash 是分析分组键，应列化。
- diagram 文件需要稳定 FK。
- snapshot 需要单独审计和锁定语义。
- 后续 Recipe 和外部用户模板会引用 setup。

前端仍可以把 `setup_methods` 当成编辑器 section 展示，但后端应有独立 snapshot 表承载核心数据。

### 6.5 与 `recipes` 的关系

V1 不修改 Recipe schema，不把 setup snapshot 写入 `default_payload_json`。

V1.5 后，Recipe 可增加可选字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `default_setup_id` | UUID nullable | 从 Recipe 创建实验时推荐使用的 setup 模板 |

V1.5 从 Recipe 创建实验时：

1. 创建实验 draft。
2. 写入 Recipe 的参数模块 payload。
3. 如果 Recipe 有 `default_setup_id`，复制对应 Setup Template 为 `experiment_setup_snapshots`。
4. 实验者进入编辑器后确认 setup 是否一致。

### 6.6 文件资产关联

当前 `file_assets` 主要面向实验和样品，且 `method` 语义是表征方法。Setup diagram 不应使用 `method=Other` 伪装成表征文件。

分阶段设计：

#### V1

- setup diagram 作为实验级文件上传，必须关联 `experiment_run_id`。
- V1 种子模板可以包含 packaged diagram 文件。`from-template` 复制模板时，如果模板带图，后端必须把 packaged diagram 物化为当前实验的一条 `file_assets` 记录，并将 snapshot 指向新文件。
- `file_assets` 新增 `asset_role` 字段，默认值为 `characterization_file`。
- 上传 API 新增 `asset_role` 表单字段。
- `asset_role=characterization_file` 时，`method` 必填，行为保持现状。
- `asset_role=setup_diagram` 时，`sample_id` 必须为空，`method` 可省略；后端保存技术值 `method="setup_diagram"`，但 UI、过滤和校验应以 `asset_role` 区分它和表征文件。
- `file_category` 可继续使用 `raw`，不把 setup diagram 伪装成 `method=Other`。
- `experiment_setup_snapshots.diagram_file_asset_id` 指向该文件。
- setup diagram 文件删除前，如果被 snapshot 引用，应阻止删除或要求先解除引用。

`PUT /experiments/{id}/setup-methods` 保存 `diagram_file_asset_id` 时必须校验：

- 文件存在且未软删除。
- 文件的 `experiment_run_id` 等于当前实验 ID。
- 文件的 `asset_role` 是 `setup_diagram`。
- 文件的 `sample_id` 为空。
- 当前用户有权限访问该实验。

不满足以上任一条件时，后端返回 422，不允许把其他实验文件、表征文件或样品文件挂成 setup diagram。

种子模板 diagram 物化失败时，`from-template` 仍可保存文字 snapshot，但必须让 `diagram_file_asset_id` 为空，并返回 warning；提交/锁定前仍由 validation 阻断，要求用户重新上传或选择当前实验的 setup diagram。

#### V1.5

支持模板级文件时，需要解决当前 `file_assets.experiment_run_id` 非空的问题。V1.5 可采用窄语义迁移：

| 字段 | 类型 | 说明 |
|---|---|---|
| `experimental_setup_id` | UUID nullable | 关联 setup 模板 |
| `experiment_run_id` | UUID nullable | 改为可空 |

约束：

- `asset_role` 继续用于区分 `characterization_file`、`setup_diagram`、`methods_attachment`。
- `asset_role=setup_diagram` 时，`experiment_run_id` 和 `experimental_setup_id` 至少一个非空。
- 模板级 setup diagram 可以只关联 `experimental_setup_id`，不需要实验 ID。
- 创建实验 snapshot 时，可以复制模板图为实验文件，也可以引用模板图；如果引用模板图，导出必须仍记录该文件的 `sha256`。

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
2. V1 根据实验类型、材料体系显示种子 setup 模板；V1.5 可结合 Recipe 或外部项目推荐 setup 模板。
3. 用户选择 setup 模板。
4. 系统自动带出 methods 文字、论文链接、样品放置和反应流程；如果种子模板包含 packaged diagram，后端会尝试复制成当前实验的 setup diagram 文件。
5. 用户确认本次是否与模板一致。
6. 如果一致，一键确认。
7. 如果不一致，填写偏差说明并修改本次 snapshot。
8. 提交和锁定前系统检查 setup/methods 完整性。

没有模板时：

1. 用户选择“新建本次 setup”。
2. 必须填写 setup 名称、装置说明、methods、样品放置、反应流程。
3. 必须上传或关联示意图。
4. 已有论文则填写链接；未发表则填写未发表说明。
5. V1.5 后，管理员可以将该 snapshot 提升为 setup template。

### 7.3 前端 section 契约

`setup_methods` 是编辑器 section，但不是 `experiment_module_payloads` module。

前端实现必须遵守：

- `editorSectionKeys` 增加 `setup_methods`。
- `setup_methods` 的 autosave 不调用 `/experiments/{id}/modules/{module_key}`。
- `setup_methods` 使用独立 API：`GET/PUT /experiments/{id}/setup-methods` 和 `POST /setup-methods/confirm`。
- dirty state、save state、leave guard、completion indicator、validation summary 仍按 section key `setup_methods` 展示。
- 后端 validation issue 的 `module_key` 使用 `setup_methods`，方便前端跳转到该 section。
- `setup_methods` 不加入 `ExperimentModuleKey`，也不写入 `experiment_module_payloads`。

### 7.4 确认与失效规则

确认是对“本次实验 setup snapshot 当前内容”的确认，不是永久状态。

后端必须强制：

- `POST /setup-methods/from-template` 复制模板内容后，清空 `confirmed_by_id` 和 `confirmed_at`。
- `PUT /setup-methods` 修改任何哈希字段后，清空 `confirmed_by_id` 和 `confirmed_at`。
- `PUT /setup-methods` 修改 diagram 后，清空 `confirmed_by_id` 和 `confirmed_at`。
- `is_same_as_template=true` 时，如果用户修改了来自模板的核心字段，后端应自动设为 `is_same_as_template=false` 并要求 `deviation_note`。
- `POST /setup-methods/confirm` 仅在必填字段齐全、hash 已重算、deviation 规则满足时成功。
- 手工 setup 的 `is_same_as_template` 固定为 `false`，但不要求 deviation note，因为没有来源模板可偏离。

### 7.5 字段分层

| 层级 | 字段 | 行为 |
|---|---|---|
| 提交/锁定前必填 | setup 名称、示意图、methods、样品放置、反应流程、论文链接或未发表说明、用户确认 | 阻断提交和锁定 |
| 条件必填 | deviation note | 仅当本次来源于模板且与模板不一致时阻断提交 |
| 推荐字段 | 装置型号、炉管尺寸、气路、压力、温度测量位置、字段定义差异 | 显示完整性提示，不阻断提交 |
| 管理员预填 | 模板内容、字段解释、外部用户来源资料 | 降低实验者填写成本 |
| 实验者确认 | 本次是否沿用模板、实际偏差 | 记录责任和历史事实 |

### 7.6 完成度与提示

草稿阶段显示：

- 未选择 setup
- 缺少示意图
- 缺少 methods
- 缺少样品放置
- 缺少反应流程
- 缺少论文链接或未发表说明
- 未确认本次是否与模板一致

这些提示不阻断 autosave，但在提交和锁定前作为 errors 阻断。

## 8. 后端 API 设计

### 8.1 V1 种子 setup 模板 API

V1 不实现完整 `experimental_setups` 管理后台。若需要模板选择，只提供只读种子模板：

```text
GET    /api/v1/setup-method-templates
GET    /api/v1/setup-method-templates/{template_key}?version={template_version}
```

这些模板可以来自代码内置数据或迁移种子数据。它们只用于复制为实验 snapshot，不提供用户编辑、审批、废弃或版本管理。种子模板仍必须有显式 `template_key` 和 `template_version`；`GET /setup-method-templates/{template_key}` 未传 version 时返回该 key 的当前版本，并在响应中包含 resolved `template_version`。

V1.5 才引入持久化 setup 模板管理 API：

```text
GET    /api/v1/admin/experimental-setups
POST   /api/v1/admin/experimental-setups
GET    /api/v1/admin/experimental-setups/{id}
PATCH  /api/v1/admin/experimental-setups/{id}
POST   /api/v1/admin/experimental-setups/{id}/approve
POST   /api/v1/admin/experimental-setups/{id}/deprecate
POST   /api/v1/admin/experimental-setups/{id}/new-version
GET    /api/v1/experimental-setups
GET    /api/v1/experimental-setups/{id}
```

### 8.2 实验 setup snapshot API

实验级端点：

```text
GET    /api/v1/experiments/{id}/setup-methods
PUT    /api/v1/experiments/{id}/setup-methods
POST   /api/v1/experiments/{id}/setup-methods/from-template
POST   /api/v1/experiments/{id}/setup-methods/confirm
```

`POST /setup-methods/from-template` 请求体：

```json
{
  "template_key": "group_fast_cvd",
  "template_version": 1
}
```

`template_version` 必填。前端如果想使用当前版本，必须先调用模板列表或详情接口取得 resolved version，再把具体版本提交给 `from-template`。这样 snapshot 的 `source_template_version` 和 `setup_version_snapshot` 没有歧义。

行为：

- 只有 draft 实验允许编辑 snapshot。
- submitted / locked 实验不允许静默修改 setup snapshot。
- locked 实验如需修改，按现有规则 clone 后重新提交。
- snapshot 每次变更记录 audit event。
- `from-template` 在 V1 读取种子模板；V1.5 后可读取 `experimental_setups`。
- V1 `from-template` 如果种子模板带 packaged diagram，必须尝试复制为当前实验的 `asset_role=setup_diagram` 文件；复制失败时 snapshot 文字仍可保存，但 `diagram_file_asset_id` 为空并返回 warning。

### 8.3 Clone 与 Recipe 语义

#### Clone 实验

从已有实验 clone 时：

1. 复制 source 的 setup snapshot 内容到新 draft。
2. 保留 methods、样品放置、反应流程、reference、unpublished reason、`is_same_as_template` 和 `deviation_note`。
3. 如果 source snapshot 有 `diagram_file_asset_id`，后端必须复制该文件为 target 实验的新 `file_assets` 行，并把 target snapshot 的 `diagram_file_asset_id` 指向新文件。
4. 如果 diagram 文件复制失败，target snapshot 的 `diagram_file_asset_id` 必须清空，并在返回或后续 validation 中提示用户重新上传 setup diagram。
5. 清空 `confirmed_by_id` 和 `confirmed_at`。
6. 重新计算 `snapshot_hash`。
7. 新实验提交/锁定前必须由当前用户重新确认 setup。

这样可以复用上下文，但不会把原实验者的确认直接转移到新实验。

#### 从 Recipe 创建实验

V1 的 Recipe 不包含 setup 绑定。从 Recipe 创建实验时：

- 只复制 Recipe 的参数模块 payload。
- 不自动创建 setup snapshot，除非用户随后选择种子 setup 模板。
- 提交/锁定前仍必须补齐并确认 setup snapshot。

V1.5 引入 `recipes.default_setup_id` 后，才允许从 Recipe 自动复制 setup 模板为 snapshot，并同样要求实验者重新确认。

#### 保存为 Recipe

V1 从实验保存为 Recipe 时，不把 setup snapshot 写入 `default_payload_json`。

V1.5 后，如果 source 实验的 snapshot 来自 approved setup template，可以将该 template 作为 `default_setup_id` 写入 Recipe；如果 source 是手工 setup，只允许管理员先提升为 setup template，再绑定到 Recipe。

## 9. 提交与锁定校验

提交和锁定前校验服务都必须执行 setup/methods 阻断规则。

当前后端 `submit_experiment` 已调用 experiment validation；V1 实现时 `lock_experiment` 也必须调用同一套 validation。否则旧的 submitted 实验可能绕过 setup/methods 门禁直接 locked。

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
| 来源于模板且与模板不一致但无偏差说明 | `Deviation note is required when setup differs from template` |

Warnings：

| 条件 | 警告 |
|---|---|
| 推荐字段缺失 | `Recommended setup context is incomplete` |

V1 不检查外部字段映射或模板审批状态，因为字段映射管理和 approved 模板状态不在 V1 范围内。外部用户字段差异只能记录在 setup snapshot 的 `metadata_json` 或管理员说明中。V1.5/V2 引入字段映射实体和 approved setup template 后，再增加对应 warning，例如 `Setup template is not approved`。

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
    "apparatus_description_snapshot": "...",
    "methods_text_snapshot": "...",
    "sample_placement_description_snapshot": "...",
    "reaction_flow_description_snapshot": "...",
    "reference_paper_url_snapshot": null,
    "unpublished_reason_snapshot": "未发表，组内标准流程",
    "diagram_file_asset_id": "uuid",
    "is_same_as_template": true,
    "deviation_note": null,
    "semantic_context": {},
    "confirmed_by_id": "uuid",
    "confirmed_at": "2026-06-05T10:00:00Z",
    "snapshot_hash": "sha256..."
  }
}
```

导出必须读取 snapshot，不回读模板当前值。

`semantic_context` 是 `metadata_json.semantic_context` 的导出值。它参与 `snapshot_hash`，因此 JSON 和 Excel 导出必须保留该字段。

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
- `semantic_context`
- `confirmed_by_id`
- `confirmed_at`
- `snapshot_hash`

### 10.3 Analysis export

Analysis export 不应只新增一张 setup row。为了避免下游忘记 join，以下分组字段应进入主要扁平行 context：

- `setup_key_snapshot`
- `setup_name_snapshot`
- `setup_version_snapshot`
- `institution_snapshot`
- `setup_snapshot_hash`

这些字段在 submitted / locked 实验中不得为空。手工 setup 使用 `manual:<snapshot_hash 前 16 位>` 和版本 `1`。

V1 必须出现在当前所有 analysis row：

- experiment row
- precursor rows
- substrate rows
- furnace step rows
- furnace temperature rows
- furnace precursor rows
- gas program rows
- gas segment rows
- gas component rows
- characterization rows
- sample rows
- file rows

V1 不要求新增 `feature_rows`。后续如果增加 feature rows 或其他 analysis row，也必须带上同一组 setup context 字段。

不为当前或未来任何 analysis row 设置例外。即使某一行看似只是文件或样品，仍应带上 setup context，防止下游直接分析该表时丢失可比性边界。

这样主动学习和 Agent 默认不会把不同 setup 的数值混在一起。

## 11. 审计与锁定

### 11.1 Audit events

V1.5 的 setup 模板记录：

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

- V1.5 后管理员维护 approved setup 模板；V1 可先维护种子 setup 模板。
- 字段字典解释每个字段含义、单位和适用 setup。
- 管理员看板显示缺 setup/methods 的实验。
- 提交/锁定门禁将 setup/methods 作为完成实验的条件。
- 例外通过必须记录原因并进入审计日志。

## 13. 北航外部用户流程

北航主动学习合作是第一类外部用户场景。外部用户不应从空表开始填。

V1.5 流程：

1. 管理员收集北航已有 PPT、论文、Excel、装置图和口头说明。
2. 管理员建立“北航某 setup”模板。
3. 系统预填 setup 图、methods、论文链接或来源说明、字段解释。
4. 管理员将北航现有 Excel 字段映射到系统字段。
5. 北航用户确认 setup 是否准确。
6. 北航用户补充主动学习变量之外的完整实验上下文。
7. 首批历史数据用 completeness score 标记完整度，不强求全自动清洗。

V1 只要求系统的数据模型和导出能够承载北航 setup/methods，不要求完成北航字段映射管理或外部确认页。

关键规则：

- 主动学习调的 5-6 个变量只是优化变量子集。
- 系统仍保留完整实验上下文、setup、methods、表征数据和文件。
- 北航字段按其实际 setup 适配，不机械复制组内字段。

## 14. 分阶段路线

### V1：先建立科研记录底线

交付：

- 新增 Setup / Methods 编辑器步骤。
- 新增实验 setup snapshot。
- 提交和锁定前强制 methods、示意图、样品放置、反应流程、论文链接或未发表说明。
- 导出 JSON/Excel/analysis 显式包含 setup snapshot。
- 完成度和 validation summary 纳入 setup/methods。
- setup diagram 作为实验级文件关联，并通过 `asset_role=setup_diagram` 标识。
- clone 复制 snapshot 内容但清空确认，要求新实验重新确认。

V1 不要求完整 setup 模板后台，不修改 Recipe schema，不支持模板级文件。V1 可支持只读种子模板复制，也必须支持手工输入创建 snapshot。

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
| 必填项太多导致绕开系统 | 草稿阶段不阻断，提交/锁定前才强制；优先模板预填 |
| 模板修改污染历史 | 实验保存 snapshot，导出只读 snapshot |
| setup 图混入表征文件 | 使用 `asset_role=setup_diagram`，不滥用 `method=Other` |
| Agent 仍只读取数值字段 | analysis export 将 setup key/version/hash 带入主要 rows |
| 外部用户字段定义不同 | V1 先在 snapshot metadata 记录差异；V1.5/V2 再做字段映射确认 |
| methods 文字过粗无法复核 | 提交/锁定前要求样品放置和反应流程单独填写 |

## 16. 验收标准

V1 完成时应满足：

1. 新实验编辑器包含 Setup / Methods 步骤。
2. 草稿可以保存不完整 setup/methods。
3. 提交时缺 setup/methods 必填项会被阻断。
4. 至少能上传或关联 setup diagram。
5. 实验导出 JSON 包含 setup snapshot。
6. Excel 导出包含 `Setup & Methods` sheet。
7. Analysis export 的主要行包含 setup key/version/hash。
8. locked 实验导出不受种子模板或 setup template 后续修改影响。
9. 管理员能识别缺 setup/methods 的实验。
10. clone 出来的新实验必须重新确认 setup。
11. 从 Recipe 创建实验不会绕过 setup/methods 门禁。

## 17. 实施边界说明

该设计不要求一次性完成所有后台和外部用户能力。第一轮实现应优先保证：

- 每条实验提交和锁定前有 setup snapshot。
- snapshot 中包含图、methods、样品放置和反应流程。
- 导出和 analysis 不会丢失 setup 分组键。

只要这三点完成，系统就从“参数记录表单”推进到“可追溯、可复核、可用于 Agent 的科研数据底座”。
