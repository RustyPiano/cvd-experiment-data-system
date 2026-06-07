# CVD 实验数据采集系统现状对照报告

日期：2026-04-23  
对照文档：
- `AGENT_IMPLEMENTATION_BRIEF.md`
- `cvd_experiment_data_system_design_v1.md`

---

## 1. 报告目的

这份报告用于回答两个问题：

1. 当前代码到底已经实现到了什么程度。
2. 当前实现与两份文档分别有哪些一致、偏离、缺失与超出。

这份报告刻意区分四类情况，方便后续规划：

- 已实现且基本符合文档
- 已实现但明显缩减或改写
- 文档要求存在，但代码尚未实现
- 代码已实现，但文档没有写清或与文档相冲突

---

## 2. 核验基线

本次结论不是只看源码目录名，而是基于实际代码、迁移、前后端页面、接口、测试与质量门禁共同得出。

### 2.1 工具链与运行环境

- `uv --version` -> `uv 0.6.8`
- `bun --version` -> `1.3.4`
- `docker --version` -> `Docker version 29.4.0`
- `docker compose version` -> `Docker Compose version v5.1.2`

### 2.2 质量门禁实测

- 后端测试：`uv run pytest` -> `79 passed`
- 前端测试：`bun run test` -> `49 passed`
- 后端 lint：`uv run ruff check .` -> 通过
- 后端格式检查：`uv run ruff format --check .` -> 通过
- 前端 lint：`bun run lint` -> 通过
- 前端 typecheck：`bun run typecheck` -> 通过

结论：当前仓库不是“只有骨架”，而是一版已经过基本测试与静态质量检查的 MVP。

---

## 3. 当前实现全貌

## 3.1 技术栈现状

### 后端

- FastAPI
- SQLAlchemy 2.x
- Alembic
- PostgreSQL 作为目标数据库
- Pydantic v2 / pydantic-settings
- `python-jose` 做 JWT
- `pwdlib[argon2]` 做密码哈希
- `openpyxl` 做 Excel 导出

### 前端

- React 19 + TypeScript + Vite
- Ant Design 6
- React Router
- TanStack Query
- 登录页使用 React Hook Form + Zod
- 实验编辑器没有使用 React Hook Form + Zod，而是手写本地状态与自动保存逻辑

### 部署

- 仓库内只有一个 `docker-compose.yml`
- 目前 Compose 只启动 `postgres`
- 仓库中没有 `frontend` / `backend` 的 Dockerfile

结论：技术栈大体遵循文档，但部署落地只完成了数据库容器，尚未完成完整三服务 Compose 方案。

---

## 3.2 当前后端实际能力

当前后端已实现的主能力如下：

- 本地账号登录 / 登出 / 当前用户
- 初始化管理员命令 `backend/app/commands/create_admin.py`
- 实验创建、列表、详情、更新
- 实验状态流：`draft -> submitted -> locked -> invalid`
- `submitted -> draft` 退回草稿
- `locked -> clone as draft`
- 模块化 JSON payload 保存/读取
- 审计日志查询
- 文件上传、下载、软删除、重复文件标记
- 样品查询、创建、更新
- 基底模块驱动的 `top` / `bottom` 样品自动同步
- 单实验 JSON 导出
- 单实验 Excel 导出
- 受控词表最小 CRUD

当前后端未实现的关键能力如下：

- `projects` 实体
- `experiment_template_versions` 实体
- `recipes` 实体及相关 API
- `characterization_sessions` 实体
- `features` 实体
- 批量 JSONL / CSV / ZIP 导出
- 历史 Excel 导入
- 实验 diff 接口
- 实验 validate 专用接口
- 用户管理接口
- 字段字典接口

---

## 3.3 当前前端实际能力

当前前端已实现页面：

- `/login`
- `/experiments`
- `/experiments/new`
- `/experiments/:id`
- `/experiments/:id/edit`
- `/experiments/:id/files`
- `/samples/:id`
- `/admin/vocabularies`

