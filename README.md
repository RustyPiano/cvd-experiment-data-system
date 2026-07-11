# CVD 实验数据采集系统

CVD 二维材料课题组的实验数据采集系统（**v2 单轨**）：以"最小可复现元数据标准"（R0）为核心，记录炉次、样品、表征与实测、审计轨迹。

> **先读 [`docs/standard/STATUS.md`](docs/standard/STATUS.md)**——全部背景、当前进度、已冻结决策、下一步的单一入口。字段单一源是 `docs/standard/field-source.yaml`，xlsx 与全部代码生成物都是它的渲染产物。
>
> **前端说明**：前端是 **`frontend-next/`**（Bun + Vite + React + TypeScript + **TanStack Router + shadcn/ui + Tailwind v4**），线上部署于 <https://cvd.rustypiano.com>。早期的 `frontend/`（Ant Design + React Router）已于 2026-07-11 删除（v2 单轨化批1，历史在 git）。

## 系统能力（v2 单轨，2026-07-11 起）

前端路由（登录后）：

- `/experiments` 炉次列表（状态徽章、结果缺失标记）
- `/experiments/new`、`/experiments/:runId/edit` 元数据驱动的炉次表单（§1–§8 模块、条件必填、复合输入、状态流转入口）
- `/material-lots`、`/setups`、`/instruments` 一等实体库（锁版快照：实体+不可变版本，实验只引用不重录）
- `/samples`、`/samples/:sampleId` 样品列表与详情（关联文件查看/下载）

后端域（FastAPI + SQLAlchemy 2.x + Alembic 单一 initial，14 表）：

- 炉次 + 状态机（draft → submitted → locked，admin 可 unlock；draft/submitted 可作废；submit/lock 过 **R0 阻塞门**，422 返回结构化缺失清单；每次转移写审计；锁定后无结果 → "结果缺失"待办）
- 一等实体三件套 + 不可变版本表；引用时刻快照冻结
- 模块 payload（由 `field-source.yaml` 生成的 Pydantic 判别模型校验，11 种过程步阶段类型）
- 表征记录、实测产物、样品、文件资产（本地存储 + metadata 入库、软删除）
- 单一源管线：YAML → Pydantic / JSON Schema / xlsx / 前端 TS 元数据四路生成器 + `check_field_source.py` 护栏（CI 强制零漂移）

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

cd ../frontend-next
bun install
bun run dev   # 生产前端，默认 http://localhost:3000（Vite 代理 /api → 后端）
```

## Docker Compose 本地开发

```bash
cp .env.example .env
# 首次启动前请至少替换 POSTGRES_PASSWORD 和 JWT_SECRET_KEY。
docker compose config
docker compose up --build
```

> 注：dev compose 的 `frontend` 服务构建的是 **`frontend-next`**（nginx，端口默认 80，`FRONTEND_PORT` 可覆盖）。日常前端开发用上文 `cd frontend-next && bun run dev`（端口 3000，热更新）更方便。

开发模式默认入口：

- 前端（frontend-next 容器）：`http://localhost:${FRONTEND_PORT:-80}`
- 后端 OpenAPI：`http://localhost:8000/docs`
- 健康检查：`http://localhost:8000/health`
- Compose 会在 backend 容器启动时自动执行 `uv run alembic upgrade head`。
- 首次启动后需要进入 backend 容器或本地 `backend/` 目录运行用户创建命令。
- 如果当前 Docker Desktop 环境触发 `failed to dial gRPC`，可先分别执行 `docker build -f backend/Dockerfile -t cvd-backend .` 和 `docker build -f frontend-next/Dockerfile -t cvd-frontend .`，再执行 `docker compose up -d --no-build --force-recreate`。

## 生产部署

> ⚠️ **批8 生产切换（人工门）完成前禁止运行 `deploy.sh`**：线上仍是 v2 单轨化之前的旧部署与旧库；schema 已重基线为单一 initial，旧库上启动自动迁移会崩溃循环。切换流程（停容器 → 重建数据库 → 部署 → 建管理员 → 线上冒烟）见 `docs/v2-single-track-plan.md` 批8。

生产环境（hongkong 服务器，1Panel + openresty 管理）使用 **`docker-compose.prod.yml`**：仅后端 + 前端容器，数据库是**共享的 1Panel PostgreSQL**（经外部 `1panel-network` 访问，本 compose 不启动 postgres）。前端镜像为多阶段构建（`frontend-next/Dockerfile`：bun 构建 → nginx）。部署从 `main` 分支进行。

