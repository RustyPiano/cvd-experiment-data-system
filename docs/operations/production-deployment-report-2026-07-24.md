# 香港生产环境 v2 部署记录（2026-07-24）

## 结论

- `https://cvd.rustypiano.com` 已切换到 v2；初始切换提交为 `4e0b65a68d74cf87cb0d74f8f9a124b8c9acdf1b`，当前应用发布提交为 `ec8b7b4f3783840a2a808df2a02212f9c46c151f`。
- 初始切换的 GitHub Actions 运行 `30076866424` 与 2026-07-28 发布运行 `30352259683` 的五项检查均通过；2026-08-31 发布前本地后端 404 passed、4 skipped，前端 388/388（58 files），格式、类型、构建、字段源与生成物检查全绿；服务器隔离 PostgreSQL 验收 29 passed。
- 生产 backend、frontend 均为 `running + healthy`；公网 `/health`、首页和 `runtime-config.js` 均验证成功。
- 旧 v1 数据仍在禁连归档库 `cvd_v1_archive_20260724` 中；2026-08-07 仅清空当前 v2 `cvd` 数据库中的测试数据与附件。
- 用户指定的管理员账号已创建，API 登录与身份读取通过；真实浏览器留给用户在线逐项复核。

## 切换前证据

旧库核对结果：

| 项目 | 值 |
|---|---:|
| 炉次 | 18 |
| 用户 | 8 |
| 审计事件 | 822 |
| public 表（含 `alembic_version`） | 13 |
| Alembic revision | `20260611_0031` |

一致性备份：

- 批8能力目录：`/opt/1panel/apps/cvd-experiment-data-system/backups/20260724_155944`
- 永久保留副本：`/opt/1panel/apps/cvd-experiment-data-system-preserved/v1-archive-20260724`
- `database.sql` SHA-256：`0361540ac67f0d6cfacca15dfc0cdf0a3bb02823299cd94456c7af17effb8de4`
- `storage.tar.gz` SHA-256：`bdd832c21fd2a3ad75cd5e198be350fadd99d4397ca07cf82853f75fea0d9369`
- 目录权限为 `0700`，文件权限为 `0600`。

两次临时库恢复均成功；最终一次使用 `psql -X -v ON_ERROR_STOP=1`，并核对业务计数及表、索引、约束、触发器、函数数量后删除临时库。文件卷归档列表仅有 `./`，证明旧卷本来为空，因此没有执行卷删除、重建或宿主目录清理。

## 数据保留与回退资产

- 原 `cvd` 已原地改名为 `cvd_v1_archive_20260724`；归档库 OID 为 `16389`，编码和 locale 保持 `UTF8 / en_US.utf8`。
- 归档库设置 `ALLOW_CONNECTIONS=false`，作为不可变证据保留；不得为查询或回退直接解除限制并投入使用。
- 新 `cvd` 从 `template0` 创建，owner、编码和 locale 与旧库一致，部署前确认 public 用户对象为 0。
- v1 源码保留于 `/opt/1panel/apps/cvd-experiment-data-system-preserved/v1-source-61ed7ce`。
- v1 回退镜像：
  - `cvd-experiment-data-system-backend:v1-archive-20260724`
  - `cvd-experiment-data-system-frontend:v1-archive-20260724`
- 切换前环境配置副本已按 root-only 权限离线保留。

本报告是切换证据，**不是可执行回退手册**。若确需回退，必须先针对当时的 v2 数据编写、评审并完整演练独立 runbook；至少应包含停写与连接排空、当前 v2 数据和文件备份、备份恢复验证、半切换恢复点、DNS/反代与应用验证，以及回退期间新增数据的回迁决策。可写的 v1 回退库只能从已验证的 SQL 备份恢复到新库，原 `cvd_v1_archive_20260724` 必须始终禁连且不改名。未完成上述 runbook 和演练前，不得执行生产回退。

## 部署与故障闭环

首次启动被生产配置校验主动拒绝：旧 `REGISTRATION_INVITE_CODE` 不满足新版 8–128 字符安全规则。迁移尚未开始，新库仍为空。处理方式为：

1. 停止重启中的容器；
2. 原子轮换为 48 位随机邀请码；
3. 用一次性容器仅加载 `Settings`，得到明确 `CONFIG_OK`；
4. 在空库、空卷和停止容器条件下重新验证同一批8能力并部署。

没有绕过生产校验，也没有使用 `SKIP_SCHEMA_GUARD`。

## 上线验收

服务器与 API：

- Alembic：`20260711_0001`
- v2 应用表：14 张（另有 `alembic_version`，public 共 15 张）
- 新库初始炉次数：0
- `/health`：`{"status":"ok","service":"cvd-backend"}`
- 管理员登录、`/api/v1/auth/me`、空炉次列表、退出：通过

真实浏览器：