当前前端已实现的交互主线：

- 登录后进入实验列表
- 新建空白实验
- 进入编辑页按模块填写
- 模块自动保存
- 提交实验
- 在详情页执行退回草稿、锁定、作废、派生草稿
- 在文件页上传/删除/下载文件
- 在样品页编辑样品
- 在词表页新增/编辑词条

当前前端明显未实现的页面或工作流：

- 从上一条实验复制
- 从 Recipe 创建
- 在新建页直接搜索历史实验并复制
- Recipe 管理
- 字段字典管理
- 用户管理
- 批量导出
- 样品特征视图
- 与来源实验的差异对比
- 继承字段提示与“原值”提示

---

## 3.4 当前数据库实际落地表

已落地迁移表：

- `users`
- `experiment_runs`
- `audit_events`
- `experiment_module_payloads`
- `samples`
- `file_assets`
- `controlled_vocabularies`

未落地但在设计文档中占核心地位的表：

- `projects`
- `experiment_template_versions`
- `recipes`
- `characterization_sessions`
- `features`

值得特别注意的现实情况：

- `experiment_runs` 中保留了 `project_id`、`template_version_id`、`recipe_id` 字段。
- 这些字段当前没有对应真实表，也没有完整业务链路。
- 也就是说，代码已经给未来扩展留了“占位字段”，但并没有完成设计文档里的实体网络。

---

## 3.5 当前 API 实际落地

### Auth

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

### Experiments

- `GET /api/v1/experiments`
- `POST /api/v1/experiments`
- `GET /api/v1/experiments/{id}`
- `PATCH /api/v1/experiments/{id}`
- `POST /api/v1/experiments/{id}/submit`
- `POST /api/v1/experiments/{id}/return-to-draft`
- `POST /api/v1/experiments/{id}/lock`
- `POST /api/v1/experiments/{id}/invalidate`
- `POST /api/v1/experiments/{id}/clone`
- `GET /api/v1/experiments/{id}/audit-events`
- `GET /api/v1/experiments/{id}/modules`
- `GET /api/v1/experiments/{id}/modules/{module_key}`
- `PUT /api/v1/experiments/{id}/modules/{module_key}`
- `GET /api/v1/experiments/{id}/export`
- `GET /api/v1/experiments/{id}/export/json`
- `GET /api/v1/experiments/{id}/export/excel`

### Samples

- `GET /api/v1/samples`
- `POST /api/v1/experiments/{id}/samples`
- `GET /api/v1/samples/{id}`
- `PATCH /api/v1/samples/{id}`

### Files

- `GET /api/v1/files`
- `POST /api/v1/experiments/{id}/files`
- `GET /api/v1/files/{id}`
- `GET /api/v1/files/{id}/download`
- `DELETE /api/v1/files/{id}`

### Vocabularies

- `GET /api/v1/vocabularies`
- `GET /api/v1/admin/vocabularies`
- `POST /api/v1/admin/vocabularies`
- `PATCH /api/v1/admin/vocabularies/{id}`

实际 API 风格特征：

- 使用 `/api/v1/*`
- 成功响应直接返回资源对象，而不是 `{data, message}`
- 列表响应是 `{items, total}`，不是分页 envelope
- 错误响应沿用 FastAPI 默认 `detail`

---

## 3.6 当前模块 payload 的真实落点

这部分不是文档期望字段，而是当前前后端真正会保存、读取、编辑的字段。

