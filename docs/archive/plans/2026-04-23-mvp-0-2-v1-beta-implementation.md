# MVP-0.2 / V1 Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不推翻现有 MVP 主干的前提下，把系统推进到“可部署、可试用、可持续收集真实实验数据”的 MVP-0.2 / V1 Beta。

**Architecture:** 继续沿用现有单体前后端结构。后端以“主表字段 + 模块化 payload + 样品/文件/审计联动”为主线扩展；前端保留当前卡片式编辑器，只补字段、校验、来源提示、固定操作区和新建/筛选工作流；部署层补全 Docker Compose、命令行用户管理和 README。

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL, React 19, TypeScript, Vite, Ant Design, TanStack Query, UV, Bun, Docker Compose

---

## 实施原则

- 保持当前资源风格 API，不做全量 envelope 重构。
- 不引入 `projects`、`recipes`、`features`、`characterization_sessions` 等超出本轮范围的实体。
- 现有测试必须持续通过，再叠加新测试。
- 先做后端兼容层和验证接口，再做前端字段扩展，避免 UI 先行导致协议反复变化。

## 关键文件地图

### 后端核心

- `backend/app/models/experiment.py`
- `backend/app/models/module_payload.py`
- `backend/app/repositories/experiment_repository.py`
- `backend/app/services/experiment_service.py`
- `backend/app/services/sample_service.py`
- `backend/app/services/file_asset_service.py`
- `backend/app/api/v1/endpoints/experiments.py`
- `backend/app/schemas/experiment.py`
- `backend/app/schemas/module_payload.py`

### 建议新增后端文件

- `backend/app/schemas/experiment_validation.py`
- `backend/app/services/experiment_validation_service.py`
- `backend/app/commands/create_user.py`
- `backend/app/commands/reset_password.py`
- `backend/alembic/versions/<new revision>_expand_mvp_0_2_payloads.py`

### 前端核心

- `frontend/src/shared/types/api.ts`
- `frontend/src/features/experiments/api.ts`
- `frontend/src/features/experiments/experiment-list-page.tsx`
- `frontend/src/features/experiments/components/experiment-table.tsx`
- `frontend/src/features/experiments/experiment-new-page.tsx`
- `frontend/src/features/experiments/experiment-editor-page.tsx`
- `frontend/src/features/experiments/use-experiment-editor.ts`
- `frontend/src/features/experiments/editor-types.ts`
- `frontend/src/features/experiments/experiment-detail-page.tsx`
- `frontend/src/features/experiments/components/*`

### 建议新增前端文件

- `frontend/src/features/experiments/components/experiment-source-banner.tsx`
- `frontend/src/features/experiments/components/editor-action-bar.tsx`
- `frontend/src/features/experiments/components/validation-summary.tsx`
- `frontend/src/features/experiments/components/history-clone-dialog.tsx`

### 部署与文档

