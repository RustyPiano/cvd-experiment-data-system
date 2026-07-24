# 香港生产环境 v2 部署记录（2026-07-24）

## 结论

- `https://cvd.rustypiano.com` 已切换到 v2；初始切换提交为 `4e0b65a68d74cf87cb0d74f8f9a124b8c9acdf1b`，当前应用发布提交为 `f91057be871e5b8b50fb836b3e94f952bb3f4dbf`。
- GitHub Actions 运行 `30076866424` 的 Backend、PostgreSQL smoke、Frontend、Field source、Generated artifacts 五项均通过；`main` 已设置同名 required checks，并禁止强推和删除。
- 生产 backend、frontend 均为 `running + healthy`；公网 `/health`、首页和 `runtime-config.js` 均验证成功。
- 旧版数据没有删除。旧数据库已离线归档为 `cvd_v1_archive_20260724`，新 v2 使用全新的 `cvd` 数据库。
- 用户指定的管理员账号已创建，API 与真实浏览器登录均通过。

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

## 尚待真实数据验收

没有为验收伪造生产实验。第一条真实炉次需要由实际实验人按真实条件完成：

`实体/版本引用 → 炉次分节保存 → 锁定 → 自动样品 → 结果/附件 → JSON/CSV ZIP 导出 → check_r0 compliant`

完成后再把该炉次编号和 R0 结果补入本报告；在此之前，技术部署与登录验收已完成，但“真实科研数据闭环”仍明确标记为待验收。