| 模块 | 当前真实字段 |
|---|---|
| `basic_info` | `operator_id`, `experiment_type`, `material_system`, `experiment_date`, `objective` |
| `environment` | `indoor_temperature_C`, `sample_env`, `abnormal_note`，并保留旧 payload 中的 `indoor_humidity_percent` |
| `precheck` | `seal_intact`, `risk_note` |
| `precursors` | `items[].role`, `items[].type` |
| `substrates` | `items[].role`, `items[].type`, `items[].brand`, `items[].size_mm`, `items[].treatment_method`, `items[].position_mm` |
| `furnace_program` | `zones[].zone_index`, `zones[].precursor_placed`, `zones[].note`, `zones[].temperature_program[].time_min`, `zones[].temperature_program[].temperature_C` |
| `gas_program` | `pre_washing_gas`, `segments[].stage`, `segments[].gas`, `segments[].start_min`, `segments[].end_min`, `segments[].flow_sccm` |
| `process_observation` | `color_change`, `abnormal_events[]`, `note` |
| `characterization` | `methods[].method`, `methods[].result` |
| `result_summary` | `summary_result` |

补充说明：

- `quality_label` 在主实验表里存在，但当前没有前端编辑入口，也没有结果总结模块的完整编辑闭环。
- `project_id`、`recipe_id`、`template_version_id` 只是在主表里占位，没有真正工作流。

---

## 3.7 关键实现文件位置

### 后端入口

- 应用入口：`backend/app/main.py`
- 路由聚合：`backend/app/api/router.py`，`backend/app/api/v1/router.py`
- 配置与依赖：`backend/app/core/config.py`，`backend/app/core/deps.py`

### 后端模型与迁移

- 主模型：`backend/app/models/*.py`
- 迁移：`backend/alembic/versions/*.py`

### 后端业务服务

- 认证：`backend/app/services/auth_service.py`
- 实验：`backend/app/services/experiment_service.py`
- 导出：`backend/app/services/experiment_export_service.py`
- 文件：`backend/app/services/file_asset_service.py`
- 样品：`backend/app/services/sample_service.py`
- 审计：`backend/app/services/audit_service.py`
- 词表：`backend/app/services/vocabulary_service.py`

### 后端接口

- Auth：`backend/app/api/v1/endpoints/auth.py`
- Experiments：`backend/app/api/v1/endpoints/experiments.py`
- Files：`backend/app/api/v1/endpoints/files.py`
- Samples：`backend/app/api/v1/endpoints/samples.py`
- Vocabularies：`backend/app/api/v1/endpoints/vocabularies.py`

### 前端入口

- 路由：`frontend/src/app/router.tsx`
- 外壳：`frontend/src/shared/ui/app-shell.tsx`
- 主题：`frontend/src/app/theme.ts`

### 前端页面与主逻辑

- 登录：`frontend/src/features/auth/*`
- 实验列表：`frontend/src/features/experiments/experiment-list-page.tsx`
- 新建实验：`frontend/src/features/experiments/experiment-new-page.tsx`
- 实验详情：`frontend/src/features/experiments/experiment-detail-page.tsx`
- 实验编辑器：`frontend/src/features/experiments/experiment-editor-page.tsx`
- 自动保存与模块序列化：`frontend/src/features/experiments/use-experiment-editor.ts`，`frontend/src/features/experiments/editor-types.ts`
- 文件页：`frontend/src/features/experiments/experiment-files-page.tsx`
- 样品页：`frontend/src/features/samples/sample-detail-page.tsx`
- 词表后台：`frontend/src/features/vocabularies/vocabulary-admin-page.tsx`

### 测试位置

- 后端测试：`backend/tests/**`
- 前端测试：`frontend/src/**/*.test.ts*`

---

## 4. 与 `AGENT_IMPLEMENTATION_BRIEF.md` 的对照

## 4.1 总体判断

总体上，当前代码已经覆盖了 brief 中多数 P0 主线，但覆盖方式是“做成一版最小可用系统”，不是“完全按 brief 细节逐项落满”。

更准确地说：

- brief 的“必须页面”和“核心业务主线”基本已落地
- brief 的“详细模块字段”、“API 契约格式”、“完整部署方式”、“初始化种子账号”、“前端交互形态”仍有明显差距

