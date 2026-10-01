# 交接说明

交接日期：2026-09-29。生产与仓库字段源版本 `v4.0-alpha.50`（生产代码 `89e17a5`），Alembic `20260928_0018 (head)`。项目背景、已定决策和进展以 [`standard/STATUS.md`](standard/STATUS.md) 为准。

## 1. 系统

CVD 二维材料实验数据采集系统：制备实验记录（炉次）→ 锁定生成样品 → 表征记录与原始文件 → JSON / 多表 CSV ZIP 导出。字段、词表和 R0 最小可复现集的唯一机器源是 [`standard/field-source.yaml`](standard/field-source.yaml)。

| 部分 | 位置 |
|---|---|
| 后端 | `backend/`：FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL，Python 只用 UV |
| 前端 | `frontend-next/`：React + TypeScript + Vite + TanStack Router，JS 只用 Bun |
| 字段标准 | `docs/standard/`：YAML 单一源、生成的 JSON Schema 与 `字段草案-v3.xlsx` |
| CI | `.github/workflows/ci.yml`：Backend、PostgreSQL smoke、Frontend、Field source、Generated artifacts 五项 |

## 2. 访问与环境

| 项目 | 值 |
|---|---|
| 线上地址 | <https://cvd.rustypiano.com> |
| 代码仓库 | <https://github.com/RustyPiano/cvd-experiment-data-system>（公开仓库），`main` 与 `codex/product-simplification-v1` 内容一致 |
| 服务器 | 香港 1Panel 主机，SSH 别名 `hk`，部署目录 `/opt/1panel/apps/cvd-experiment-data-system` |
| 服务器分支 | `codex/product-simplification-v1`（`deploy.sh` 在此分支上 `git pull --ff-only`） |
| 容器 | `backend`、`frontend`（`docker-compose.prod.yml`）；数据库为共享 1Panel PostgreSQL 17 容器，经 `1panel-network` 连接 |
| 附件存储 | Docker 卷 `cvd-experiment-data-system_storage_data`，挂载到 backend `/data/storage` |
| 反向代理 | 1Panel openresty → 前端容器，前端 nginx 同源代理 `/api` |
| 密钥 | 服务器部署目录 `.env`（不入库、不在交接包内），键名见 `.env.production.example` |
| v1 旧库 | 离线归档库 `cvd_v1_archive_20260724`，应用不连接 |

交接时需另行移交：GitHub 仓库权限、服务器 SSH 权限、1Panel 管理员账号、系统管理员账号。

## 3. 日常运维

所有命令在服务器部署目录执行。

**发布**：本地门禁通过 → 推送并等 CI 五项全绿 → 合并 → 服务器 `./deploy.sh`。脚本依次备份数据库与附件、快进拉取、检查库版本在迁移链内、构建并重启、等待健康检查；后端启动时自动 `alembic upgrade head`。发布前建议给当前镜像打回滚标签：

```bash
for s in backend frontend; do
  docker tag cvd-experiment-data-system-$s:latest cvd-experiment-data-system-$s:rollback-<版本>-<日期>
done
```

**账号**：

```bash
docker compose -f docker-compose.prod.yml exec backend python -m app.commands.create_user --email <邮箱> --name <姓名> --role admin|member
docker compose -f docker-compose.prod.yml exec backend python -m app.commands.reset_password --email <邮箱>
```

成员也可凭 `.env` 中的 `REGISTRATION_INVITE_CODE` 自助注册（留空即关闭）。

**备份**：`./backup.sh` 写入 `backups/<时间戳>/`（`database.sql`、`storage.tar.gz`、`SHA256SUMS`），保留 7 天。目前只在 `deploy.sh` 时自动执行，没有定时任务；如需定时备份，在服务器 crontab 加一条 `./backup.sh`。最近一次：`backups/20260928_212500`（alpha.50 发布前）。

**恢复/回滚**（以 `backups/<时间戳>` 为例）：

