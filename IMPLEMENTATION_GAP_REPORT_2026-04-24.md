# CVD 实验数据采集系统 MVP-0.2 对照报告

日期：2026-04-24
对照文档：
- `AGENT_IMPLEMENTATION_BRIEF.md`
- `cvd_experiment_data_system_design_v1.md`
- `AGENT_NEXT_STEP_PLAN_MVP_0_2.md`
- `docs/superpowers/plans/2026-04-23-mvp-0-2-v1-beta-implementation.md`

---

## 1. 报告目的

本报告用于沉淀 MVP-0.2 的实际完成范围，方便后续计划制定时区分：

- 已经完成并可作为试用基线的 P0 能力。
- 本轮没有继续扩展的 P1 能力。
- 本轮已经固化的后端语义、payload schema 和前端交互决策。
- 仍需明确延期的事项。

---

## 2. 当前 MVP-0.2 基线

MVP-0.2 已从“基础 MVP”推进到可试用 Beta：支持 Docker 三服务部署、命令行用户初始化、实验列表筛选分页、新建三入口、clone 来源提示、编辑器扩展字段、提交前结构化验证、样品/文件/审计/导出、受控词表管理，以及 2026-04-28 易用性优化中的 Recipe、智能默认值、快捷模板、完成度指示、列表快捷操作和 clone Diff 视图。

### 2.1 后端

- Docker Compose 中 `backend` 启动时会自动执行 Alembic upgrade。
- 用户命令支持 `create_user`、`reset_password`，保留 `create_admin` 兼容入口。
- 实验列表支持 owner、状态、关键词、分页筛选。
- `clone` 支持 owner/admin 从自己的 `submitted/locked` 实验派生，其他用户只能从 `locked` 实验派生。
- `POST /api/v1/experiments/{id}/validate` 返回结构化 `errors/warnings`。
- `submit` 复用 validate 规则，失败时返回结构化 `422`。
- 模块 payload 兼容和默认值补齐覆盖 MVP-0.2 新字段。
- `result_summary.quality_label` 与实验主表 `quality_label` 同步。
- 样品、文件、审计、JSON/Excel 导出继续可用。
- 受控词表 seed 已补齐 MVP-0.2 必需 key：`material_system`、`sample_env`、`precursor_method`、`substrate_type`、`substrate_treatment_method`、`gas_label`、`characterization_method`、`quality_label`。
- Recipe 实体、迁移、CRUD、从 Recipe 创建实验、从实验保存为 Recipe 已落地；`experiment_runs.recipe_id` 会记录 Recipe 来源。

### 2.2 前端

- `/experiments/new` 支持空白创建、复制上一条、从指定实验复制。
- 实验列表支持 mine/status/q/material_system 筛选、分页、后端排序和应用壳层全局搜索入口。
- 详情页显示 clone 来源，并支持状态动作、概览/参数/样品/文件/审计 Tabs、文件溢出提示和导出入口。
- 编辑器扩展到 Beta 字段集，覆盖环境湿度、预检查扩展项、前驱体扩展字段、基底处理参数、气体组分、表征启用/备注和结果总结。
- 编辑器已使用桌面左侧 stepper 和移动端横向 stepper；移动端 stepper 使用原生按钮，支持键盘访问。
- 编辑器保留区块级 debounced autosave，并保留 payload 中暂未建模字段。
- 固定底部操作区持续显示保存状态、返回详情、提交按钮和只读状态。
- 提交前调用 validate，错误阻止提交，警告与错误统一展示并支持跳转到模块。
- 保存中或保存失败且仍有未持久化修改时，浏览器离开、返回详情和 Data Router 导航都会提示。
- 文件上传页读取 `characterization_method` 词表；词表后台 key 选项来自后端数据。
- `/admin/recipes` 支持 Recipe 管理；新建实验页支持从 Recipe 创建实验。
- 新建空白实验会在创建前查询最近实验并继承环境和预检查默认值，避免继承新建草稿本身。
- 温区和气体程序支持按材料体系匹配的快捷模板下拉。
- 编辑器 stepper 和底部操作区展示模块完成度。
- 实验列表增加 Dashboard 卡片和状态相关快捷操作，按权限隐藏 mutating action，并要求用户填写作废原因。
- clone 来源实验在编辑器来源 banner 中提供“查看差异”，按模块对比来源 payload 和当前编辑器状态；Recipe 创建实验不触发 Diff。

### 2.3 部署与文档

- README 已覆盖本地开发、Docker Compose 启动、用户初始化、质量命令和常见验证步骤。
- Docker Compose 当前包含 `postgres`、`backend`、`frontend`，并配置数据库与文件存储 volume。
- `.env.example` 覆盖本地和 Compose 所需关键环境变量。

---

## 3. 本轮完成的 P0

