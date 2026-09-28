# AGENTS.md

> 先读 [`docs/standard/STATUS.md`](docs/standard/STATUS.md)（唯一现状入口）。字段单一源 = `docs/standard/field-source.yaml`；文档索引 = `docs/README.md`；`docs/archive/` 仅供追溯。

## 项目概览

CVD 实验数据采集系统（v2 单轨）用于二维材料课题组记录炉次、样品、表征与实测、审计轨迹，落实"最小可复现元数据标准"（R0）。

- 前端：`frontend-next/`（React + TypeScript + Vite + TanStack Router + shadcn/ui + Tailwind v4）；旧 `frontend/` 已删除（2026-07-11，v2 单轨化批1）
- 后端：FastAPI + SQLAlchemy 2.x + Alembic（已发布基线 `20260711_0001`，后续只新增迁移）+ PostgreSQL
- 文件：本地文件系统 + metadata 入库
- 部署：生产用 `docker-compose.prod.yml`（后端 + frontend-next 容器 + 共享 1Panel PostgreSQL，1Panel/openresty 反代，域名 cvd.rustypiano.com）；本地 dev 用 `docker-compose.yml`（自带 postgres）

## 强制工具链（必须遵守）

1. Python 运行时与依赖管理只能用 UV。
2. JavaScript 运行时与依赖管理只能用 Bun。
3. 禁止使用 pip/pipenv/poetry/conda 管理 Python 依赖。
4. 禁止使用 npm/pnpm/yarn 管理 JS 依赖。
5. 提交前保持锁文件一致：uv.lock 与 bun.lock。

## 文档入口

- `docs/standard/STATUS.md`：现状、已定决策、下一步
- `docs/README.md`：文档分类与入口
- `docs/product/run-first-workflow-and-copy-design.md`：产品工作流
- `docs/standard/字段草案-v3.xlsx`：现行字段表（由 YAML 生成）
- `docs/standard/metadata-v2-review-and-redesign.md`：设计理由与国际对标
- **维护约定**：完成实质改动后回写 `STATUS.md`（进展日志一行 + 最后更新日期）；字段改动只改 `docs/standard/field-source.yaml`，再用 UV 运行 `docs/standard/build_field_tables.py` 和 `docs/standard/check_field_source.py`（CI 强制），勿手改 xlsx。文档保持简洁，不写防御性表述。

## 环境准备

- 版本检查：`uv --version && bun --version && docker --version && docker compose version`
- 后端初始化（backend/）：`uv venv && uv sync`
- 前端初始化（frontend-next/）：`bun install`

## 开发流程

1. 启动数据库：`docker compose up -d postgres`
2. 启动后端（backend/）：`uv sync && uv run alembic upgrade head && uv run fastapi dev app/main.py --host 0.0.0.0 --port 8000`
3. 启动前端（frontend-next/）：`bun install && bun run dev`（默认 http://localhost:3000，Vite 代理 /api → 后端）

## 测试与质量门禁

- 后端（backend/）：`uv run ruff check . && uv run ruff format --check . && uv run pytest`
- 前端（frontend-next/）：`bun run check && bun run lint && bun run typecheck && bun run test && bun run build`
- 最低合并要求：lint + typecheck + 核心测试通过。

## 开发约定

- 不重命名公共 API/字段，除非同步更新调用方与文档。
- **字段改动只改 `docs/standard/field-source.yaml`**，然后重跑生成器（后端 `generate_v2_models`/`export_v2_schema`、前端 `gen:fields`、xlsx `build_field_tables.py`）+ `check_field_source.py` 校验；生成物漂移 = CI 红。
- **生产基线已发布**：不得修改或 squash `20260711_0001`；任何数据库结构变化都新增 Alembic revision，并同时验证空库升级与现有生产 revision 前滚。
- **当前代码**状态流：draft → locked（admin 可 unlock 回 draft）；draft 可作废为 invalid；lock 过必填门并在同一事务中按衬底生成 growth 样品；locked 锁工艺但允许全组成员补结果，invalid 全部只读；每次转移写审计。
- 实验不做物理删除；文件删除走软删除标记。

## 安全与 PR

- 严禁提交密钥、令牌、真实数据库凭据；配置使用环境变量。
- PR 标题建议：[backend] ... / [frontend] ... / [infra] ...
- 涉及字段或状态机变更时，同步更新文档、校验、导出与测试。

## 常见问题

- `uv sync` 失败：重建虚拟环境（`rm -rf .venv && uv venv && uv sync`）。
- `bun install` 失败：检查 Bun 版本与 lockfile 冲突后重装。
- 迁移冲突：先核对 revision，再做 upgrade/downgrade，避免手改已发布迁移。
