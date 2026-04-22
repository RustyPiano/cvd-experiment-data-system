# CVD 实验数据采集系统

当前仓库已完成第一阶段后端骨架：

- FastAPI 服务入口
- `users` 用户模型
- JWT 登录鉴权
- `/api/v1/auth/login`
- `/api/v1/auth/me`
- 管理员初始化命令
- Alembic 初始迁移

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

- `GET /health`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