---

## 4.2 与 brief 基本一致的部分

| 项目 | 结论 |
|---|---|
| React + TS + Vite + Ant Design | 已实现 |
| FastAPI + SQLAlchemy 2.x + Alembic + PostgreSQL | 已实现 |
| 本地文件系统 + metadata 入库 | 已实现 |
| 登录/登出/当前用户 | 已实现 |
| 初始化管理员账号 | 已实现，但靠命令而非默认 seed |
| 实验列表 / 新建 / 编辑 / 详情 | 已实现 |
| 自动保存草稿 | 已实现 |
| 提交 / 锁定 / 作废 | 已实现 |
| 审计日志 | 已实现 |
| JSON 导出 / Excel 导出 | 已实现 |
| 文件上传 | 已实现 |
| 样品自动编号 | 已实现 |
| 受控词表最小 CRUD | 已实现 |
| 必须页面列表 | 已覆盖 |

---

## 4.3 与 brief 部分一致、但明显缩减的部分

| 项目 | 文档要求 | 当前实现 | 结论 |
|---|---|---|---|
| 表单技术方案 | React Hook Form + Zod | 仅登录页使用，实验编辑器未使用 | 部分实现 |
| 文件存储路径 | `storage/experiments/{run_code}/raw|processed` | 实际为 `{FILE_STORAGE_ROOT}/{run_code}/{uuid}_{filename}` | 偏离 |
| Docker Compose | frontend/backend/postgres 三服务 | 仅 `postgres` 服务 | 明显缺失 |
| 实验编号规则 | `CVD-YYYY-NNNN` | 已实现 | 一致 |
| 样品编号规则 | `S-YYYY-NNNN-ROLE` | `TOP/BOTTOM` 一致，`PRODUCT/CONTROL` 增补字母后缀 | 基本一致 |
| 提交校验 | 多项阻塞校验 | 已实现主干校验，但返回信息很粗 | 部分实现 |
| 文件上传 | 需携带 experiment/sample/method/category/note | experiment/method/category/note 具备，sample 仍可空 | 部分实现 |
| 词表 seed | 多个 vocab key | 已 seed 一部分，但不是设计里的完整集合 | 部分实现 |
| 前端编辑器 | 左 stepper + 右侧模块表单 + 固定操作栏 | 当前是连续卡片堆叠页 | 明显偏离 |
| 自动保存 | 简单字段 blur，大文本 debounce | 当前统一 900ms debounce | 部分实现 |

---

## 4.4 brief 中尚未落地的关键点

### 新建实验入口不完整

brief 要求：

- 新建空白实验
- 复制上一条实验
- 从历史实验复制

当前实现：

- 新建页只有“空白实验”按钮
- “从历史实验复制”只是一段说明文案，实际要先去 locked 详情页点“派生草稿”
- 没有“复制我的上一条实验”

### 模块字段明显裁剪

brief 里定义的模块字段比当前实现详细得多。当前代码只覆盖了最小字段集：

- `environment` 缺少湿度输入
- `precheck` 只保留 `seal_intact` 和 `risk_note`
- `precursors` 只保留 `role` / `type`
- `substrates` 缺少 `treatment_params`
- `gas_program` 缺少 `components`
- `characterization` 只保留 `method` / `result`
- `result_summary` 没有 `quality_label` / `next_step`

### API 契约格式未遵循

brief 要求：

- 成功响应包裹在 `{data, message}`
- 失败响应有 `code/message/details`
- 分页使用 `{data, pagination}`

当前实现：

- 成功直接返回资源对象
- 列表直接返回 `{items, total}`
- 失败使用 FastAPI 默认 `detail`

### 前端交互要求未遵循

brief 要求：

- 左侧 stepper
- 顶部显示来源实验
- 固定操作栏
- 继承字段提示
- locked 状态直接只读并强调派生

当前实现：

