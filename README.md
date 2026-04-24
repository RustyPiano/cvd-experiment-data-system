# CVD 实验数据采集系统

当前仓库已完成的能力分为两部分：

## 当前前端能力

- Bun + Vite + React + TypeScript 工程初始化
- Ant Design 主题、全局样式与应用壳层
- Bearer Token 登录、登出与本地会话持久化
- 受保护路由与基础导航
- `/login`
- `/experiments`
- `/experiments/new`
- `/experiments/:id`
- `/experiments/:id/files`
- `/samples/:id`
- `/admin/vocabularies`
- `/experiments/:id/edit` 已接通全部 V1 模块 key 的 Beta 编辑器
- `basic_info / environment / precheck / precursors / substrates / furnace_program / gas_program / process_observation / characterization / result_summary`
- draft 自动保存、实验日期修正、区块级保存状态、固定操作区、带完整度评分的提交前验证汇总和 `submit` 提交闭环
- `/experiments/:id` 已接通 `return-to-draft / lock / invalidate / clone`
- 详情页已接通文件概览、审计轨迹、JSON/Excel 导出入口
- 详情页已接通样品概览，并支持跳转样品详情
- 文件页已接通文件列表、筛选、上传、下载、软删除
- 样品详情页已接通样品读取、draft 编辑、关联文件查看与下载
- 受控词表后台已接通列表筛选、创建、编辑与启停用
- 前端实现计划文档，见 [docs/superpowers/plans/2026-04-23-frontend-foundation-and-access-flow.md](/Users/wangsiyuan/编程/小项目/CVD实验数据采集系统/docs/superpowers/plans/2026-04-23-frontend-foundation-and-access-flow.md)

当前前端尚未完成的部分：

- 文件预览、批量上传和更细的元数据编辑
- 更细的运行时性能优化

## 本轮交付质量状态

- 2026-04-23 已完成一次 subagent 审核，并修正了首轮前端基础实现中的关键问题。
- 登出现在会清空 TanStack Query 缓存，避免跨账号残留上一位用户的实验数据。
- 实验详情页和编辑器壳层在请求失败时会显示错误态，不再返回空白页面。
- 统一 API client 现在兼容 `204`、JSON 和纯文本错误响应，避免非 JSON 响应被误解析成 `SyntaxError`。
- 实验列表、详情和新建页移除了 `Button` 内嵌 `Link` 的无效交互结构，并补上创建失败提示。
- 当前实验编辑器现已覆盖全部 V1 模块 key、draft 自动保存、draft 实验日期修正、固定底部操作区、提交前验证完整度汇总和提交闭环；非 draft 实验会切换为只读。
- 实验详情页现已按权限和状态显示 `return-to-draft / lock / invalidate / clone` 按钮；`locked` 实验仅允许派生草稿。
- 实验详情页现在会并行显示文件概览、审计轨迹，并提供结构化 JSON / Excel 导出按钮。
- 实验详情页现在会并行显示样品概览，并支持直接进入样品详情页。
- 文件页现在支持按方法和文件类别筛选，并接通带鉴权的文件下载、draft 上传和软删除。
- 文件上传表单会读取 `characterization_method` 词表与当前实验样品列表，支持可选 `sample_id` 关联。
- 样品详情页现在会读取样品本体、所属实验和关联文件；owner/admin 在 `draft` 下可直接编辑样品字段并保存。
- 受控词表后台现在已接通 `/admin/vocabularies`，支持 admin 列表筛选、创建、编辑和启停用；非 admin 会隐藏侧栏入口并在直达路由时收到权限提示。
- 编辑器 autosave 现在会先同步最新表单快照，再调度保存，避免连续编辑时遗漏后改动区块。
- 当前模块 autosave 会保留后端 payload 中前端暂未建模的字段，避免最小表单覆盖掉已有结构化数据。
- 编辑器保存失败或保存中离开页面时会提示；提交前会调用 `validate`，显示 `completion_score / blocking_count / warning_count` 和模块跳转按钮，有 `errors` 时阻止提交并展示逐项问题。
- 生命周期按钮现在在状态切换请求进行中互斥禁用，避免同一实验被前端连续触发冲突动作。
- 前端生产构建现在使用 Vite/Rolldown vendor 拆包，将 React、router/query、Ant Design、rc 依赖拆成独立 chunk，避免超过 500 kB 的 chunk size 警告。
- 当前完整质量门禁：后端 `ruff check / ruff format --check / pytest` 通过（`123 passed`），前端 `lint / typecheck / test` 通过（`71 passed`），前端 `build` 通过且无 Vite chunk size 警告。

