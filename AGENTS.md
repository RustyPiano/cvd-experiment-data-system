# AGENTS.md

> ⚠️ **先读 [`docs/standard/STATUS.md`](docs/standard/STATUS.md)** —— 唯一真相指针。现状：**仓库与香港生产均为 v2 单轨；M-01—M-24、A-01—A-09 与 F-01—F-12 已随 `57a25b7` 发布；U-01—U-32 为后续本地终审批次；2026-07-27 制备模块终版第一批已完成本地实现、全门禁和真实页面关键分支验收，未提交、未部署；下一步先由用户逐条审阅，再完成计划中的交互收口并交俊杰、博研试填**。字段单一源 = `docs/standard/field-source.yaml`；本轮计划 = `docs/product/2026-07-27-preparation-module-finalization-plan.md`；历史报告 = `docs/reviews/2026-07-24-teacher-meeting-remediation.md`；文档总索引 = `docs/README.md`；`docs/archive/` 仅供追溯。

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

- **`docs/standard/STATUS.md`（先读：现状与真相指针；含全部背景+进度+已冻结决策+下一步）**
- `docs/README.md`（文档分类与入口）
- `docs/product/2026-07-24-meeting-remediation-plan.md`（本轮 M-01—M-24、A-01—A-09 的执行矩阵与 F-01—F-12 最终收口定义）
- `docs/reviews/2026-07-24-teacher-meeting-remediation.md`（本轮 M/A/F 逐项状态、最终门禁、本地主线/导出/R0 证据与 11 项专业待裁定问题）
- `docs/product/run-first-workflow-and-copy-design.md`（2026-07-16 已确认的产品工作流；阶段 1–4 已完成）
- `docs/reviews/2026-07-24-comprehensive-audit-remediation.md`（本轮导师走查之前的全库加固矩阵，仅作前置/历史证据）
- `docs/operations/e2e-comprehensive-hardening-report-2026-07-24.md`（本轮导师走查之前的验收证据，不替代本轮整改报告）
- **维护约定**：完成实质改动后，回写 `STATUS.md`（进展日志 + 最后更新日期）；**字段改动改单一源 `docs/standard/field-source.yaml`**，再用 UV 运行 `docs/standard/build_field_tables.py` 和 `docs/standard/check_field_source.py`（CI 强制），勿手改二进制 xlsx、勿改回脚本内嵌数据。
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
- 前端（frontend-next/）：`bun run check && bun run lint && bun run typecheck && bun run test && bun run build`
- 最低合并要求：lint + typecheck + 核心测试通过。

## 开发约定

- 不重命名公共 API/字段，除非同步更新调用方与文档。
- **字段改动只改 `docs/standard/field-source.yaml`**，然后重跑生成器（后端 `generate_v2_models`/`export_v2_schema`、前端 `gen:fields`、xlsx `build_field_tables.py`）+ `check_field_source.py` 校验；生成物漂移 = CI 红。
- **生产基线已发布**：不得修改或 squash `20260711_0001`；任何数据库结构变化都新增 Alembic revision，并同时验证空库升级与现有生产 revision 前滚。
- **当前代码**状态流：draft → locked（admin 可 unlock 回 draft）；draft 可作废为 invalid；lock 过必填门并在同一事务中按衬底生成 growth 样品；locked 锁工艺但允许全组成员补结果，invalid 全部只读；每次转移写审计。
- **产品重构进度**：阶段 0–4、2026-07-24 全库加固复核与批8香港生产切换均已完成；旧 v1 数据库离线归档为 `cvd_v1_archive_20260724`。其后导师线上走查触发的新一轮整改已完成全门禁、独立终审与创建—锁定—样品—结果/附件—导出/R0 真实主线验收，并已发布香港生产（`57a25b7`），未闭环 P0/P1 = 0；下一步按报告汇报并确认 11 项专业标准。
- 实验不做物理删除；文件删除走软删除标记。

## 安全与 PR

- 严禁提交密钥、令牌、真实数据库凭据；配置使用环境变量。
- PR 标题建议：[backend] ... / [frontend] ... / [infra] ...
- 涉及字段或状态机变更时，同步更新文档、校验、导出与测试。

## 常见问题

- `uv sync` 失败：重建虚拟环境（`rm -rf .venv && uv venv && uv sync`）。
- `bun install` 失败：检查 Bun 版本与 lockfile 冲突后重装。
- 迁移冲突：先核对 revision，再做 upgrade/downgrade，避免手改已发布迁移。