```bash
set -a; . ./.env; set +a
docker compose -f docker-compose.prod.yml stop backend
docker exec "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker exec -i "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < backups/<时间戳>/database.sql
gunzip -c backups/<时间戳>/storage.tar.gz | docker cp - "$(docker compose -f docker-compose.prod.yml ps -q backend)":/data/storage
```

代码回滚到旧版本时，先恢复与该版本对应的数据库备份，再 `git checkout <提交>` 并 `docker compose -f docker-compose.prod.yml up -d --build`（或把 `rollback-*` 镜像重新标为 `latest` 后 `up -d`）。旧版本后端不认识更新的迁移号，只回滚镜像而不恢复数据库会启动失败。alpha.43 回滚镜像标签：`rollback-alpha43-20260928`。

**检查**：

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --since 10m backend
curl -s https://cvd.rustypiano.com/health
```

## 4. 开发

- 环境与启动：根 [`README.md`](../README.md)；工程约定与门禁：[`AGENTS.md`](../AGENTS.md)。
- 门禁：后端 `uv run ruff check . && uv run ruff format --check . && uv run pytest`；前端 `bun run check && bun run lint && bun run typecheck && bun run test && bun run build`。
- **字段改动**只改 `field-source.yaml`，再运行 `generate_v2_models`、`export_v2_schema`、`bun run gen:fields`、`build_field_tables.py`、`check_field_source.py`；生成物漂移会使 CI 失败。`字段草案-v3.xlsx` 重新生成时即使内容不变也会产生二进制差异，校验通过时可不提交。
- **数据库**：已发布迁移不得修改，结构变化只新增 revision；发布前在 PostgreSQL 上验证空库升级和从生产 revision 前滚。含删列/删表的迁移，建议用生产库副本演练读取全部炉次（做法见部署报告 2026-09-28 条目）。
- 实验不做物理删除，文件软删除；状态流 `draft → locked`，管理员可解锁，草稿可作废为 `invalid`。

## 5. 数据现状

生产库：3 个用户、19 个炉次（1 locked、4 draft、14 invalid）、1 个样品，无表征记录与附件；均为测试数据，尚无真实科研数据。

## 6. 待办

1. **真实数据闭环验收**：由实验人按真实条件完成“引用基础资料 → 分节保存 → 锁定 → 自动样品 → 表征与附件 → JSON/CSV 导出 → `check_r0` compliant”，结果补入部署报告。
2. **字段术语审核**：[2026-09-21 审核](reviews/2026-09-21-field-terminology-taxonomy-review.md) 的 30 项问题与 4 项文字建议未实施。
3. **AFM**：[字段复核](reviews/2026-09-11-afm-field-review.md) 已完成，整改未实施（OM/Raman/PL/SHG 已完成）。
4. **旧测试草稿**：CVD-2026-0004 目标材料含旧值 `discrete_planar_crystal`，需在界面重选形态后才能保存；CVD-2026-0002 前驱体与衬底含已删除字段，建议作废。
5. **定时备份**：见第 3 节。
6. **标准对外冻结**：字段属内部验证实现，专业标准尚未对外冻结；论文定位见 STATUS §3。

## 7. 文档地图

| 用途 | 文档 |
|---|---|
| 现状与已定决策 | [`standard/STATUS.md`](standard/STATUS.md) |
| 文档索引 | [`README.md`](README.md) |
| 元数据规则书 | [`standard/cvd-2d-process-data-standard-v2.0.md`](standard/cvd-2d-process-data-standard-v2.0.md) |
| 设计依据与国际对标 | [`standard/metadata-v2-review-and-redesign.md`](standard/metadata-v2-review-and-redesign.md) |
| 产品工作流 | [`product/run-first-workflow-and-copy-design.md`](product/run-first-workflow-and-copy-design.md) |
| 发布历史与证据 | [`operations/production-deployment-report-2026-07-24.md`](operations/production-deployment-report-2026-07-24.md) |
| 浏览器走查清单 | [`operations/e2e-walkthrough-checklist.md`](operations/e2e-walkthrough-checklist.md) |
| 各表征方法审查与实施 | [`reviews/`](reviews/) |