```bash
# 1. 初始化配置（首次）
cp .env.production.example .env
# 编辑 .env，至少设置：
#   COMPOSE_DATABASE_URL=postgresql+psycopg://<用户>:<密码>@1Panel-postgresql-xxxx:5432/cvd  # 指向共享 1Panel PostgreSQL
#   JWT_SECRET_KEY:  openssl rand -hex 32
#   REGISTRATION_INVITE_CODE：内部成员自助注册码
#   FRONTEND_PORT / BACKEND_PORT：默认 8080 / 8000（仅监听 127.0.0.1，由 openresty 反代）

# 2. 一键部署（自动备份 → git pull → 构建 → 后端启动时自动 alembic 迁移 → 健康检查）
./deploy.sh

# 3. 创建管理员账户（首次必需）
docker compose -f docker-compose.prod.yml exec backend uv run python -m app.commands.create_admin --email your@email.com --name "Your Name"
```

- 对外访问：1Panel openresty 反向代理「域名 → 前端容器」+ SSL → <https://cvd.rustypiano.com>
- 前端容器内置 nginx，把 `/api`、`/health`、`/docs` 等同源反代到后端容器（127.0.0.1，不对外暴露）
- **日常更新流程**：本地改完 → `git push origin main` → 服务器 `./deploy.sh`

## 数据备份

```bash
# 手动备份（数据库 + 文件存储）
./backup.sh

# 设置每天凌晨 2 点自动备份
crontab -e
# 添加: 0 2 * * * /path/to/backup.sh >> /var/log/cvd-backup.log 2>&1
```

备份文件存放在 `./backups/` 目录下，按时间戳分目录（`YYYYMMDD_HHMMSS/`），保留最近 7 天。

### 恢复备份

```bash
# 数据库恢复（生产：共享 1Panel PostgreSQL 容器）
docker exec -i 1Panel-postgresql-xxxx psql -U <用户> cvd < backups/YYYYMMDD_HHMMSS/database.sql
#（本地 dev 用自带 postgres：docker compose exec -T postgres psql -U postgres cvd < ...）

# 文件恢复
docker compose -f docker-compose.prod.yml exec -T backend tar xzf - -C / < backups/YYYYMMDD_HHMMSS/storage.tar.gz
```

## Docker Compose 说明

- `backend` 容器会先执行 `uv run alembic upgrade head`，再启动 `uvicorn app.main:app`。
- `frontend` 容器会在启动时生成 `runtime-config.js`，默认以同源 `/api` 方式访问后端；如需跨域访问，可覆盖 `VITE_API_BASE_URL`。
- `postgres_data` 和 `storage_data` 两个命名卷分别持久化数据库与实验文件。
- 所有服务均配置了 `restart: unless-stopped`，服务器重启后自动恢复。
- 日志轮转：每个容器最多保留 3 个日志文件，每个最大 10 MB。
- 容器内存限制：postgres 512M / backend 1G / frontend 256M。
- PostgreSQL 和 backend 端口仅在 `127.0.0.1` 监听，不对外暴露。

## 用户命令

创建用户：

```bash
cd backend
uv run python -m app.commands.create_user --email admin@example.com --name Admin --role admin
uv run python -m app.commands.create_user --email member@example.com --name Member --role member
uv run python -m app.commands.create_user --email viewer@example.com --name Viewer --role viewer
```

以上命令会交互式要求输入并确认密码；密码不会写入 shell history。

成员也可以在登录页使用内部邀请码自助注册。邀请码由后端环境变量
`REGISTRATION_INVITE_CODE` 控制，未配置时注册接口会拒绝请求；管理员账号仍建议用
`create_admin` 命令初始化。

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

R0 合规检查：

```bash
cd backend
uv run python -m app.commands.check_r0 --run-code RUN-2026-0001   # 或 --run-id <uuid>
```

## 前端联调准备

- 默认后端地址：`http://127.0.0.1:8000`
- OpenAPI 文档：`http://127.0.0.1:8000/docs`
- 运行时配置文件：`frontend-next/public/runtime-config.js`，默认不覆盖 `VITE_API_BASE_URL`
- frontend-next 本地 dev（端口 `3000`）通过 Vite 代理把 `/api` 转发到后端，无需 CORS
- 生产前端容器内置 nginx 同源反代 `/api/*`、`/health`、`/docs` 和 `/openapi.json` 到后端容器
- Compose 运行时通过 `VITE_API_BASE_URL` 覆盖前端容器里的 `runtime-config.js`；默认值为 `/`
- 如果前后端部署在不同域名或不同端口上，需要把 `VITE_API_BASE_URL` 和 `CORS_ALLOW_ORIGINS` 一起改成可访问地址
- 本地 Vite 开发端口 `5173/4173` 已默认加入 `CORS_ALLOW_ORIGINS`
- 后端 API 变更后：`cd frontend-next && bun run gen:api` 重新生成 OpenAPI 类型

