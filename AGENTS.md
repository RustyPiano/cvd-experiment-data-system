# AGENTS.md

> ⚠️ **先读 [`docs/standard/STATUS.md`](docs/standard/STATUS.md)** —— 字段 / 元数据设计的唯一真相指针。现状：线上 = v1；字段以 `docs/standard/字段草案-v3.xlsx` 为准；`docs/archive/` 为历史，勿当现状。

## 项目概览

CVD 实验数据采集系统（V1）用于二维材料课题组记录实验、样品、表征文件与审计轨迹，支持后续结构化分析。
- 前端：生产前端 `frontend-next/`（React + TypeScript + Vite + TanStack Router + shadcn/ui + Tailwind v4）；旧 `frontend/`（Ant Design + React Router）为**遗留，正在退役**
- 后端：FastAPI + SQLAlchemy 2.x + Alembic + PostgreSQL
- 文件：本地文件系统（V1）+ metadata 入库
- 部署：生产用 `docker-compose.prod.yml`（后端 + frontend-next 容器 + 共享 1Panel PostgreSQL，1Panel/openresty 反代，域名 cvd.rustypiano.com）；本地 dev 用 `docker-compose.yml`（自带 postgres）

## 强制工具链（必须遵守）

1. Python 运行时与依赖管理只能用 UV。
2. JavaScript 运行时与依赖管理只能用 Bun。
3. 禁止使用 pip/pipenv/poetry/conda 管理 Python 依赖。
4. 禁止使用 npm/pnpm/yarn 管理 JS 依赖。
5. 提交前保持锁文件一致：uv.lock 与 bun.lock。

## 文档入口

- **`docs/standard/STATUS.md`（先读：现状与真相指针；含全部背景+进度+已冻结决策+下一步）**
- **维护约定**：完成实质改动后，回写 `STATUS.md`（进展日志 + 最后更新日期）；**字段改动改单一源 `docs/standard/field-source.yaml`**，再 `python3 docs/standard/build_field_tables.py` 重新生成 + `python3 docs/standard/check_field_source.py` 校验（CI 强制），勿手改二进制 xlsx、勿改回脚本内嵌数据。
- `docs/standard/字段草案-v3.xlsx`（现行字段表）
- `docs/standard/metadata-v2-review-and-redesign.md`（设计理由与国际对标）
- 历史（已归档、v1/早期、勿当现状）：`docs/archive/` 下的 `cvd_experiment_data_system_design_v1.md`（业务与数据模型）、`DESIGN.md`（前端设计规范）、`AGENT_IMPLEMENTATION_BRIEF.md`（V1 实现边界）

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
- 前端（frontend-next/）：`bun run lint && bun run typecheck && bun run test`
- 最低合并要求：lint + typecheck + 核心测试通过。

## 开发约定

- 不重命名公共 API/字段，除非同步更新调用方与文档。
- 新增字段必须同步补齐校验、审计与导出逻辑。
- 状态流遵循：draft -> submitted -> locked -> invalid；locked 仅允许 clone。
- 实验不做物理删除；文件删除走软删除标记。

## 安全与 PR

- 严禁提交密钥、令牌、真实数据库凭据；配置使用环境变量。
- PR 标题建议：[backend] ... / [frontend] ... / [infra] ...
- 涉及字段或状态机变更时，同步更新文档、校验、导出与测试。

## 常见问题

- `uv sync` 失败：重建虚拟环境（`rm -rf .venv && uv venv && uv sync`）。
- `bun install` 失败：检查 Bun 版本与 lockfile 冲突后重装。
- 迁移冲突：先核对 revision，再做 upgrade/downgrade，避免手改已发布迁移。

## 设计语境 (Design Context)

项目设计定义文件为 [PRODUCT.md](file:///Users/wangsiyuan/编程/小项目/CVD实验数据采集系统/PRODUCT.md) 与 [DESIGN.md](file:///Users/wangsiyuan/编程/小项目/CVD实验数据采集系统/DESIGN.md)。在进行任何 UI 修改、功能设计和交互式审查前，请务必阅读这两个文件以保持设计系统的风格一致。