- P0 部署：补齐 backend/frontend Dockerfile、三服务 Compose、运行时前端 API 配置和健康检查。
- P0 用户初始化：补齐通用用户创建与密码重置命令。
- P0 实验发现：补齐实验列表筛选、分页和前端筛选 UI。
- P0 新建入口：补齐空白创建、复制上一条、从指定实验复制。
- P0 clone 语义：固化 `submitted/locked` 派生规则、来源字段和来源 banner。
- P0 schema 兼容：补齐 MVP-0.2 payload 默认值、非法 payload 422 和字段持久化测试。
- P0 验证：新增 validate 接口，submit 失败返回结构化 errors/warnings，前端展示验证汇总。
- P0 编辑器：补齐 Beta 最小字段集、固定操作区、离开保护和提交防竞态。
- P0 质量标签：`quality_label` 可在 UI 编辑，保存后同步实验主表和列表缓存。
- P0 词表：补齐 MVP-0.2 必需 seed key，并保留 admin 维护入口。
- P0 文档：README 和阶段计划文档更新到当前交付边界。

---

## 4. 暂未完成的 P1

- Project 维度的真实实体、筛选和权限边界。
- Characterization session 与 features 数据模型。
- ~~字段字典 `/admin/fields` 和动态表单 schema。~~ ✅ **已完成**（2026-05-06 实现模型、迁移、种子数据、API 端点和管理页）
- 用户管理后台 `/admin/users`。
- 文件预览、批量上传、更细文件元数据编辑。
- 批量导出、JSONL/CSV/ZIP 导出。
- Excel 导入和历史数据迁移工具。
- 更细粒度的 Recipe Diff、多实验任意对比和 clone 字段级继承确认。
- 路由级拆包、前端性能专项优化。

---

## 5. 已固化的实现决策

### 5.1 clone

- clone 后的新实验始终回到 `draft`。
- clone 记录 `derived_from_run_id` 与 `derived_from_run_code`，前端在详情和编辑页展示来源。
- owner/admin 可以从自己的 `submitted/locked` 实验 clone；非 owner 只能从 `locked` 实验 clone。
- clone 会复制主实验参数、模块 payload 和样品，并为样品重新分配新实验编号下的 `sample_code`。
- clone 不复制状态时间戳、作废原因、上传文件和最终 `summary_result`。

### 5.2 validation

- validate 是独立接口：`POST /api/v1/experiments/{id}/validate`。
- validate 返回 `{ ok, errors, warnings }`；`errors` 阻止 submit，`warnings` 仅提示。
- submit 使用同一验证服务；失败返回结构化 `422`，前端复用同一验证汇总组件。
- 当前警告包括 `quality_label=unknown` 等可提交但需提醒的质量问题。

### 5.3 schema 与 payload

- 后端继续采用“主表字段 + 模块 payload”混合模型。
- 前端仅建模 MVP-0.2 必需字段，但保存时保留已有 payload 中暂未建模字段。
- gas component 写回采用后端约定的 `name/flow_sccm`（用户填写流量），`fraction` 由后端根据组件流量之和自动计算；读取兼容旧的 `gas/ratio_percent`。
- `result_summary.quality_label` 是同步实验主表质量标签的唯一模块入口。

### 5.4 受控词表

- MVP-0.2 必需 key 采用 `substrate_treatment_method` 和 `gas_label`，保留旧 `substrate_treatment`、`gas` 数据不主动删除。
- 文件上传页当前只实际读取 `characterization_method`。
- 词表后台不维护前端硬编码 key 列表，筛选选项来自后端返回数据。

---

## 6. 仍然延期的事项

- 不在 MVP-0.2 内实现物理删除实验；实验仍通过状态流和作废语义管理。
- ~~不在 MVP-0.2 内引入完整字段字典和动态 schema 引擎。~~ ✅ **已提前完成**（2026-05-06，字段字典模型/API/管理页已落地）
- 不在 MVP-0.2 内实现 Recipe、Project、Feature 的完整业务闭环。
- 不在 MVP-0.2 内做对象存储；文件继续使用本地文件系统和 metadata 入库。
- 不在 MVP-0.2 内做批量导入/导出和大型报表能力。

---

## 7. 验收状态

已执行并通过的质量门禁：

- `cd backend && uv run ruff check .`
- `cd backend && uv run ruff format --check .`
- `cd backend && uv run pytest`：`149 passed`
- `cd frontend && bun run lint`
- `cd frontend && bun run typecheck`
- `cd frontend && bun run test`：`25 passed / 151 passed`

Docker 验证结果：

- `docker compose config` 通过。
- 当前桌面环境直接执行 `docker compose up --build` 仍触发 Docker Desktop gRPC header 异常。
- 已通过拆分路径验证运行态：`docker build -f backend/Dockerfile -t cvd-backend .`、`docker build -f frontend/Dockerfile -t cvd-frontend .`、`docker compose up -d --no-build --force-recreate`。
- `postgres`、`backend`、`frontend` 三容器均为 healthy；后端 `/health` 与前端 `runtime-config.js` 可访问。

结论：MVP-0.2 已具备对外试用和后续迭代的稳定基线；剩余事项应进入下一轮计划，不建议继续挤入当前提交。