## 当前后端能力

- FastAPI 服务入口
- `users` 用户模型
- JWT 登录鉴权
- `pwdlib + Argon2id` 密码哈希
- 管理员初始化命令
- `experiment_runs` 主表
- 实验新建、列表、详情、更新
- 实验 `submit / lock / invalidate / clone`
- 审计日志写入与查询
- 模块化 payload 保存、读取与复制
- 样品主表、样品编号和样品 CRUD
- 文件资产上传、下载、软删除与实验/样品关联
- 实验级结构化 JSON 导出
- 单实验 Excel 导出
- 单实验 analysis-ready 归一化导出
- 受控词表默认种子与最小管理 CRUD；MVP-0.2 必需 key 包括 `material_system / sample_env / precursor_method / substrate_type / substrate_treatment_method / gas_label / characterization_method / quality_label`
- Alembic 迁移 `20260423_0001` 到 `20260425_0011`
- 前端联调 handoff 文档，见 [docs/frontend-backend-handoff.md](/Users/wangsiyuan/编程/小项目/CVD实验数据采集系统/docs/frontend-backend-handoff.md)

## 环境准备

```bash
uv --version
bun --version
docker --version
docker compose version
```

## 本地开发启动

```bash
cp .env.example .env
docker compose up -d postgres

cd backend
uv venv
uv sync
cp ../.env.example .env
uv run alembic upgrade head
uv run python -m app.commands.create_user --email admin@example.com --name Admin --role admin
uv run fastapi dev app/main.py --host 0.0.0.0 --port 8000

cd ../frontend
bun install
bun run dev --host 0.0.0.0 --port 5173
```

## Docker Compose 启动

```bash
cp .env.example .env
# 首次启动前请至少替换 POSTGRES_PASSWORD 和 JWT_SECRET_KEY。
docker compose config
docker compose up --build
```

启动后默认入口：

- 前端：`http://localhost:5173`
- 后端 OpenAPI：`http://localhost:8000/docs`
- 健康检查：`http://localhost:8000/health`
- Compose 会在 backend 容器启动时自动执行 `uv run alembic upgrade head`。
- 首次启动后需要进入 backend 容器或本地 `backend/` 目录运行用户创建命令。
- 如果当前 Docker Desktop 环境触发 `failed to dial gRPC`，可先分别执行 `docker build -f backend/Dockerfile -t cvd-backend .` 和 `docker build -f frontend/Dockerfile -t cvd-frontend .`，再执行 `docker compose up -d --no-build --force-recreate`。

## 用户命令

创建用户：

```bash
cd backend
uv run python -m app.commands.create_user --email admin@example.com --name Admin --role admin
uv run python -m app.commands.create_user --email member@example.com --name Member --role member
uv run python -m app.commands.create_user --email viewer@example.com --name Viewer --role viewer
```

以上命令会交互式要求输入并确认密码；密码不会写入 shell history。

重置密码：

```bash
cd backend
uv run python -m app.commands.reset_password --email member@example.com
```

兼容旧初始化命令：

```bash
cd backend
uv run python -m app.commands.create_admin --email admin@example.com --name Admin
```

## 前端联调准备

- 默认后端地址：`http://127.0.0.1:8000`
- OpenAPI 文档：`http://127.0.0.1:8000/docs`
- 本地运行时配置文件：`frontend/public/runtime-config.js`，默认不覆盖 `VITE_API_BASE_URL`
- Compose 默认通过 Nginx 同源反代 `/api/*`、`/health`、`/docs` 和 `/openapi.json` 到后端容器
- Compose 运行时通过 `VITE_API_BASE_URL` 覆盖前端容器里的 `runtime-config.js`；默认值为 `/`
- 如果前后端部署在不同域名或不同端口上，需要把 `VITE_API_BASE_URL` 和 `CORS_ALLOW_ORIGINS` 一起改成可访问地址
- 本地 Vite 开发端口 `5173/4173` 已默认加入 `CORS_ALLOW_ORIGINS`
- 详细联调约定见 [docs/frontend-backend-handoff.md](/Users/wangsiyuan/编程/小项目/CVD实验数据采集系统/docs/frontend-backend-handoff.md)

