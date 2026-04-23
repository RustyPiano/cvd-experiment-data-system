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
- `/experiments/:id/edit` 已接通全部 V1 模块 key 的首版编辑器
- `basic_info / environment / precheck / precursors / substrates / furnace_program / gas_program / process_observation / characterization / result_summary`
- draft 自动保存、区块级保存状态、`submit` 提交闭环
- `/experiments/:id` 已接通 `return-to-draft / lock / invalidate / clone`
- 详情页已接通文件概览、审计轨迹、JSON/Excel 导出入口
- 文件页已接通文件列表、筛选、上传、下载、软删除
- 前端实现计划文档，见 [docs/superpowers/plans/2026-04-23-frontend-foundation-and-access-flow.md](/Users/wangsiyuan/编程/小项目/CVD实验数据采集系统/docs/superpowers/plans/2026-04-23-frontend-foundation-and-access-flow.md)

当前前端第一阶段尚未完成的部分：

- 样品详情页、词表后台
- 路由级拆包与更细的性能优化

## 本轮交付质量状态

- 2026-04-23 已完成一次 subagent 审核，并修正了首轮前端基础实现中的关键问题。
- 登出现在会清空 TanStack Query 缓存，避免跨账号残留上一位用户的实验数据。
- 实验详情页和编辑器壳层在请求失败时会显示错误态，不再返回空白页面。
- 统一 API client 现在兼容 `204`、JSON 和纯文本错误响应，避免非 JSON 响应被误解析成 `SyntaxError`。
- 实验列表、详情和新建页移除了 `Button` 内嵌 `Link` 的无效交互结构，并补上创建失败提示。
- 当前实验编辑器现已覆盖全部 V1 模块 key、draft 自动保存和提交闭环；当前按最小可用字段集实现，非 draft 实验会切换为只读。
- 实验详情页现已按权限和状态显示 `return-to-draft / lock / invalidate / clone` 按钮；`locked` 实验支持直接派生到新草稿编辑页。
- 实验详情页现在会并行显示文件概览、审计轨迹，并提供结构化 JSON / Excel 导出按钮。
- 文件页现在支持按方法和文件类别筛选，并接通带鉴权的文件下载、draft 上传和软删除。
- 文件上传表单会读取 `characterization_method` 词表与当前实验样品列表，支持可选 `sample_id` 关联。
- 编辑器 autosave 现在会先同步最新表单快照，再调度保存，避免连续编辑时遗漏后改动区块。
- 当前模块 autosave 会保留后端 payload 中前端暂未建模的字段，避免最小表单覆盖掉已有结构化数据。
- 生命周期按钮现在在状态切换请求进行中互斥禁用，避免同一实验被前端连续触发冲突动作。
- 当前验证结果：`bun run test`、`bun run typecheck`、`bun run lint`、`bun run build` 通过；构建仅剩 Vite 的 chunk size 警告，暂不影响运行。

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
- 受控词表默认种子与最小管理 CRUD
- Alembic 迁移 `20260423_0001` 到 `20260423_0007`
- 前端联调 handoff 文档，见 [docs/frontend-backend-handoff.md](/Users/wangsiyuan/编程/小项目/CVD实验数据采集系统/docs/frontend-backend-handoff.md)

## 环境准备

```bash
uv --version
bun --version
docker --version
docker compose version
```

## 启动数据库

```bash
docker compose up -d postgres
```

## 初始化后端

```bash
cd backend
uv venv
uv sync
cp ../.env.example .env
uv run alembic upgrade head
uv run python -m app.commands.create_admin --email admin@example.com --name Admin
uv run fastapi dev app/main.py --host 0.0.0.0 --port 8000
```

## 初始化前端

```bash
cd frontend
bun install
bun run dev --host 0.0.0.0 --port 5173
```

## 前端联调准备

- 默认后端地址：`http://127.0.0.1:8000`
- OpenAPI 文档：`http://127.0.0.1:8000/docs`
- 建议前端环境变量：`VITE_API_BASE_URL=http://127.0.0.1:8000`
- 本地 Vite 开发端口 `5173/4173` 已默认加入 `CORS_ALLOW_ORIGINS`
- 详细联调约定见 [docs/frontend-backend-handoff.md](/Users/wangsiyuan/编程/小项目/CVD实验数据采集系统/docs/frontend-backend-handoff.md)

## 前端质量命令

```bash
cd frontend
bun run test
bun run typecheck
bun run lint
bun run build
```

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
- `GET /api/v1/experiments/{id}/export`
- `GET /api/v1/experiments/{id}/export/json`
- `GET /api/v1/experiments/{id}/export/excel`
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
- owner/admin 当前可以将自己的任意非 `invalid` 实验直接作废；`submitted` 不要求先退回 `draft`。
- `clone` 会复制主实验参数，但不会复制 `summary_result`、作废原因和状态时间戳；新实验会回到 `draft`。
- `submitted` 实验现在支持显式退回 `draft`，并写入审计日志。
- 模块 payload 当前支持 `basic_info`、`environment`、`precheck`、`precursors`、`substrates`、`furnace_program`、`gas_program`、`process_observation`、`characterization`、`result_summary`。
- `clone` 只允许从 `locked` 实验发起；会复制模块 payload，但不会复制 `basic_info`、`process_observation`、`characterization`、`result_summary`，并会清空克隆后环境模块中的 `abnormal_note`。
- 提交前校验现在覆盖主字段和已实现的模块规则：至少一个前驱体、至少一个温区程序、温区时间严格递增；如果填写了气体程序，则要求 `end_min > start_min` 且时间段不能重叠；`seal_intact=false` 时必须填写 `risk_note`。
- `substrates` 模块会同步生成或更新 `TOP/BOTTOM` 样品。
- 模块 payload 的非法对象形状会在后端转成 `422`，避免把脏 JSON 打成 `500`。
- 手工样品创建当前支持 `top`、`bottom`、`product`、`control`；样品编号由后端根据实验 `run_code` 自动生成，例如 `S-2026-0001-TOP`、`S-2026-0001-PRODUCT-A`。
- clone 实验时会复制样品，并按新实验编号重新分配 `sample_code`。
- 文件资产当前采用本地文件系统存储，metadata 入库；上传只能写入 `draft` 实验，删除只做软删除标记并隐藏访问。
- 上传文件时要求提供 `method`，支持 `file_category=raw|processed` 与可选 `note`；响应中会返回 `download_url`。
- 上传大小当前默认限制为 `50 MiB`，可通过 `FILE_UPLOAD_MAX_BYTES` 调整。
- 文件必须归属一个实验；可选关联一个样品，但 `sample_id` 必须属于同一实验。
- 历史字段 `file_kind` 仅作为兼容别名接受输入，公开响应统一使用 `method`。
- 同一实验内重复 `sha256` 文件会在 metadata 中标记重复来源。
- 实验审计日志会记录 `upload_file` 和 `delete_file` 操作。
- `GET /api/v1/experiments/{id}/export` 和 `/export/json` 当前返回结构化 JSON，包含实验主信息、模块 payload、样品、未软删除文件、实验审计事件与计数摘要。
- `GET /api/v1/experiments/{id}/export/excel` 返回 9 个 sheet 的 `.xlsx`：Basic Info、Environment & Precheck、Precursors、Substrates、Furnace Program、Gas Program、Characterization、Files、Audit。
- 系统内置基础受控词表种子；管理员可通过 `/api/v1/admin/vocabularies` 做最小维护。