- 中文登录页、邀请码注册链接：正常
- 管理员登录后进入 `/experiments`：正常
- 炉次、样品、物料批次、实验装置、表征仪器导航：正常
- 空炉次状态与筛选区：正常
- `/experiments/new` 的实验时间、合成方法为必填，实验人自动填入“管理员”且不可修改：正常
- 浏览器 console warning/error：0

初始管理员密码与新邀请码仅在服务器 root-only 交接材料中暂存，均未写入仓库或本报告。完成首次人工交接后应立即轮换管理员密码，并删除交接材料中的明文副本；邀请码按成员注册需要轮换。

## 后续普通发布

- 2026-07-24 17:03（Asia/Shanghai）按普通 `./deploy.sh` 发布 `f91057b`，未再次使用批8能力，也未接触离线归档库。
- GitHub Actions 运行 `30081056929` 的五项 required checks 全部通过。
- 发布前自动备份写入 `/opt/1panel/apps/cvd-experiment-data-system/backups/20260724_170310`。
- 新增装置图上传后预览、版本详情大图和装置库列表缩略图；公网 `/health`、首页、容器健康和真实浏览器装置库/新建表单均通过，console 0 warning/error。
- 导师走查整改经 PR #1 合并；GitHub Actions 运行 `30139599899` 的五项 required checks 全部通过，生产按普通 `./deploy.sh` 从 `a592116` 前滚到 `57a25b7`，未使用批8能力或 schema guard 旁路。
- 发布前自动备份写入 `/opt/1panel/apps/cvd-experiment-data-system/backups/20260725_100220`；目录/文件权限、非空普通文件及 `database.sql`、`storage.tar.gz` 两项 SHA-256 均复验通过。
- 部署后仓库为干净 `main`，backend/frontend 均为 `running + healthy`，Alembic 保持 `20260711_0001 (head)`；本机与公网 `/health`、首页、`runtime-config.js` 和匿名 401 边界通过。
- 管理员真实浏览器只读复验通过：两条既有草稿 `CVD-2026-0001`、`CVD-2026-0002` 可读且状态未变，新建、表征、物料、装置、仪器和中英文切换正常，console 0 warning/error；未创建或保存验收数据。
- 制备模块终版经 PR #4 合并；PR 运行 `30267512472` 与 `main` 运行 `30267648721` 的五项 required checks 全部通过。普通 `./deploy.sh` 从 `cd39f30` 前滚到 `ff9d8b0`，没有新增迁移，也没有使用批8能力或 schema guard 旁路。
- 发布前自动备份写入 `/opt/1panel/apps/cvd-experiment-data-system/backups/20260727_205327`；`database.sql` 与 `storage.tar.gz` 双哈希通过，目录权限为 `0700`、文件权限为 `0600`。
- 部署后服务器仓库为干净 `main`，backend/frontend 均为 `running + healthy`，Alembic 保持 `20260711_0001 (head)`；公网 `/health`、首页、`runtime-config.js` 和匿名 401 边界通过。浏览器插件因用户侧域名禁用策略未执行登录态页面复验，留给用户在线审阅。
- 目标产物复核版经 PR #6 合并；PR 运行 `30285604420` 与 `main` 运行 `30285756021` 的五项 required checks 全部通过。普通 `./deploy.sh` 从 `ff9d8b0` 前滚到 `6a58716`，没有新增迁移，也没有使用批8能力或 schema guard 旁路。
- 发布前自动备份写入 `/opt/1panel/apps/cvd-experiment-data-system/backups/20260728_004202`；`database.sql` SHA-256 为 `94b9e0e6a4e110b12ab78faae69a5625c557abcecd462c945a3527297009c84c`，`storage.tar.gz` SHA-256 为 `57ab41746f7353e80997348b388f73f63bb74684ab9daf8bfed7bbe0bd420e17`。
- 部署后服务器仓库为干净 `main`，backend/frontend 均为 `running + healthy`，Alembic 保持 `20260711_0001 (head)`；公网 `/health`、首页、`runtime-config.js` 和匿名 401 边界通过，生产静态产物中已确认包含新的体相选择文案。
- 实验装置 v3.16 经 `main` Actions `30337068506` 五项全绿后，按普通 `./deploy.sh` 从 `00c1952` 前滚到 `f0dfe93`；没有新增迁移，也没有使用批8能力或 schema guard 旁路。
- 发布前自动备份写入 `/opt/1panel/apps/cvd-experiment-data-system/backups/20260728_150718`；`database.sql` SHA-256 为 `b649b3f0d843bdb335edf2badcdf272dc31b8f19a93c6191195063015feca3c6`，`storage.tar.gz` SHA-256 为 `1b5dc9a93983548bb546241e5aadc8ab239ecf0b6df302587421cf261f8fa6d9`，目录权限为 `0700`、文件权限为 `0600`。
- 部署后服务器仓库为干净 `main`，backend/frontend 均为 `running + healthy`，Alembic 为 `20260728_0002 (head)`；公网 `/health`、首页、`runtime-config.js`、匿名 401 边界及“制造商或品牌”“实验室装置编号（资产编号）”“标称测温精度”静态产物通过。浏览器插件因用户侧域名禁用策略未执行页面复验。
- 实验装置 v3.17 与前驱体 v3.18 经 `main` Actions `30352259683` 五项全绿后，按普通 `./deploy.sh` 从 `f0dfe93` 前滚到 `07eccde`；没有新增迁移，也没有使用批8能力或 schema guard 旁路。
- 发布前自动备份写入 `/opt/1panel/apps/cvd-experiment-data-system/backups/20260728_185046`；`database.sql` SHA-256 为 `b43411151e7c825dc06d56b1d4c9fddf946bcf39d7dcee94e78c0bfb174850cc`，`storage.tar.gz` SHA-256 为 `3ee1e34946f254970cedf0b85546d8e6cd05352e508af2593c75cc8c2d6894c9`，目录权限为 `0700`、文件权限为 `0600`。
- 部署后服务器仓库为干净 `main`，backend/frontend 均为 `running + healthy`，Alembic 保持 `20260728_0002 (head)`；公网 `/health`、首页和匿名 401 边界通过。浏览器只读验收因用户侧域名禁用策略未执行，未写入生产验收数据。

