# CVD 实验数据采集系统

当前仓库已完成的后端能力：

- FastAPI 服务入口
- `users` 用户模型
- JWT 登录鉴权
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

## 前端联调准备

- 默认后端地址：`http://127.0.0.1:8000`
- OpenAPI 文档：`http://127.0.0.1:8000/docs`
- 建议前端环境变量：`VITE_API_BASE_URL=http://127.0.0.1:8000`
- 本地 Vite 开发端口 `5173/4173` 已默认加入 `CORS_ALLOW_ORIGINS`
- 详细联调约定见 [docs/frontend-backend-handoff.md](/Users/wangsiyuan/编程/小项目/CVD实验数据采集系统/docs/frontend-backend-handoff.md)

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
- 后端已开放本地前端开发所需 CORS，并暴露 `Content-Disposition` 供文件下载和导出读取文件名。
- `member` 可以创建自己的草稿，查看自己的实验，以及查看其他人的 `submitted/locked` 实验。
- `invalid` 实验默认从列表隐藏；显式传 `status=invalid` 才返回。
- `clone` 会复制主实验参数，但不会复制 `summary_result`、作废原因和状态时间戳；新实验会回到 `draft`。
- `submitted` 实验现在支持显式退回 `draft`，并写入审计日志。
- 模块 payload 当前支持 `basic_info`、`environment`、`precheck`、`precursors`、`substrates`、`furnace_program`、`gas_program`、`process_observation`、`characterization`、`result_summary`。
- `clone` 只允许从 `locked` 实验发起；会复制模块 payload，但不会复制 `basic_info`、`result_summary`，并会清空克隆后环境模块中的 `abnormal_note`。
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