## 质量命令

后端：

```bash
cd backend
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

前端（frontend-next）：

```bash
cd frontend-next
bun run gen:fields    # 字段元数据重生成（生成物漂移 = CI 红）
bun run lint
bun run typecheck
bun run test
bun run build
```

字段单一源（改 `docs/standard/field-source.yaml` 后必跑）：

```bash
python3 docs/standard/build_field_tables.py    # 重新生成 xlsx
python3 docs/standard/check_field_source.py    # 逐格一致 + 结构护栏（CI 强制）
cd backend && uv run python -m app.commands.generate_v2_models && uv run python -m app.commands.export_v2_schema
cd ../frontend-next && bun run gen:fields
```

完整回归建议按以下顺序执行：

```bash
cd backend
uv run ruff check .
uv run ruff format --check .
uv run pytest

cd ../frontend-next
bun run lint
bun run typecheck
bun run test

cd ..
python3 docs/standard/check_field_source.py
docker compose config
docker compose up --build
```

## 常见故障

- `uv sync` 失败：删除 `backend/.venv` 后重新执行 `uv venv && uv sync`。
- `bun install` 失败：检查 Bun 版本与 `frontend-next/bun.lock` 是否一致，再重装依赖。
- `docker compose up --build` 失败：先运行 `docker compose config` 检查 `.env` 配置是否完整。
- 数据库迁移异常：在 `backend/` 下先执行 `uv run alembic current`，确认 revision 后再决定 `upgrade` 或 `downgrade`。

## 当前接口（v2，全部在 `/api/v1`；权威定义看运行中的 `/docs` 或 `docs/standard/generated/`）

- 认证：`POST /api/v1/auth/login | register | refresh | logout`、`GET /api/v1/auth/me`、`GET /health`
- 一等实体（material-lots / setups / instruments 三套同构）：`GET|POST /api/v1/{kind}`、`GET /api/v1/{kind}/{id}`、`GET|POST /api/v1/{kind}/{id}/versions`（版本不可变，追加即锁版）
- 炉次：`GET|POST /api/v1/experiments`、`GET /api/v1/experiments/{runId}`
- 状态机：`POST /api/v1/experiments/{runId}/submit | lock | unlock | return-to-draft | invalidate`
- 装置引用与模块：`PUT /api/v1/experiments/{runId}/setup-reference`、`PUT|GET /api/v1/experiments/{runId}/modules/{moduleKey}`
- 表征记录 / 实测产物：挂样品与炉次的增删改查（`characterization-records`、`measured-products`）
- 样品：`GET /api/v1/samples`、`POST /api/v1/experiments/{id}/samples`、`GET|PATCH /api/v1/samples/{id}`
- 文件：`GET /api/v1/files`、`POST /api/v1/experiments/{id}/files`、`GET /api/v1/files/{id}`、`GET /api/v1/files/{id}/download`、`DELETE /api/v1/files/{id}`（软删除）

## 当前行为边界（v2）

- 角色：`admin` 全量；`member` 建/改自己的炉次，可见他人 `submitted/locked`；`viewer` 只读 `submitted/locked`。
- 状态机：`draft → submitted → locked`；`unlock` 仅 admin（回 `submitted`）；`submitted` 可退回 `draft`；`draft/submitted` 可作废为 `invalid`（必填原因），`locked` 不可作废；clone 未实现（遇真实需求再做）。
- **R0 阻塞门**：`submit` 与 `lock` 都要求 16 项 R0 最小可复现集齐全（按相态/结构类型条件化，PVD 炉次豁免），缺失返回 422 + 结构化清单。
- 每次状态转移写审计事件（before/after 状态）；`locked` 且无任何表征/实测 → 列表标记"结果缺失"待办（§4 结果留存合规规则）。
- `locked/invalid` 炉次拒绝一切写路径：模块保存、装置引用、表征记录增改删、实测产物增改删（409）。
- 一等实体版本表不可变；实验引用 `entity + version`，引用时刻快照冻结在炉次上；并发追加版本冲突返回 409。
- 词表/字段：单一源 `field-source.yaml`；上传文件的 `method` 校验、下拉选项、条件必填全部由 YAML 派生，**改词表 = 改 YAML + 重跑生成器**，无 DB 词表。
- 样品 `role`：`top / bottom / product / control`；`sample_code` 由后端按 `run_code` 自动生成；样品与文件删除均为软删除。
- 文件上传：必须归属一个炉次，可选关联同炉次样品；默认大小上限 50 MiB（`FILE_UPLOAD_MAX_BYTES` 可调）；同炉次重复 `sha256` 会在 metadata 标记。