- 无 stepper
- 无继承来源提示
- 无字段级“原值”提示
- 无固定底部操作栏
- locked 实验确实只读，但表现形式较简化

### 种子管理员账号未按文档自动提供

brief 明确写了：

- `admin@example.com / ChangeMe123!`

当前实现：

- 只有 `create_admin` 命令
- 没有 migration seed 默认管理员
- 没有“首次登录强制改密”机制

---

## 4.5 当前实现超出 brief 或与 brief 不完全同构的部分

### 增加了 `process_observation` 模块

brief 的模块 key 列表没有 `process_observation`，但当前代码已经实现：

- 后端枚举
- 模块存储
- 编辑器 UI
- clone 时排除该模块

这一点更接近设计文档，而不是 brief。

### 实现了 `submitted -> return-to-draft`

brief 在状态规则说明中允许 submitted 阶段退回草稿。当前后端与前端都真的做了这一动作。

### 文件软删除行为比 brief 更具体

当前实现中：

- 删除文件只写 `deleted_at` / `deleted_by_id`
- 记录审计事件
- 成功软删除后并不删磁盘 blob

这比 brief 的描述更完整，也更接近设计文档的“软删除 + 保留内容”思路。

### 样品同步逻辑已经比较细

当前代码对 `substrates` 模块做了自动样品同步：

- top/bottom 自动建样品
- 去掉某个基底时，如已有关联文件或子样品则拒绝删除
- clone locked 实验时同步复制 top/bottom 样品

这一部分的工程细节，brief 没写到这么深。

---

## 5. 与 `cvd_experiment_data_system_design_v1.md` 的对照

## 5.1 总体判断

如果把 design 文档理解为“完整 V1 产品设计目标”，那么当前代码只完成了其中的核心 MVP 子集。

当前实现更像：

- 已完成：认证、实验主流程、模块化 payload、样品与文件基础链路、导出、词表
- 未完成：项目/模板/Recipe/特征/表征会话/批量导出/导入/字段字典/用户管理/复杂筛选与对比

换句话说，当前实现与 design 文档的关系不是“完全不符”，而是“抓住了主干，但大量横向能力被砍掉或推迟了”。

---

## 5.2 与设计文档明显一致的部分

| 设计主题 | 当前状态 |
|---|---|
| 角色体系：admin/member/viewer | 已实现 |
| 状态流：draft/submitted/locked/invalid | 已实现 |
| 关系型主干 + 模块 JSON payload | 已实现 |
| 文件不直接进数据库，只存 metadata/path/hash | 已实现 |
| 实验不物理删除，文件软删除 | 已实现 |
| 审计日志 | 已实现 |
| 样品编号与实验编号 | 已实现 |
| 单实验 JSON/Excel 导出 | 已实现 |
| 受控词表管理 | 已实现最小版 |

---

## 5.3 设计文档中的核心实体，当前缺失情况

| 实体 | 设计文档 | 当前实现 | 影响 |
|---|---|---|---|
| `projects` | 核心实体 | 未实现 | 项目维度无法真正使用 |
| `experiment_template_versions` | 核心实体 | 未实现 | 模板版本与 schema 版本治理未落地 |
| `recipes` | 核心实体 | 未实现 | 无法从 Recipe 创建，也无法管理 Recipe |
| `characterization_sessions` | 核心实体 | 未实现 | 文件与一次具体表征会话之间没有中间层 |
| `features` | 核心实体 | 未实现 | AI-ready 特征层为空壳 |

这意味着设计文档第 4 节和第 6 节中的实体网络，当前只实现了其中一半左右。

---

## 5.4 表单模块对照

### 已实现模块

- `basic_info`
- `environment`
- `precheck`
- `precursors`
- `substrates`
- `furnace_program`
- `gas_program`
- `process_observation`
- `characterization`
- `result_summary`

### 关键偏差

