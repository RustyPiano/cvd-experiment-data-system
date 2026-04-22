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
- Alembic 迁移 `20260423_0001` 到 `20260423_0003`

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

## 当前接口

- 认证
- `GET /health`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

- 实验
- `GET /api/v1/experiments`
- `POST /api/v1/experiments`
- `GET /api/v1/experiments/{id}`
- `PATCH /api/v1/experiments/{id}`
- `POST /api/v1/experiments/{id}/submit`
- `POST /api/v1/experiments/{id}/lock`
- `POST /api/v1/experiments/{id}/invalidate`
- `POST /api/v1/experiments/{id}/clone`
- `GET /api/v1/experiments/{id}/audit-events`

## 当前行为边界

- `viewer` 只能查看 `submitted/locked` 实验，不能创建和克隆。
- `member` 可以创建自己的草稿，查看自己的实验，以及查看其他人的 `submitted/locked` 实验。
- `invalid` 实验默认从列表隐藏；显式传 `status=invalid` 才返回。
- `clone` 会复制主实验参数，但不会复制 `summary_result`、作废原因和状态时间戳；新实验会回到 `draft`。
- 提交前校验目前只覆盖已落地的实验主字段：实验日期、实验人员、实验类型、材料体系。模块级校验会在模块 payload 阶段补齐。