## 质量命令

后端：

```bash
cd backend
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

前端：

```bash
cd frontend
bun run lint
bun run typecheck
bun run test
bun run build
```

完整回归建议按以下顺序执行：

```bash
cd backend
uv run ruff check .
uv run ruff format --check .
uv run pytest

cd ../frontend
bun run lint
bun run typecheck
bun run test

cd ..
docker compose config
docker compose up --build
```

## Docker Compose 说明

- `backend` 容器会先执行 `uv run alembic upgrade head`，再启动 `uvicorn app.main:app`。
- `frontend` 容器会在启动时生成 `runtime-config.js`，默认以同源 `/api` 方式访问后端；如需跨域访问，可覆盖 `VITE_API_BASE_URL`。
- `postgres_data` 和 `storage_data` 两个命名卷分别持久化数据库与实验文件。

## 常见故障

- `uv sync` 失败：删除 `backend/.venv` 后重新执行 `uv venv && uv sync`。
- `bun install` 失败：检查 Bun 版本与 `frontend/bun.lock` 是否一致，再重装依赖。
- `docker compose up --build` 失败：先运行 `docker compose config` 检查 `.env` 配置是否完整。
- 数据库迁移异常：在 `backend/` 下先执行 `uv run alembic current`，确认 revision 后再决定 `upgrade` 或 `downgrade`。

## 当前接口

- 认证
- `GET /health`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

- 实验
- `GET /api/v1/experiments`
- `POST /api/v1/experiments`
- `GET /api/v1/experiments/{id}`
- `PATCH /api/v1/experiments/{id}`
- `POST /api/v1/experiments/{id}/submit`
- `POST /api/v1/experiments/{id}/return-to-draft`
- `POST /api/v1/experiments/{id}/lock`
- `POST /api/v1/experiments/{id}/invalidate`
- `POST /api/v1/experiments/{id}/clone`
- `POST /api/v1/experiments/{id}/validate`
- `GET /api/v1/experiments/{id}/export`
- `GET /api/v1/experiments/{id}/export/json`
- `GET /api/v1/experiments/{id}/export/excel`
- `GET /api/v1/experiments/{id}/export/analysis`
- `GET /api/v1/experiments/{id}/audit-events`
- `GET /api/v1/experiments/{id}/modules`
- `GET /api/v1/experiments/{id}/modules/{module_key}`
- `PUT /api/v1/experiments/{id}/modules/{module_key}`

- 样品
- `GET /api/v1/samples`
- `POST /api/v1/experiments/{id}/samples`
- `GET /api/v1/samples/{id}`
- `PATCH /api/v1/samples/{id}`

- 文件
- `GET /api/v1/files`
- `POST /api/v1/experiments/{id}/files`
- `GET /api/v1/files/{id}`
- `GET /api/v1/files/{id}/download`
- `DELETE /api/v1/files/{id}`

- 词表
- `GET /api/v1/vocabularies`
- `GET /api/v1/admin/vocabularies`
- `POST /api/v1/admin/vocabularies`
- `PATCH /api/v1/admin/vocabularies/{id}`

## 当前行为边界

- `viewer` 只能查看 `submitted/locked` 实验，不能创建和克隆。
- `logout` 在当前 Bearer Token 模式下用于显式结束客户端会话；实际失效方式是前端清除本地令牌，不引入服务端黑名单。
- 当前密码哈希方案固定为 `Argon2id`；旧 `bcrypt` 哈希不再兼容。
- 后端已开放本地前端开发所需 CORS，并暴露 `Content-Disposition` 供文件下载和导出读取文件名。
- `member` 可以创建自己的草稿，查看自己的实验，以及查看其他人的 `submitted/locked` 实验。
- `invalid` 实验默认从列表隐藏；显式传 `status=invalid` 才返回。
- owner/admin 当前可以将自己的 `draft/submitted` 实验直接作废；`locked` 实验仅允许 clone。
- `submitted` 实验现在支持显式退回 `draft`，并写入审计日志。
- `PATCH /api/v1/experiments/{id}` 仅允许更新 `draft`；其中 `experiment_date` 可修正主记录日期，但不会重算或改写创建时生成的 `run_code`。
- 模块 payload 当前支持 `basic_info`、`environment`、`precheck`、`precursors`、`substrates`、`furnace_program`、`gas_program`、`process_observation`、`characterization`、`result_summary`。
- `clone` 权限规则：owner/admin 可从自己的 `submitted/locked` 实验发起，非 owner 只能从 `locked` 实验发起；新实验会回到 `draft`。
- `clone` 会复制主实验参数、模块 payload 和样品，但不会复制 `summary_result`、作废原因、状态时间戳和已上传文件；新样品会按新实验编号重新分配 `sample_code`。
- 提交前校验现在覆盖主字段、typed 模块 payload、前驱体、基底、炉温、气体、预检查、表征和文件关联：至少一个前驱体、至少一个温区程序、温区时间严格递增；如果填写了基底或气体程序，则要求角色、类型、时间段和流量等数据库关键字段合法；`seal_intact=false` 时必须填写 `risk_note`；`quality_label=unknown`、环境越界、污染程度偏高、缺少批号或文件未关联样品会返回 warning。校验响应包含 `completion_score`、`blocking_count` 和 `warning_count`，前端据此展示提交前完整度和跳转目标。
- `substrates` 模块会同步生成或更新 `TOP/BOTTOM` 样品；移除某一基底角色时，未被文件或子样品引用的样品会标记 `deleted_at/deleted_by_id` 并从默认列表隐藏，而不是物理删除。
- 如果后续重新添加已软删除的 `TOP/BOTTOM` 角色，后端会恢复保留的样品行并更新字段，避免唯一 `sample_code` 冲突。
- 模块 payload 的非法对象形状会在后端转成 `422`，避免把脏 JSON 打成 `500`。
- 手工样品创建当前支持 `top`、`bottom`、`product`、`control`；样品编号由后端根据实验 `run_code` 自动生成，例如 `S-2026-0001-TOP`、`S-2026-0001-PRODUCT-A`。
- 文件资产当前采用本地文件系统存储，metadata 入库；上传只能写入 `draft` 实验，删除只做软删除标记并隐藏访问。
- 上传文件时要求提供 `method`，支持 `file_category=raw|processed` 与可选 `note`；响应中会返回 `download_url`。
- 上传大小当前默认限制为 `50 MiB`，可通过 `FILE_UPLOAD_MAX_BYTES` 调整。
- 文件必须归属一个实验；可选关联一个样品，但 `sample_id` 必须属于同一实验。
- 历史字段 `file_kind` 仅作为兼容别名接受输入，公开响应统一使用 `method`。
- 同一实验内重复 `sha256` 文件会在 metadata 中标记重复来源。
- 实验审计日志会记录 `upload_file` 和 `delete_file` 操作。
- `GET /api/v1/experiments/{id}/export` 和 `/export/json` 当前返回结构化 JSON，包含实验主信息、模块 payload、样品（含软删除保留行）、未软删除文件、实验审计事件与计数摘要。
- `GET /api/v1/experiments/{id}/export/excel` 返回 9 个 sheet 的 `.xlsx`：Basic Info、Environment & Precheck、Precursors、Substrates、Furnace Program、Gas Program、Characterization、Files、Audit。
- `GET /api/v1/experiments/{id}/export/analysis` 返回面向 CSV/Parquet 后续转换的扁平行集合，包括实验、前驱体、基底、温区点、气体程序、气体段、气体组分、表征、样品和文件行。
- 系统内置基础受控词表种子；管理员可通过 `/api/v1/admin/vocabularies` 做最小维护。前端当前文件上传下拉读取 `characterization_method`，词表后台的 key 筛选来自后端数据，不维护额外硬编码 key 列表。