- `backend/Dockerfile`
- `frontend/Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- `.env.example`
- `README.md`

---

### Task 1: 阶段一，补齐可部署性与用户命令行能力

**目标：** 让仓库从“本地开发态”提升为“可在实验室机器上启动完整前后端服务”，并补齐基础用户初始化命令。

**Files:**
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `.dockerignore`
- Create: `backend/app/commands/create_user.py`
- Create: `backend/app/commands/reset_password.py`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `backend/tests/commands/*`

- [x] 明确容器运行方式：
  - backend 使用 `uv sync --frozen` 构建依赖，运行时执行 `uv run alembic upgrade head` 后启动 API。
  - frontend 使用 Bun 构建静态资源，运行时用轻量静态服务器提供页面。
  - Compose 增加 `storage` volume，并把 `FILE_STORAGE_ROOT` 映射到容器内固定目录。

- [x] 编写 `backend/Dockerfile`：
  - 基础镜像使用 Python 3.12。
  - 复制 `pyproject.toml`、`uv.lock`，安装 UV 并执行 `uv sync --frozen --no-dev`。
  - 复制 `backend/app`、`backend/alembic`、`backend/alembic.ini`。
  - 默认命令不要使用 `fastapi dev`，改为适合容器运行的正式命令。

- [x] 编写 `frontend/Dockerfile`：
  - 构建阶段使用 Bun 安装依赖并执行 `bun run build`。
  - 运行阶段提供静态资源服务。
  - 确保可通过环境变量注入 API Base URL。

- [x] 重写 `docker-compose.yml`：
  - 保留 `postgres`。
  - 新增 `backend` 服务，依赖 `postgres`。
  - 新增 `frontend` 服务，对外暴露可访问端口。
  - 为数据库和文件存储配置持久化 volume。
  - 明确 `backend` / `frontend` / `postgres` 的端口与健康检查。

- [x] 扩展 `.env.example`：
  - 区分本地开发默认值和容器运行值。
  - 补充前端所需的 `VITE_API_BASE_URL` 示例。
  - 明确 `JWT_SECRET_KEY` 不能直接用于正式环境。

- [x] 新增 `create_user` 命令：
  - 支持 `--email`、`--name`、`--role`。
  - 密码交互输入两次确认。
  - 拒绝重复邮箱。

- [x] 新增 `reset_password` 命令：
  - 支持按邮箱重置。
  - 更新密码哈希并输出简短完成信息。

- [x] 补充命令测试：
  - `create_user` 创建 member/viewer/admin。
  - `reset_password` 修改已有用户密码。
  - 重复用户、未知邮箱等错误路径。

- [x] 更新 `README.md`：
  - 本地开发启动步骤。
  - Compose 启动步骤。
  - 创建管理员 / 普通用户命令。
  - 数据库迁移与常见故障说明。

**阶段验证：**
- `cd backend && uv run pytest tests/commands -v`
- `docker compose config`
- `docker compose up --build`
- 手工验证：
  - `http://localhost:<frontend_port>` 可访问
  - `http://localhost:<backend_port>/docs` 可访问
  - 新建管理员和普通用户命令可运行

**完成定义：**
- 非开发者按 README 即可启动系统。
- 不再需要手工拼接前后端容器启动命令。

**2026-04-23 实施记录：**
- 已新增 `backend/frontend` Dockerfile、Nginx SPA 配置、运行时 `runtime-config.js` 注入和 `create_user` / `reset_password` 命令。
- 已根据阶段一 review 修正两处问题：Compose 默认改为前端同源反代 `/api/*`、`/health`、`/docs`、`/openapi.json` 到后端；CLI 创建/重置密码时禁止空密码。
- 本地开发保留 `VITE_API_BASE_URL` 的 build-time 覆盖能力：`frontend/public/runtime-config.js` 默认仅注入空对象，避免 dev server 下 runtime 配置覆盖 Vite 环境变量。
- `frontend` 构建阶段额外固定 `bun install --network-concurrency=1`，用于规避干净 Linux 容器中的 tarball integrity 误报；本地 Bun 依然保持默认命令。
- 已验证：`cd backend && uv run pytest tests/commands -v`（`12 passed`）、`uv run ruff check .`、`uv run ruff format --check .`、`cd frontend && bun run test src/shared/config/env.test.ts src/shared/api/client.test.ts`（`6 passed`）、`bun run typecheck`、`bun run lint`、`bun run build`、`docker compose config`、`docker build -f backend/Dockerfile .`、`docker build -f frontend/Dockerfile .`。
- 当前桌面环境下直接执行 `docker compose up --build` 会触发 Docker Desktop gRPC 会话头异常；已通过预构建镜像并执行 `docker compose up -d --no-build --force-recreate` 验证三容器均可健康启动，前端 `http://localhost:5173`、前端域名下的 `/docs` / `/health` 反代、后端 `http://localhost:8000/docs` 和 `runtime-config.js` 均可访问。

---

### Task 2: 阶段二，补齐后端查询、分页与 clone 来源能力

**目标：** 让“实验列表 / 最近一条复制 / 历史复制”有稳定的后端支撑。

**Files:**
- Modify: `backend/app/repositories/experiment_repository.py`
- Modify: `backend/app/services/experiment_service.py`
- Modify: `backend/app/api/v1/endpoints/experiments.py`
- Modify: `backend/app/schemas/experiment.py`
- Modify: `backend/tests/api/test_experiments.py`

- [x] 扩展列表查询参数：
  - `mine`
  - `status` 支持单值或逗号分隔多值
  - `material_system`
  - `q`
  - `page`
  - `page_size`

- [x] 在 repository 中实现：
  - 可复用的过滤器构建逻辑
  - 总数查询
  - offset/limit 分页
  - 默认按 `updated_at desc, created_at desc`
  - `q` 至少匹配 `run_code`、`material_system`、`objective`

- [x] 更新响应模型：
  - `ExperimentListResponse` 增加 `page`、`page_size`
  - `ExperimentRead` 增加 `derived_from_run_code`

- [x] 明确“最近一条可复制实验”的后端规则：
  - 当前用户最近一条 `submitted` / `locked`
  - 若没有结果，前端依赖空列表处理，不单独新增接口

- [x] 调整 clone 源可见性判断：
  - 当前用户可复制自己的 `submitted` / `locked`
  - 其他用户仅可复制 `locked`
  - `draft` / `invalid` 禁止复制

- [x] 增加测试：
  - 多状态筛选
  - `material_system` 筛选
  - `q` 搜索
  - 分页返回 `total/page/page_size`
  - 最近可复制来源的排序语义
  - `submitted` / `locked` / `invalid` 的 clone 权限边界

**阶段验证：**
- `cd backend && uv run pytest tests/api/test_experiments.py -v`
- 手工验证：
  - `GET /api/v1/experiments?mine=true&status=submitted,locked&page=1&page_size=1`
  - `GET /api/v1/experiments?q=CVD-2026`

**完成定义：**
- 新建页无需专门后端接口也能完成“复制最近一条”和“历史搜索复制”。

**2026-04-23 实施记录：**
- 已把 `/api/v1/experiments` 扩展为支持 `mine`、`status` 多值、`material_system`、`q`、`page`、`page_size`，默认按 `updated_at desc, created_at desc` 排序并返回 `total/page/page_size`。
- 已在 `ExperimentRead` 中补充 `derived_from_run_code`，通过主表自关联直接返回 clone 来源编号。
- 已将 clone 规则调整为：本人可 clone 自己的 `submitted/locked`，他人实验仅 `locked` 可 clone，`draft/invalid` 明确拒绝。
- 已在 repository 层对 `derived_from_run` 做 eager load，避免列表返回 `derived_from_run_code` 时对 clone 行触发 N+1 查询。
- 已补充并通过实验列表与 clone 语义测试；新增用例覆盖多状态筛选、精确 `material_system`、全文 `q` 搜索、无效 `status` 值、分页元数据、最近可复制来源排序和 clone 权限边界。
- 已验证：`cd backend && uv run pytest tests/api/test_experiments.py -v`（`29 passed`）、`cd backend && uv run ruff check .`、`uv run ruff format --check .`、`uv run pytest`（`97 passed`）。
- 已在运行中的 Compose 后端上做手工验证：登录后访问 `GET /api/v1/experiments?mine=true&status=submitted,locked&page=1&page_size=1` 与 `GET /api/v1/experiments?q=CVD-2026`，均返回 `200` 和带 `page/page_size` 的响应结构。

---

### Task 3: 阶段三，补齐后端模块 schema、默认值与向后兼容

**目标：** 在不破坏旧 payload 的前提下，把本轮要补的字段真实持久化。

**Files:**
- Create: `backend/app/services/experiment_validation_service.py`
- Create: `backend/app/schemas/experiment_validation.py`
- Modify: `backend/app/models/module_payload.py`
- Modify: `backend/app/services/experiment_service.py`
- Modify: `backend/app/services/sample_service.py`
- Modify: `backend/alembic/versions/<new revision>_expand_mvp_0_2_payloads.py`
- Modify: `backend/tests/api/test_experiments.py`
- Modify: `backend/tests/api/test_samples.py`

- [x] 定义本轮 payload 默认值补齐函数：
  - `environment.indoor_humidity_percent -> null`
  - `precheck.hood_clean -> null`
  - `precheck.flange_blocked -> null`
  - `precheck.boat_contamination_level -> null`
  - `precheck.tube_contamination_level -> null`
  - `precursors.items[].brand -> ""`
  - `substrates.items[].treatment_params -> {temperature_C:null,duration_min:null,power_W:null,gas:""}`
  - `gas_program.segments[].components -> []`
  - `gas_program.segments[].note -> ""`
  - `characterization.methods[].enabled -> true`
  - `characterization.methods[].excitation_nm -> null`
  - `characterization.methods[].note -> ""`
  - `result_summary.quality_label -> "unknown"`
  - `result_summary.next_step -> ""`

- [x] 扩展模块保存与读取逻辑：
  - 读取时补默认值
  - 保存时保留前端暂未建模字段
  - clone 前先对旧 payload 做 normalize，再按 clone 规则应用

- [x] 补齐本轮字段持久化：
  - `environment.indoor_humidity_percent`
  - `precheck` 扩展字段
  - `precursors` 扩展字段
  - `substrates.treatment_params`
  - `gas_program.components` / `note`
  - `characterization.enabled` / `excitation_nm` / `note`
  - `result_summary.quality_label` / `next_step`

- [x] 明确 `quality_label` 同步策略：
  - `result_summary.quality_label` 是 payload 内主值
  - 保存 `result_summary` 时同步 `experiment_runs.quality_label`
  - 读取主实验时继续从主表返回 `quality_label`

- [x] 补充 Alembic 迁移：
  - 如果主表列无需变化，只新增必要索引或 server default 调整
  - 不做破坏性迁移
  - 迁移脚本要兼容已有数据库

- [x] 补充测试：
  - 旧 payload 读取默认值补齐
  - 新字段保存后刷新不丢
  - `quality_label` 在 payload 与主表间同步
  - `substrates.treatment_params` 不被覆盖掉

**阶段验证：**
- `cd backend && uv run pytest tests/api/test_experiments.py tests/api/test_samples.py -v`
- `cd backend && uv run alembic upgrade head`

**完成定义：**
- 新字段不仅前端可见，而且数据库刷新后仍保留。
- 旧实验记录不会因为缺字段而报错。

**2026-04-23 实施记录：**
- 已在 `backend/app/models/module_payload.py` 增加模块级 payload 归一化函数，统一为 `environment / precheck / precursors / substrates / gas_program / characterization / result_summary` 回填阶段三默认值，同时保留原 payload 里的扩展字段。
- 已把模块读取路径接到同一套归一化逻辑：`get_module`、`list_modules`、审计序列化以及实验导出都会返回补齐默认值后的 payload，旧记录缺字段时不再直接把缺口暴露给前端。
- 已把模块保存路径改为“先归一化再落库”；其中 `result_summary` 保存时会同步 `experiment_runs.quality_label`，而 `substrates` 保存后会把归一化后的 payload 继续传给样品同步链路。
- 已把 clone 的模块复制改成先归一化源 payload 再写入目标实验；复制后的 `environment` 只保留 `sample_env` 并清空异常备注，`precheck` 会重置为待重新确认状态，因此旧实验复制出来的 `brand / treatment_params / components / note / enabled / excitation_nm / next_step` 等字段会落到新结构里，但现场检查读数不会被沿用。
- 已在 `SampleService.sync_substrate_samples()` 中同步 `treatment_params` 到样品 `metadata_json`，并保留用户已有元数据，避免 substrate 重同步时把这组参数丢掉。
- 已新增 Alembic revision `20260423_0008_expand_mvp_0_2_payloads.py` 作为阶段三的非破坏性迁移标记，保证已有数据库可以平滑升级到这轮应用层 payload 演进。
- 已补充并通过测试：旧 payload 读时默认值补齐、新字段保存后刷新不丢、`result_summary.quality_label -> experiment_runs.quality_label` 同步、legacy payload clone 后归一化，以及 `substrates.treatment_params` 在样品同步链路中不丢失。
- 已验证：`cd backend && uv run pytest tests/api/test_experiments.py tests/api/test_samples.py -v`（`46 passed`）、`cd backend && uv run ruff check .`、`uv run ruff format --check .`、`uv run pytest`（`101 passed`）。
- 已验证迁移：在临时 SQLite 数据库上执行 `cd backend && uv run alembic upgrade head`，成功从 `20260423_0001` 升级到 `20260423_0008`。

---

### Task 4: 阶段四，补齐 validate 接口、submit 详细错误与 clone 语义冻结

**目标：** 把校验和 clone 从“隐式行为”变成“稳定协议”。

**Files:**
- Create: `backend/app/schemas/experiment_validation.py`
- Create: `backend/app/services/experiment_validation_service.py`
- Modify: `backend/app/services/experiment_service.py`
- Modify: `backend/app/api/v1/endpoints/experiments.py`
- Modify: `backend/tests/api/test_experiments.py`
- Modify: `backend/tests/api/test_experiment_audit.py`

- [x] 新增 `POST /api/v1/experiments/{id}/validate`
  - 返回 `ok/errors/warnings`
  - `errors[].module_key/field_path/message`
  - `warnings[].module_key/field_path/message`

- [x] 把 submit 前校验从 `ExperimentService` 内联逻辑抽到独立服务：
  - `validate_experiment(experiment_id)` 供 `validate` 和 `submit` 共用
  - `submit` 在失败时返回与 `validate` 相同结构，状态码 `422`

- [x] 落实本轮阻塞错误：
  - 主信息缺失
  - 前驱体为空
  - 温区为空
  - 单个温区程序为空
  - 温区时间不递增
  - 气体时间非法或重叠
  - `seal_intact=false` 且无 `risk_note`
  - 文件缺少 `method`
  - 文件缺少 `experiment_id`

- [x] 落实本轮警告：
  - 室内温度范围异常
  - 湿度为空或超范围
  - 瓷舟/石英管污染等级过高
  - precursor 缺少 `batch_no`
  - 文件未关联样品
  - `quality_label = unknown`

- [x] 严格实现 clone 语义：
  - `basic_info` 复制 `experiment_type/material_system/objective`，重置 `operator_id/experiment_date`
  - `environment` 只保留 `sample_env`
  - `precheck` 全重置
  - `precursors/substrates/furnace_program/gas_program` 完整复制
  - `process_observation` 不复制
  - `characterization` 复制计划字段，清空 `result`
  - `result_summary` 重置为 `unknown/""/""`
  - 文件与审计不复制

- [x] 增加覆盖测试：
  - `validate` 正常返回 warning/error
  - `submit` 返回结构化详情而不是单句错误
  - clone 新语义覆盖旧 payload 与新 payload
  - clone 后 banner 所需 `derived_from_run_code` 可用

**阶段验证：**
- `cd backend && uv run pytest tests/api/test_experiments.py tests/api/test_experiment_audit.py -v`
- 手工验证：
  - `POST /api/v1/experiments/{id}/validate`
  - 对有错误的 draft 调用 `submit`
  - 从 `submitted` 和 `locked` 实验发起 clone

**完成定义：**
- 校验细节已经成为稳定 API。
- clone 行为不再依赖阅读测试推断。

**2026-04-23 实施记录：**
- 已新增 [experiment_validation.py](/Users/wangsiyuan/编程/小项目/CVD实验数据采集系统/backend/app/schemas/experiment_validation.py) 与 [experiment_validation_service.py](/Users/wangsiyuan/编程/小项目/CVD实验数据采集系统/backend/app/services/experiment_validation_service.py)，把阻塞错误和警告统一收敛为 `ok/errors/warnings` 结构，`errors[] / warnings[]` 都稳定返回 `module_key / field_path / message`。
- 已新增 `POST /api/v1/experiments/{id}/validate`，并把 `submit` 的前置校验切换到同一服务；校验失败时，`submit` 直接返回与 `validate` 相同的结构化 body 和 `422`，不再只返回单句 `"Submit validation failed"`。
- 已把本轮阻塞错误落到结构化字段路径：主信息缺失、前驱体为空或项格式错误、温区为空、单个温区程序为空、温区时间不递增、气体时间非法/重叠、`seal_intact=false` 但无 `risk_note`、文件缺少 `method`；另外对异常文件记录的 `experiment_id` 缺失保留了防御式检查，并通过服务层测试固定这条分支，但它不是正常 API 写入路径下会自然触发的场景。
- 已把本轮警告落地：室内温度超范围、湿度缺失或超范围、瓷舟/石英管污染等级过高、precursor 缺少 `batch_no`、文件未关联样品、`quality_label=unknown`。
- 已冻结 clone 语义：`basic_info` 现在会在克隆后重建，复制 `experiment_type/material_system/objective` 并重置 `operator_id/experiment_date`；`environment` 仅保留 `sample_env`；`precheck` 全重置；`precursors/substrates/furnace_program/gas_program` 继续复制；`process_observation` 不复制；`characterization` 保留计划字段并清空 `result`；`result_summary` 重置为 `quality_label=unknown / summary_result=\"\" / next_step=\"\"`；文件与审计继续不复制。
- 已补充测试覆盖：`validate` 的结构化 `errors/warnings`、`submit` 与 `validate` 一致的失败结构、clone 的新模块语义（`basic_info / environment / precheck / characterization / result_summary`）、以及 `validate` 与失败 `submit` 不写审计事件。
- 已验证：`cd backend && uv run pytest tests/api/test_experiments.py tests/api/test_experiment_audit.py -v`、`cd backend && uv run ruff check .`、`uv run ruff format --check .`、`uv run pytest`。
- 已做手工 HTTP 验证：临时本地服务上 `POST /api/v1/experiments/{id}/validate` 返回 `200` 且带结构化 `errors/warnings`，对同一坏 draft 的 `POST /submit` 返回同结构 `422`，从 `submitted` 与 `locked` 实验发起 clone 均返回 `201` 且带 `derived_from_run_code`。

---

### Task 5: 阶段五，补齐前端列表、新建页和来源提示工作流

**目标：** 把“查找实验 -> 复制来源 -> 进入编辑”的主入口补完整。

**Files:**
- Modify: `frontend/src/shared/types/api.ts`
- Modify: `frontend/src/features/experiments/api.ts`
- Modify: `frontend/src/features/experiments/experiment-list-page.tsx`
- Modify: `frontend/src/features/experiments/components/experiment-table.tsx`
- Modify: `frontend/src/features/experiments/experiment-new-page.tsx`
- Create: `frontend/src/features/experiments/components/history-clone-dialog.tsx`
- Create: `frontend/src/features/experiments/components/experiment-source-banner.tsx`
- Modify: `frontend/src/features/experiments/experiment-detail-page.tsx`
- Modify: `frontend/src/features/experiments/experiment-editor-page.tsx`
- Modify: `frontend/src/features/experiments/experiment-state-actions.tsx`
- Modify: `frontend/src/features/experiments/experiment-new-page.test.tsx`
- Modify: `frontend/src/features/experiments/experiment-list-page.test.tsx`
- Modify: `frontend/src/features/experiments/experiment-detail-page.test.tsx`
- Modify: `frontend/src/features/experiments/experiment-editor-page.test.tsx`
- Modify: `frontend/src/features/experiments/experiment-state-actions.test.tsx`

- [x] 扩展前端 Experiment 类型：
  - `derived_from_run_code`
  - `page/page_size` for list response

- [x] 扩展 experiments API：
  - 列表支持 `mine/status/material_system/q/page/page_size`
  - clone 继续复用现有接口
  - JSON / Excel 导出按钮留在列表操作列

- [x] 改造实验列表页：
  - 新增搜索框 `q`
  - 状态筛选
  - 材料体系筛选
  - “我的实验”开关
  - 分页器
  - 操作列增加导出 JSON / Excel

- [x] 改造新建页：
  - 入口 A：空白实验
  - 入口 B：复制我的最近一条实验，复用列表接口取 `page=1&page_size=1&mine=true&status=submitted,locked`
  - 入口 C：历史实验复制，使用弹窗/抽屉承载列表选择

- [x] 在详情页和编辑页接入来源 banner：
  - 若存在 `derived_from_run_id` / `derived_from_run_code`，显示“本实验派生自 …”
  - 增加固定说明文案，解释哪些字段已重置

- [x] 补充前端测试：
  - 三种入口可用
  - 最近一条为空时的提示
  - 来源 banner 显示
  - 列表筛选与分页参数传递正确

**阶段验证：**
- `cd frontend && bun run test`
- 手工验证：
  - 新建页三种入口都能触发真实行为
  - 列表页筛选、搜索、分页同时工作
  - clone 后详情/编辑页能看到来源 banner

**完成定义：**
- 用户不再需要先手动进入某条 locked 实验详情页才能复制。

**2026-04-24 实施记录：**
- 已把前端实验类型与列表响应对齐到阶段二/四后的后端协议：`ExperimentRead` 现支持 `derived_from_run_code`，`ExperimentListResponse` 现支持 `page/page_size`，`listExperiments` 已支持 `mine/status/material_system/q/page/page_size` 组合查询。
- 已重构实验列表页：新增搜索框、材料体系筛选、多状态勾选、“我的实验”开关与真实分页，并在操作列加入 JSON / Excel 导出按钮；列表导出继续复用现有后端导出接口，不额外引入新 API。
- 已重构新建页为三入口：空白实验、复制我的最近一条、历史实验复制；其中“最近一条”严格复用列表接口 `page=1&page_size=1&mine=true&status=submitted,locked`，历史复制通过 `history-clone-dialog` 进行搜索、筛选、分页与直接 clone，并额外收紧为“`submitted` 仅在开启只看我的实验时可选，且状态筛选至少保留一个可 clone 状态”，避免弹窗暴露后端必拒绝的来源。
- 已在详情页和编辑页接入 `experiment-source-banner`，固定说明 clone 后哪些字段会被保留或重置，并对来源实验提供可点击跳转；同时同步修正详情页生命周期操作，前端 clone 按钮规则改为“自己 submitted/locked 可 clone，其他人仅 locked 可 clone”，与后端权限一致。
- 已补充并通过前端测试：列表筛选参数与分页传参、最近一条为空提示、历史复制弹窗复制链路、详情页与编辑页来源 banner 显示，以及 owner clone submitted 实验的按钮可见性与跳转行为。
- 已验证：`cd frontend && bun run lint`、`bun run typecheck`、`bun run test`（`15 passed / 60 passed`）。

---

### Task 6: 阶段六，补齐编辑器字段、固定操作区与验证 UX

**目标：** 在保留当前卡片式编辑器结构的前提下，把它升级到 Beta 可试用水平。

**Files:**
- Modify: `frontend/src/features/experiments/editor-types.ts`
- Modify: `frontend/src/features/experiments/use-experiment-editor.ts`
- Modify: `frontend/src/features/experiments/experiment-editor-page.tsx`
- Create: `frontend/src/features/experiments/components/editor-action-bar.tsx`
- Create: `frontend/src/features/experiments/components/validation-summary.tsx`
- Modify: `frontend/src/features/experiments/components/environment-section.tsx`
- Modify: `frontend/src/features/experiments/components/precheck-section.tsx`
- Modify: `frontend/src/features/experiments/components/precursors-section.tsx`
- Modify: `frontend/src/features/experiments/components/substrates-section.tsx`
- Modify: `frontend/src/features/experiments/components/gas-program-section.tsx`
- Modify: `frontend/src/features/experiments/components/characterization-section.tsx`
- Modify: `frontend/src/features/experiments/components/result-summary-section.tsx`
- Modify: `frontend/src/features/experiments/experiment-editor-page.test.tsx`

- [x] 扩展 `editor-types.ts`：
  - `basic_info`：允许编辑 `experimentType`
  - `environment`：增加 `indoorHumidityPercent`
  - `precheck`：增加 `hoodClean`、`flangeBlocked`、`boatContaminationLevel`、`tubeContaminationLevel`
  - `precursors`：增加 `brand/concentration/concentrationUnit/method/meltingTemperatureC/spinSpeedRpm/preSpinSpeedRpm/preparationTimeMin/massMg/batchNo`
  - `substrates`：增加 `treatmentParams`
  - `gas_program`：增加 `components`、`note`
  - `characterization`：增加 `enabled`、`excitationNm`、`note`
  - `result_summary`：增加 `qualityLabel`、`nextStep`

- [x] 更新各模块组件：
  - 使用现有卡片结构，不重写页面框架
  - 方法/处理方式的条件字段按计划显示
  - `qualityLabel` 提供受控选项
  - `treatmentParams` / `components` 使用最小可编辑 UI

- [x] 新增固定操作区组件：
  - 持续显示保存状态
  - 返回详情
  - 提交实验
  - 非 draft 状态显示显式只读提示

- [x] 新增验证汇总组件：
  - 提交前先调用 `validate`
  - 若有 errors/warnings，在顶部展示汇总
  - 点击错误项滚动到对应模块卡片

- [x] 增加页面离开保护：
  - 存在保存中的请求时拦截离开
  - 保存失败且有未持久化修改时给出提示

- [x] 确认 autosave 不回归：
  - 继续采用当前“区块级 debounced autosave”
  - 补字段后仍保留后端未建模字段
  - `result_summary` 保存时同步 `quality_label`

- [x] 增加编辑器测试：
  - 新字段渲染
  - 自动保存 payload 正确
  - 提交错误面板显示
  - `quality_label` 编辑与同步
  - 非 draft 只读

**阶段验证：**
- `cd frontend && bun run test`
- `cd frontend && bun run typecheck`
- `cd frontend && bun run lint`
- 手工验证：
  - 刷新页面后新增字段不丢失
  - 提交失败时可看到逐项错误和警告
  - `quality_label` 改变后详情页与列表都能看到结果

**完成定义：**
- 编辑器不再只是最小字段演示，而是能支撑真实实验记录。

**2026-04-24 实施记录：**
- 已扩展前端编辑器值模型、初始化、序列化和 merge 逻辑，覆盖 `basic_info.experimentType`、环境湿度、预检查扩展项、前驱体扩展字段、基底 `treatment_params`、气体程序 `components/note`、表征 `enabled/excitationNm/note`、结果总结 `qualityLabel/nextStep`；保存时继续保留各条目 `sourcePayload` 中未被 UI 建模的字段，并将气体组分写回为后端约定的 `name/flow_sccm` 结构（`fraction`/`ratio_percent` 由后端根据流量之和自动计算）。
- 已在现有卡片式编辑器内补齐最小可编辑 UI：前驱体按方法显示溶液/旋涂/熔融相关字段，基底在填写处理方式后显示处理参数，气体程序支持组分列表，表征方法支持启用开关、激发波长和备注，`qualityLabel` 使用固定受控选项。
- 已新增 `editor-action-bar` 作为底部固定操作区，持续展示 run code、状态、自动保存摘要、返回详情和提交动作；非 draft 实验保持只读提示并隐藏提交入口。
- 已新增 `validation-summary` 并接入提交流：提交前先调用 `POST /api/v1/experiments/{id}/validate`，有错误时阻止 submit 并展示 `errors/warnings` 汇总，点击条目会滚动到对应模块卡片；若后端 submit 仍返回结构化 422，也会复用同一汇总。
- 已增加离开保护：存在保存中请求，或保存失败且仍有未持久化修改时，会通过浏览器 `beforeunload`、返回详情动作与 Data Router 路由拦截提示用户。
- 已补充提交流防竞态：提交验证过程中禁用模块输入，并在 validate 通过后重新检查 dirty 状态，避免验证窗口内的新增修改被无意提交。
- 已补充并通过编辑器测试：新字段渲染、扩展字段 autosave payload、污染等级清空回写 `null`、`quality_label/next_step` 保存、列表缓存失效、验证汇总和滚动、保存失败离开提示、Data Router 路由拦截、非 draft 只读、提交验证期间禁用输入，以及既有 autosave 缓存回归。
- 已验证：`cd frontend && bun run lint`、`bun run typecheck`、`bun run test`（`15 passed / 66 passed`）。

---

### Task 7: 阶段七，补词表 seed、README 和最终回归

**目标：** 让 Beta 具备最小可交接性，并沉淀本轮结果。

**Files:**
- Modify: `backend/alembic/versions/20260423_0007_add_vocabularies_and_file_fields.py` 或新增 seed 迁移
- Modify: `README.md`
- Modify: `IMPLEMENTATION_GAP_REPORT_2026-04-23.md`（必要时）
- Create: `IMPLEMENTATION_GAP_REPORT_2026-<new date>.md`

- [x] 补齐词表 seed：
  - `substrate_type`
  - `substrate_treatment_method`
  - `gas_label`
  - `quality_label`
  - 校对现有 `characterization_method`

- [x] 检查前端下拉是否接入正确词表 key。

- [x] 完成 README 最终更新：
  - 本地开发
  - Docker 启动
  - 用户初始化
  - 常见验证步骤

- [x] 跑完整质量门禁：
  - `cd backend && uv run ruff check .`
  - `cd backend && uv run ruff format --check .`
  - `cd backend && uv run pytest`
  - `cd frontend && bun run lint`
  - `cd frontend && bun run typecheck`
  - `cd frontend && bun run test`

- [x] 输出新对照报告：
  - 完成了哪些 P0
  - 哪些 P1 暂未做
  - 本轮固化的 clone / validation / schema 决策
  - 仍然明确延期的事项

**阶段验证：**
- 完整质量门禁全绿
- `docker compose up --build` 可用
- README 可独立指导部署

**完成定义：**
- MVP-0.2 具备对外试用和后续迭代的稳定基线。

**2026-04-24 实施记录：**
- 已新增 seed 迁移 `20260424_0009_seed_mvp_0_2_vocabularies.py`，补齐 `substrate_type`、`substrate_treatment_method`、`gas_label`，并保留既有 `quality_label`、`characterization_method` 种子；新增后端测试覆盖 MVP-0.2 必需词表 key。
- 已校对前端词表使用：文件上传页继续读取 `characterization_method`，词表后台 key 选项来自后端数据；测试示例中的旧 `gas` key 已改为 `gas_label`。
- 已更新 `README.md`，补齐本地开发、Docker 启动、用户初始化、质量命令、常见验证步骤、当前行为边界和 Docker Desktop gRPC 异常时的拆分验证路径。
- 已输出 `IMPLEMENTATION_GAP_REPORT_2026-04-24.md`，记录本轮完成的 P0、暂未完成的 P1、已固化的 clone / validation / schema / vocabulary 决策和延期事项。
- 已验证：`cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest`（`107 passed`）；`cd frontend && bun run lint && bun run typecheck && bun run test`（`15 passed / 66 passed`）。
- Docker 验证：`docker compose config` 通过；当前桌面环境直接执行 `docker compose up --build` 仍触发 Docker Desktop gRPC header 异常，已通过 `docker build -f backend/Dockerfile -t cvd-backend .`、`docker build -f frontend/Dockerfile -t cvd-frontend .` 与 `docker compose up -d --no-build --force-recreate` 验证三容器均 healthy，后端 `/health` 和前端 `runtime-config.js` 可访问。

---

## 推荐执行顺序

1. 先完成阶段一，确保部署和用户初始化不再阻塞。
2. 再做阶段二和阶段三，稳定后端筛选、schema 与兼容层。
3. 第四阶段冻结 validate 和 clone 语义，避免前端来回返工。
4. 第五、第六阶段集中补前端交互与字段。
5. 最后收口到阶段七，补 seed、README 和回归。

## 风险提醒

- `quality_label` 同步是本轮最容易出现前后端状态漂移的点，必须优先加测试。
- clone 语义从“只能 locked”改成“自己 submitted/locked + 他人 locked”后，权限测试要重写。
- 列表分页一旦引入，前端缓存 key 和详情返回后的列表失效策略都要同步调整。
- Docker 化不要和业务改动混在同一提交里，建议单独阶段交付。

## 阶段完成的建议提交边界

- `infra: add docker deployment and user management commands`
- `backend: add experiment filters pagination and clone source rules`
- `backend: expand payload schema and add validation details`
- `frontend: add list filters new experiment clone flows and source banners`
- `frontend: expand editor fields and validation UX`
- `docs: update readme seeds and mvp-0-2 status report`

## 交付验收命令

```bash
docker compose up --build
cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest
cd frontend && bun run lint && bun run typecheck && bun run test
```