| 模块 | 设计文档期望 | 当前实现 |
|---|---|---|
| `basic_info` | 操作者/日期/项目/材料体系/Recipe/来源 | 实际可编辑的只有材料体系、目的；类型和日期基本只读；项目/Recipe 缺失 |
| `environment` | 温度、湿度、环境、异常备注 | 缺少湿度 |
| `precheck` | 通风橱/法兰/瓷舟/石英管/密封圈等多字段 | 当前只保留 `seal_intact` 与 `risk_note` |
| `precursors` | 化学名、品牌、浓度、方式、批号、质量等 | 当前只有 `role` 与 `type` |
| `substrates` | role/type/brand/size/treatment/treatment_params/position | 当前没有 `treatment_params`，UI 只允许 `top/bottom` |
| `furnace_program` | 结构化曲线 + 快速文本输入 + 派生值 | 当前只有结构化曲线最小版 |
| `gas_program` | gas label、components、note | 当前没有 `components` 与 `note` |
| `characterization` | 是否完成、激发波长、峰位、方法特征、文件关系 | 当前只有 `method` + `result` |
| `result_summary` | 质量标签、总结、下一步 | 当前只有 `summary_result`，质量标签不可编辑 |

---

## 5.5 数据继承与复制设计的差距

设计文档要求四个入口：

- 空白新建
- 复制我的上一条实验
- 从 Recipe 创建
- 从历史实验复制

当前只有：

- 空白新建
- 从 locked 实验详情页点击“派生草稿”

设计文档要求的继承表现：

- 显示来源实验
- 显示“继承自 CVD-xxxx”
- 字段修改后显示“已修改，原值：xxx”
- 提供 diff

当前实现：

- 后端保存了 `derived_from_run_id`
- 前端没有展示来源实验
- 没有字段级 diff
- 没有 diff API

更重要的是，clone 语义当前与设计文档不完全一致：

- 代码不会复制 `basic_info`
- 不会复制 `characterization`
- 不会复制 `process_observation`
- 会清空 `environment.abnormal_note`
- 会复制 top/bottom 样品
- 不复制文件

设计文档中“Characterization plan 默认复制”的倾向，没有在当前代码里体现，反而测试已经明确固化为“不复制 characterization 模块”。

---

## 5.6 页面设计的差距

### 实验列表

设计要求：

- 搜索
- 多筛选
- 日期范围
- 质量标签
- 是否有文件
- 复制/导出/作废操作

当前实现：

- 只有简单表格
- 只有“查看/继续填写”
- 无搜索、无筛选、无批量导出、无列表级作废

### 新建实验页

设计要求：

- 2x2 创建方式卡片

当前实现：

- 两张卡
- 真正可用的只有“空白实验”

### 实验编辑页

设计要求：

- 左侧步骤导航
- 右侧模块表单
- 页脚固定操作区
- 来源实验链接
- 高风险警告与继承确认

当前实现：

- 单列卡片堆叠
- 无步骤导航
- 无前进/后退
- 无固定底栏
- 无继承确认

### 实验详情页

设计要求：

- Tab: Overview / Parameters / Samples / Files / Features / Audit / Export

当前实现：

- 多张 Card 纵向堆叠
- 没有 Tabs
- 没有 Features 区

### 文件页

设计要求：

- 拖拽多文件上传
- 方法和样品选择
- 元数据侧栏
- 推荐记录 instrument / acquisition params

当前实现：

- 单文件上传
- 样品可选、方法必填
- 无侧栏
- 无 instrument / acquisition params

### 样品页

设计要求：

- 样品信息
- 关联文件
- 特征表
- 溯源时间线
- QR action

当前实现：

- 样品信息
- 关联文件
- 无特征表
- 无溯源时间线
- 无 QR action

### 管理后台

设计要求：

- `/recipes`
- `/admin/fields`
- `/admin/vocabularies`
- 用户管理

当前实现：

- 只实现了 `/admin/vocabularies`