- 2026-08-07 14:15 CST，经用户明确授权不保留现有生产测试数据，发布 `d3ce6b9` / v4.0-alpha.15。操作前精确核对目标为 `cvd` 数据库（2 个用户、6 个炉次）及本项目专用附件卷；停止应用后清空 public schema，并通过 `docker compose down -v` 删除、重建附件卷。此次按用户指示未为被清理的测试数据创建新备份；历史 v1 离线归档库未连接、未修改。
- 空库由后端启动迁移到 `20260730_0009 (head)`，仅重新创建用户指定的管理员 `admin@rustypiano.com`；密码未写入仓库或部署记录。最终用户 1、炉次 0、样品 0、物料批次 0、附件 0。管理员登录及 `/api/v1/auth/me` 返回 200，backend/frontend healthy，公网 `/health`、首页、`runtime-config.js` 与匿名 401 边界通过；生产静态产物中旧反应计时文案 0 命中、新“过程压力”文案存在。

- 2026-08-29 16:11 CST，经用户明确授权发布 `86e4167` / v4.0-alpha.18。普通 `./deploy.sh` 先完成数据库与附件备份，目录为 `/opt/1panel/apps/cvd-experiment-data-system/backups/20260829_161129`，再构建并重建 backend/frontend；未清理生产数据，未连接或修改 v1 离线归档库。
- 新增迁移已前滚到 `20260813_0011 (head)`；backend/frontend 均为 running + healthy。公网 `/health` 返回正常，首页与 `runtime-config.js` 返回 200，匿名 `/api/v1/auth/me` 保持 401。发布前本地后端 317 passed、4 skipped，前端 320/320（55 files），字段源/xlsx、Ruff、格式、ESLint、TypeScript 与构建全部通过。

- 2026-08-31 01:32 CST 发布 `ec8b7b4` / v4.0-alpha.19。普通 `./deploy.sh` 从服务器上的 `3cfbe84` 快进，先自动备份数据库与附件到 `/opt/1panel/apps/cvd-experiment-data-system/backups/20260831_013208`，再构建并重建 backend/frontend；未清理生产数据，未连接或修改 v1 离线归档库。
- 备份目录权限为 `0700`，两个归档权限为 `0600`；`database.sql` 为 160065 bytes，SHA-256 `48be576bff941554422d5690a2ad65d0f506baf66daf9f67e386fd62a2e716b5`；`storage.tar.gz` 为 82 bytes，SHA-256 `14820862ef67b77133dd32b8d8e01bee89ad7fc38378c8e3cb3b70b93e65291e`，归档可读。
- 本地后端 404 passed、4 skipped，前端 388/388（58 files）；发布前以独立容器、网络和 worktree 在服务器 PostgreSQL 18.6 上执行表征关键路径 29 passed，临时资源已清理。独立终审 P0/P1/P2 = 0。
- 没有新增数据库迁移，生产 Alembic 保持 `20260813_0011 (head)`；服务器工作树干净，backend/frontend 均为 running + healthy，backend 日志无 ERROR/Traceback/FATAL。内网与公网 `/health` 返回正常，首页与 `runtime-config.js` 返回 200，匿名 `/api/v1/auth/me` 保持 401。

## 尚待真实数据验收

没有为验收伪造生产实验。第一条真实炉次需要由实际实验人按真实条件完成：

`实体/版本引用 → 炉次分节保存 → 锁定 → 自动样品 → 结果/附件 → JSON/CSV ZIP 导出 → check_r0 compliant`

完成后再把该炉次编号和 R0 结果补入本报告；在此之前，技术部署与登录验收已完成，但“真实科研数据闭环”仍明确标记为待验收。
