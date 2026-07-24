# 全库加固验收报告（2026-07-24）

## 结论

**PASS。** 科学契约、数据完整性、权限与并发、导出、生产防护、用户工作流、双语与无障碍的本轮整改均已通过对应门禁；独立终审未留下 P0/P1/P2。生产环境未连接、未修改，未运行 `deploy.sh`。

本报告是 2026-07-17 完整 17 步浏览器验收之后的加固复验：完整业务主线继续由后端全流程测试和既有浏览器报告覆盖，本轮真实浏览器重点复查新增或修正的高风险交互，不虚构重复执行整套人工步骤。

## 环境与隔离

- 自动化：macOS 本地工作区；Python 3.12 + UV；Bun；SQLite 全套；独立 PostgreSQL 16 测试库。
- 浏览器：一次性 SQLite 数据库、上传目录、管理员与基础资料；本地 FastAPI/Vite；桌面与 `390 × 844` 移动视口；中文与英文。
- PostgreSQL：在现有测试容器中创建独立数据库 `cvd_audit_final_20260724`，执行 Alembic initial 和定向测试后删除。
- 清理：浏览器临时数据库、上传目录、凭据、两个开发服务、PostgreSQL 独立数据库与测试文件均已清理。
- 未执行：生产连接、生产数据写入、镜像发布、push、Actions、`deploy.sh` 和批 8。

## 自动化门禁

| 范围 | 命令/口径 | 结果 |
|---|---|---|
| 后端静态质量 | `uv run ruff check .`；`uv run ruff format --check .` | 通过 |
| 后端 SQLite 全套 | `uv run pytest` | **357 passed, 4 skipped**；跳过项均为显式 PostgreSQL-only 场景 |
| PostgreSQL 16 | Alembic upgrade + 全流程、文件、索引/触发器/并发/一致性快照测试 | **6 passed** |
| 运维脚本 | 故障注入测试、Bash 语法 | **59 passed**，语法通过 |
| 前端格式与静态质量 | Prettier、ESLint、TypeScript | 通过 |
| 前端测试 | `bun run test` | **39 files, 294 tests passed** |
| 前端产物 | `bun run build` | 通过 |
| 字段单一源 | `check_field_source.py` + xlsx 逐格一致 | **81 个实验字段、48 个实体字段、R0 18 项**，通过 |
| 生成物 | 后端模型、JSON Schema/字典、前端字段元数据、OpenAPI 类型、xlsx | 已重建；漂移门通过 |
| Compose | 本地配置；使用 `.env.production.example` 的生产配置 | 两者 `config --quiet` 均通过 |
| 仓库卫生 | `git diff --check`；未跟踪生成物/本地工具护栏 | 通过 |

## 真实浏览器复验

| 场景 | 结果 |
|---|---|
| 登录、炉次列表和默认导航 | 通过；默认进入炉次工作区，导航与状态文案清晰 |
| 装置、物料、仪器创建与版本历史 | 通过；版本摘要、历史查看语义和双语显示正确 |
| sccm 参考条件与装置复合几何 | 通过；复合值显示为具名尺寸和单位，不暴露 JSON |
| 实体附件版本绑定 | 通过；附件绑定到新版本，历史版本不被覆盖 |
| 开始炉次的最小输入 | 通过；`datetime-local` 原生输入可保存，创建后回读时间一致 |
| 条件必填缺失清单 | 通过；判别字段未选择时不再提前列出隐藏的组成或数值字段 |
| 机器码本地化 | 通过；`optical_microscopy` 显示为“光镜”，内部 code 不泄漏到界面 |
| 历史版本标题 | 通过；历史版本显示“查看版本 / Viewing version”，不再自称当前版本 |
| 中文/英文切换 | 通过；抽查页面、字段、状态与选项无语言混杂 |
| `390 × 844` 移动布局 | 通过；导航、列表、表单和详情无功能性溢出 |
| 控制台 | **warning = 0，error = 0** |

浏览器网络记录中的 401 会话过期、缺少可选模块时的 404、以及刻意触发锁定缺项的 422 均由界面按预期处理；未出现意外 5xx。

## 本轮浏览器发现并关闭的问题

1. `datetime-local` 仅监听 change，原生输入事件后切换字段会丢失时间：改用原生 input 语义并补 DOM 回归。
2. 仪器方法列表暴露 `optical_microscopy`：统一走字段选项本地化。
3. 装置复合几何直接显示 JSON：复用结构字段定义，显示“外径（mm）：50 · 壁厚（mm）：2”。
4. 历史版本摘要写“当前版本”：改为明确的历史查看标题。
5. 条件判别字段为空时，锁定清单提前列出隐藏字段：在前后端条件求值根部统一缺失语义，并增加跨语言 fixture。

## 独立终审追加闭环

首次终审没有被既有门禁说服，追加发现 1 个 P1 和 4 个 P2；全部按真实触发路径补回归后关闭：

1. 备份、schema guard 与 Compose 可能静默指向不同数据库：取消生产样式默认值，四个目标参数缺失、空白、占位或逐项不一致均 fail-closed。
2. dump 或存储归档失败后留下貌似完整的时间戳目录：退出时只删除本次半成品，保留全部既有备份。
3. legacy PATCH 可清空或改绑 `characterization_record_id`：从 Update/OpenAPI 契约删除该不可变字段，正常指标更新仍保留原关联。
4. 前端接受 `domain_size_um = 0`：保存边界改为严格正数，零值立即显示错误且不能提交。
5. 英文结果表单和摘要显示“层”：统一走现有单位本地化，显示 `layers`。

修复后由同一终审路径复核，最终 **P0/P1/P2 = 0**。Shell URL 校验按现有生产模板保守失败关闭；未来若引入 IPv6 或对用户名、库名做百分号编码，再升级为正式 URI 解析。

## 可追溯入口

- 完整问题—整改矩阵：`docs/reviews/2026-07-24-comprehensive-audit-remediation.md`
- 现状与下一步：`docs/standard/STATUS.md`
- 浏览器完整主线基线：`docs/operations/e2e-run-first-report-2026-07-17.md`
- 现行走查清单：`docs/operations/e2e-walkthrough-checklist.md`

下一步严格保持：push → GitHub Actions 首绿 → 设置 required checks → 用户在场执行批 8。批 8 前禁止运行 `deploy.sh`。