---

## 5.7 API 设计的差距

### 当前已缺失的设计 API

- `POST /api/experiments/from-recipe`
- `POST /api/experiments/{id}/validate`
- `GET /api/experiments/{id}/diff/{source_id}`
- `POST /api/exports/experiments/jsonl`
- `POST /api/exports/experiments/csv`
- `POST /api/exports/dataset-zip`

### 当前过滤与分页能力明显不足

设计文档希望列表支持：

- `mine`
- `status`
- `material_system`
- `q`
- `page`
- `page_size`

当前实际只支持：

- `mine`
- `status`

### 当前验证返回信息不够产品化

后端内部其实会收集一组提交错误，但最终抛给前端的只是统一的：

- `Submit validation failed`

这意味着：

- 前端无法逐条展示阻塞错误清单
- 设计文档里“提交前错误汇总”的交互，当前没有足够的后端输出支撑

---

## 5.8 导出设计的差距

### 已实现

- 单实验 JSON
- 单实验 Excel

### 部分符合

- Excel 的 sheet 基本覆盖设计要求的主体内容
- 但没有单独的特征 sheet

### 未实现

- 批量 JSONL
- 长表 CSV/Parquet
- 数据集 ZIP

### JSON 导出结构差距

设计文档期望的 JSON 更接近：

- `modules` 是按 key 组织的对象
- `template_key` / `template_version`
- `operator name`
- `created_by` / `created_at`

当前导出实际是：

- `modules` 为数组
- `features` 固定空数组
- provenance 只有 `derived_from_run_id` / `derived_from_run_code`
- 没有模板与 Recipe 语义

---

## 5.9 校验与联动的差距

### 已实现的阻塞校验

- 主字段缺失
- 前驱体为空
- 温区为空
- 温区时间不递增
- 气体时间非法或重叠
- `seal_intact=false` 且无 `risk_note`

### 未实现的设计校验/联动

- 湿度数值范围警告
- 污染程度警告
- 继承高风险字段确认
- 前驱体批号缺失警告
- 文件未关联样品的提交提醒
- 方法切换后显示条件字段
- 表征方法特有字段
- 基底处理方式触发处理参数
- 气体混合组成编辑

### 现有联动比较有限

当前最实质的联动只有一项：

- 保存 `substrates` 模块时，自动同步 top/bottom 样品表

这条联动是实打实存在的，也是当前实现里最成熟的一条跨实体联动链路。

---

## 5.10 管理后台的差距

设计文档把后台分成：

- 用户管理
- 受控词表管理
- Recipe 管理
- 字段字典管理

当前只实现：

- 受控词表管理

而且词表后台仍然是最小版：

- 没有 usage count
- 没有 alias
- 没有删除前影响分析
- 没有左侧分类面板

---

## 6. 文档之间的冲突点，当前代码如何“站队”

这部分非常重要，因为后续如果要让文档工程师修订文档，不能只看“代码偏不偏”，还要看“两个文档之间自己是否一致”。

### 冲突 1：`process_observation`

- brief 的模块 key 列表没有它
- design 文档明确把它列为第 8 个模块
- 当前代码实现了它

结论：代码在这里更贴近 design 文档。

### 冲突 2：V1 页面范围

- brief 明确说 `/admin/fields`、`/admin/templates`、`/admin/recipes`、`/admin/users` 暂缓
- design 文档仍把 `Recipe 管理`、`字段字典` 等页面写进正式页面列表

结论：代码在这里明显更贴近 brief，而不是完整 design。

### 冲突 3：clone 的复制内容

- design 文档倾向“复制 Characterization plan”
- 当前代码和测试明确“不复制 characterization 模块”

结论：这里需要文档工程师与实现负责人重新定一个准绳，否则文档和行为会长期冲突。

### 冲突 4：API 目标粒度

- brief 对 API envelope、分页、错误格式写得很工程化
- design 文档更多是资源级草案
- 当前代码走的是非常直接的 FastAPI 资源风格

结论：文档需要明确“这是交付前必须统一的正式契约”，还是“仅供方向参考”。

---

## 7. 当前实现最值得确认的 10 个事实

1. 当前仓库已经不是脚手架，而是一版跑通认证、实验主流程、样品、文件、导出、词表的 MVP。
2. 当前实现更接近“brief 的最小可用范围”，而不是“design 文档的完整 V1 蓝图”。
3. 数据模型只落地了核心主干，项目/模板/Recipe/表征会话/特征层仍未开始。
4. 当前最成熟的跨实体业务链是：实验模块保存 -> 审计 -> 样品同步 -> 文件关联 -> 导出。
5. 当前前端页面已经可用，但 UI 形态比文档里的产品设计明显更简化。
6. 自动保存已经可用，但没有做到字段级 blur、离开页面保护、失败重试按钮、来源差异提示。
7. clone 已经可用，但行为语义已经被测试固化，不完全符合设计文档。
8. API 已经稳定可用，但不是文档中的 envelope / pagination / validation-detail 风格。
9. Docker Compose 还不是系统级交付形态，目前只能拉起 postgres。
10. 当前测试覆盖了现有实现，但没有覆盖文档中那些尚未开始的能力，因此“测试全绿”不能等同于“文档要求已齐”。

---

## 8. 给文档工程师的后续修订建议

### 建议 1：先明确文档身份

先决定这两份文档分别代表什么：

- `AGENT_IMPLEMENTATION_BRIEF.md` 是当前要交付的 MVP 约束
- `cvd_experiment_data_system_design_v1.md` 是完整产品设计蓝图

如果不先明确这一点，后续所有“代码不符合文档”的讨论都会混在一起。

### 建议 2：把 design 文档拆成“已落地 / 目标态”

最适合的修订方式是把设计文档显式标出：

- 已实现
- V1 未实现但保留
- V1.1 / V2 候选

当前最大的问题不是代码完全错，而是文档把“已做”和“想做”混写在一起。

### 建议 3：尽快统一 clone 语义

至少要统一以下内容：

- Characterization plan 复制还是不复制
- 环境异常备注是否清空
- 样品是否默认复制
- 是否必须提供 diff

这部分已经进入后端测试，越晚统一，改动成本越高。

### 建议 4：尽快统一 API 契约

重点确认：

- 是否坚持 `{data, message}` envelope
- 是否需要统一错误码
- 是否需要分页
- submit 校验是否要返回逐项错误列表

如果不统一，前端现在的实现会越来越依赖当前简化接口。

### 建议 5：把“真正的未实现高优项”单列出来

结合当前代码，最有规划意义的高优项其实是：

1. 完整三服务 Docker Compose
2. 新建实验的多入口
3. 列表搜索/筛选/分页
4. 提交校验详细错误返回
5. 继承来源与 diff 视图
6. Recipe 实体与页面
7. 模板/字段字典治理
8. characterization session / features 层
9. 批量导出
10. 用户管理

---

## 9. 总结

一句话总结当前状态：

当前代码已经实现了一版“可运行、可测试、可录入实验”的 CVD 数据采集 MVP，但它离 `cvd_experiment_data_system_design_v1.md` 描述的完整 V1 产品还有明显距离；它更接近 `AGENT_IMPLEMENTATION_BRIEF.md` 的主线目标，不过在字段细节、API 契约、部署方式和前端交互上仍存在一批明确缺口。

如果要给后续计划做输入，最重要的不是继续泛泛而谈“还有很多没做”，而是先统一下面三件事：

1. 哪份文档描述当前应交付的真实范围。
2. 哪些差距属于“故意缩 MVP”，哪些属于“实现漏掉了”。
3. clone / API / 模板治理 这三类已经开始固化的行为，到底以哪份文档为准。
