# 现状与真相指针（STATUS）— 任何新 session / Agent 先读我

> 本文件是本仓库的**单一入口**：读完它 = 拿到全部背景 + 当前进度 + 下一步，**无需向用户重复交代**。
> 任何文档与本文件冲突，**以本文件为准**。最后更新：2026-07-17。

## 0. 一分钟速览（给接手的 Agent）
- 这是一个 **CVD 二维材料实验数据采集系统**。
- **仓库已 v2 单轨**（2026-07-11 批1–7 执行完毕，v1 代码/表/端点/前端全部拆除）：唯一实验域 `cvd_v2`、唯一前端 `frontend-next`、唯一命名空间 `/api/v1`、schema = 单一 initial（14 表）。计划与执行记录见 **`docs/engineering/v2-single-track-plan.md`**（批0–批8）。
- ⚠️ **线上生产仍是切换前的旧部署（v1）——批8 生产切换（人工门，用户在场）未执行；在此之前禁止运行 `deploy.sh`**（旧库上启动自动迁移会崩溃循环；数据已确认可弃，切换 = 整库重建）。
- 当前阶段：**收尾批 F1–F9 基线已于 `52bc560` 提交，并经独立 Agent 复审与全门禁验收**。2026-07-16 用户逐项确认新的**炉次优先工作流与全量双语文案重构**，规格见 `docs/product/run-first-workflow-and-copy-design.md`，现进入分阶段实施。发布顺序：产品重构 → 全量门禁与新版 E2E → push + Actions 首绿 → 批8生产切换。**线 B** 仍等俊杰对齐 4 问后冻结标准。
- 两份交付物已 **freeze-ready**（经 **3 轮独立评审**，最终 8.5/10）：
  - 字段表 `字段草案-v3.xlsx`（**v3.4**，77 字段 + 3 张一等实体表）——生成脚本 `build_field_tables.py`
  - 文字标准 `cvd-2d-process-data-standard-v2.0.md`
- **导师书面评审已回**（2026-07-07，`docs/research/FSS Re-副本字段草案-v3.xlsx`，标黄 9 处+红字 2 处）→ **v3.4 已回改 6 条**；剩 **4 个问题待与俊杰当面对齐**（见 §6 首条），对齐后即可正式冻结。
- **不要擅自重开已定决策**（见 §4）；2026-07-16 产品重构决策是用户明确确认的最新覆盖项。
- 工程历史与技术决策（D1–D12）见 `docs/engineering/v2-implementation-plan.md`；生产切换见 `docs/engineering/v2-single-track-plan.md`。不再使用 Superpowers 文档流程。
- 推荐读序：本文件 → `docs/README.md` → `docs/product/run-first-workflow-and-copy-design.md` → `cvd-2d-process-data-standard-v2.0.md` → `字段草案-v3.xlsx` →（要背景细节再看）`metadata-v2-review-and-redesign.md` →（写代码）根 `AGENTS.md`。

## 1. 系统现状
- **仓库 main = 纯 v2 单轨**；**线上生产 = 切换前旧部署（v1），待批8 整库重建切换**（数据已确认可弃，无迁移）。
- **v2 单轨形态**：Alembic 单一 initial `20260711_0001`（14 表，SQLite/PG 双兼容）；`/api/v1` 全套端点——实体三件套锁版（material-lots/setups/instruments + versions）、炉次 CRUD + 状态机（submit/lock/unlock/invalidate/return-to-draft，R0 阻塞门 + 全转移审计 + 结果缺失待办）、模块 payload、表征/实测、样品、文件；生成器①②④⑤ + `condition-cases.json` 跨语言 fixture + `check_field_source` 四护栏；前端 `/experiments` 单轨 + 实体库三页。
- **已确认但未实施的产品目标**：炉次为主入口；draft→locked 两步；衬底锁定时生成样品；表征与测量结果合并录入；成员可为全组 locked 炉次补结果；基础资料就地新增；暂时隐藏 PVD；完整双语；增加筛选、审计查看和 JSON/CSV 导出。当前代码仍是上一行描述，禁止把目标误报为现状。
- **门禁：后端 pytest 147 · 前端 vitest 210 · CI 四 job 全绿（本地）；全部 commit 未 push（push 时机见 §6）**。
- **F6–F9 验证结论**：API 级全栈冒烟通过；**Codex xhigh 全量 diff 复审**（批2–F5）的 5 CONFIRMED + 3 PLAUSIBLE 已由 F7 修复；交互式浏览器 E2E 发现的文件 SQLite 并发踩踏与实验日期跨日错位已由 F8 修复并补红绿回归；F9 完成最终正确性、审计与工程防护收尾。
- 工程约定见根 `AGENTS.md`。

## 2. 真相三件套（+ 字段表怎么改）
1. **`field-source.yaml`** —— **字段单一权威源**（P1 起生效，实现方案 D1）：77 字段 + 46 实体字段 + 条件必填表达式 + R0 标记 + pending-alignment 标记。`字段草案-v3.xlsx` 是它的**渲染产物**（人读视图，4 个 sheet），由 `build_field_tables.py` 生成。导师批注原件在 `docs/research/FSS Re-副本字段草案-v3.xlsx`（勿改，输入件）。
   - ⚠️ **改字段只改 `field-source.yaml`**：改完 `python3 docs/standard/build_field_tables.py` 重新生成 xlsx，再 `python3 docs/standard/check_field_source.py` 校验（CI 强制逐格一致，防手改/防漂移）。
2. **`cvd-2d-process-data-standard-v2.0.md`** —— 人读规范 / 规则书（原则·五判据·数据模型·词表·结果哲学·合规）；**字段级明细以 xlsx 为准**。
3. **`metadata-v2-review-and-redesign.md`** —— 设计依据 / 国际对标（NOMAD/GEMD/ESCALATE/2DCC/NeXus/CHMO）+ 隐变量文献。

## 3. 背景 / 来龙去脉（为什么有 v2 重构）
- v1 上线后，**2026-06-11 组会导师系统性批评**元数据设计（字段逻辑随意、缺压力/降温/几何、主观词表、无最小可复现证据、没看过别的数据库…）。
- 产出 `metadata-v2-review-and-redesign.md`：逐条自查 + 国际对标 + 隐变量文献 + V2 重构方案。
- **2026-06-24 组会**与师兄（俊杰等）**逐字段走查**（录音转录在桌面 `"标准录音 22"-转文本结果.txt`），定了一版草案 → 收敛为 `字段草案-v3.xlsx`。
- 三轮 **Fable 独立架构评审**（见 §5）把设计的自相矛盾/闭环缺口逐个焊死，到 8.5/10、记录 schema 可冻结。
- 论文叙事定位：卖点是**"面向气固多相 CVD 的最小可复现元数据标准"本身**（每字段有机理/文献依据、经同行逐条评审、有国际对标、有失败溯源验证路径）；建站/版本管理/导出这些工程能力降权重。

## 4. 已冻结 / 已定的决策（**不要重新 litigate**）
- **记录单元** = 炉次（`run_code`）；**样品 = 关联主键**；表征为独立记录、外键指向样品。
- **结果模型** = 不在录入端判成败；砍主观 success/partial/failed 标签，保留 §7『观察到的现象』**客观词表**；**结果留存合规规则**（终态无结果→"结果缺失"待办）落实 P1 失败即数据。
- **坐标系全局定死**（上游负/下游正，原点固定，随装置引用冻结）。
- **掺杂/合金/异质结** → `结构类型`（判别器）+ `组成明细 components[]`（权威、复合体系条件必填）；显示串化学式是派生。
- **温度** = 设定 + 实测（删"估算衬底真温"）。
- **§6** = 过程事件 Process Events；事件类型与关联对象合并为『事件/部位』。
- **一等实体**（MaterialLot / 装置 Setup / 表征仪器）= 引用 + `版本号` 锁版快照冻结；实验只引用不重录。
- **R0 最小可复现集**（16 项，按相态/结构类型条件化，可被 schema 证明）；**PVD 暂不纳入 v2.0 合规**（占位）。
- **时序** 不进 payload_json（FileAsset + 通道注册 + 派生标量）。
- 术语审定（衬底≠基底、批号≠批次号、吹扫≠洗炉、校准≠标定…）。
- **v2 单轨后放弃"submit 创建版本快照"语义**（2026-07-11 拍板）：`experiment_versions` 随 v1 拆除，不另建 v2 实验级快照——实体锁版快照+状态流转审计留痕已覆盖；未来有真需求再单独立项。
- **P1.5 冻结范围 = 字段语义层**（字段集合/必填与条件/词表/R0 标记；2026-07-11 拍板）：**UI 呈现属性（如"条件不满足时隐藏 vs 仅红星"）不在冻结范围**，可经单一源管线继续演进（见单轨化计划批6）。
- **锁定语义 = 锁工艺、结果后补**（2026-07-11 拍板，方案甲）：locked 炉次**工艺域**（模块 payload、装置引用、状态元数据）只读，**结果域**（表征记录、实测产物、表征附件）可继续写入；"结果缺失"待办随结果写入自动刷新消除。invalid 炉次一切写路径均拒。落地见单轨化计划收尾批 F2。
- **炉次优先产品重构**（2026-07-16 用户逐项确认，待实施）：炉次为默认入口；状态简化为 draft→locked；衬底自动生成样品；结果一次录入但底层保留分表；全组成员可为 locked 炉次补结果；基础资料就地新增；PVD 暂不开放；中文 canonical 值不迁移、补全英文显示；增加筛选、审计时间线和 JSON/多表 CSV 导出。该决策覆盖旧的 submitted 产品语义和当前结果区交互，但不改变字段科学语义与“锁工艺、结果后补”原则。

## 5. 进展日志（决策 + commit + 评审）
| 日期 | 事项 | commit |
|---|---|---|
| 06-11 | 导师批评 → 启动 v2 重构 | — |
| 06-24 | 逐字段走查 → v3 草案 | — |
| 07-06 | 归档 v1/过时文档 + 建 STATUS 指针（+CLAUDE.md/AGENTS.md 入口） | `e490cd4` |
| 07-06 | 字段表 v3 定稿（结构类型/过程事件/目标性能） | `c8f57a8` |
| 07-06 | 重写文字标准 v2.0 | `6812913` |
| 07-06 | **Fable 一轮评审 6/10** → v3.2 评审回炉（观察现象/化学式升R0/组成明细/降温/记录单元/时序） | `6e1cb14` |
| 07-06 | **Fable 二轮 7.5/10** → v3.2b must-fix（相态判别字段/components 升权威/结果留存规则/PVD 排除合规） | `404f502` |
| 07-06 | 一等实体三张字段表 + 纳入合规 + AP/LP 校验敲定 | `8838160` |
| 07-06 | **Fable 三轮 8.5/10「可冻结」** → 冻结前收尾 B1-B4（实体版本号/§2只读投影/用量含液态/气瓶纯度分工） | `1a6e708` |
| 07-07/08 | **导师书面评审回件**（标黄9+红字2）→ **v3.4 回改 6 条**：目标性能补示例 · §3新增『外观描述』(潮解溯源) · 外场参数→条件必填(Setup有外场) · 检出相增堆垛 · PL峰宽+SEM占比改名覆盖率 · 图例行+必填字体强化；观察现象粒度留待俊杰 | `048f57b` |
| 07-08 | **实现期启动**：v1 代码库全量摸底（4份字段拷贝/无CI/双前端等）→ 定稿 `docs/engineering/v2-implementation-plan.md`（D1单一YAML源+五路生成器 · P0–P6 阶段与验收门） | `c13dc5e` |
| 07-08 | **P0 工程底线完成，门禁全绿**（Codex xhigh 初稿 + 本机验证收尾）：GitHub Actions 三 job（backend ruff+format+pytest / frontend tsc+eslint+vitest / generated-artifacts regen漂移检查）；`generated/` 从迁移种子库**真正重新生成**修复 `test_t5_5`（归档副本带⚠️横幅，拷贝恢复不成立）；ruff format 一次性拉平14文件；lint 零 warning 门禁；去重 router-plugin devDep。**pytest 287/287 · vitest 31/31 · tsc/eslint/ruff 全绿** | `f80808a` |
| 07-08 | **P1 完成（字段单一源）**：新增 **`field-source.yaml`**（77字段+46实体字段+条件必填表达式+R0×16+pending×4，由旧 ROWS 机械转换）；`build_field_tables.py` 改造为纯渲染器；新增 `check_field_source.py`（YAML↔xlsx **逐格一致** + 结构约束 + R0 计数护栏）并进 CI（第4个 job）；**验收门通过：YAML 渲染与 v3.4 现版字段级 diff = 空**。五路生成器分期决策记入实现方案 §7。CLAUDE/AGENTS/STATUS 入口同步改为"改字段=改 YAML" | `af42197` |
| 07-08 | **实现计划定稿 v1.1**：方案新增 §4b（P1.5–P6 逐阶段工作分解+验收清单）、P5 硬性备份门、P1.5 push/CI首绿门、P2 命名锚定、预授权例外（P1.5 拖延>2天 P2 可先行）、4 周目标周历 | `7704971` |
| 07-08 | **四个架构空白补定（D9–D11）**：表复用策略(additive-only) · **123 字段全部补机器键 key**（API/payload 契约，v1 命名风格）· §5 动态表单映射落 YAML `stage_types` 节（11 阶段×6 参数组）· 词表复用 ControlledVocabulary 无 DB enum；护栏同步升级（key 必有/唯一/合法 + stage_types 自洽）。**空降 agent 按方案开工已无架构级歧义** | `4c93748` |
| 07-08 | **D10 命名标准化二轮 + D12 国际化**：key 全词化 5 处、命名规则入 YAML meta；**123 字段全量补 `label_en`**（护栏强制）；D12 分层策略入方案（词表英文@P3 · i18next@P4 · 英文UI打磨不阻塞 v2.0）；P6 增 v1 退役清理择机项 | `8ecedb4` |
| 07-08 | **多智能体编排模式登记**（Codex后端/Opus前端/Sonnet机械/Fable总编排+验收门；分阶段发射；P5执行与P6切换保留人工门；§7先建后补授权） | `20984a8` |
| 07-08 | **P2 完成（v2 数据库；Codex xhigh 初稿 + Fable 验收）**：实体三件套 `material_lots`/`setups`/`instruments` + 不可变 `*_versions` 表；`experiment_runs` 仅加 4 可空列（D9 合规）；`characterization_records`/`measured_products` 新表；`seed_from_field_source.py` 幂等种子；Alembic `0032`；**pytest 300/300** | `01790cc` |
| 07-08 | **P3 完成（API+校验）**：生成器①（YAML→Pydantic，11 阶段判别 union+条件 validator）+②（v2 JSON Schema/字典导出进 CI）；`/api/v1/v2` 全套端点；`schema_version` 可空列（`0033`）；`check_r0` 命令；化学式渲染默认纯函数（待明确#1）；**pytest 309/309 · 生成器逐字节复现** | `f93d467` |
| 07-08 | **P4 完成（前端表单，Opus 三步 + Fable 验收）**：(1/3) 生成器⑤ TS 双语字段元数据+防漂移 CI+i18next+openapi v2 类型 `92370b4`；(2/3) 实体库管理页×3（锁版语义交互/条件显隐）`81b09b3`；(3a) v2 表单骨架+§1–§4（components 编辑器/化学式校验/快照只读投影）`74c9720`；(3b) §5–§8（stageTypes 驱动动态过程步/事件/表征+实测/PVD 判别）`18f4864`；**vitest 117/117** | 见左 |
| 07-08 | **P4 验收门回归测试**：完整 cvd_v2 炉次全流程（实体→引用→全模块含全部条件必填→样品→表征→实测→`check-r0` compliant）**首跑即过**，永久留 CI；**pytest 310/310** | `b0a5b3e` |
| 07-08 | **P5 工具建设+硬化完成（未执行正式迁移）**：`v1-to-v2-mapping.yaml` 覆盖 68 字段（52 映射/12 丢弃/3 **待用户确认**（quality_label/failure_modes/color_change）/1 需人工（furnace_info→Setup 重建））；archive 表（`0034`）；`migrate_v1_to_v2`（dry-run 默认、`--execute`+`--i-have-backup` 双闸、先归档后覆盖、`--reconcile` 对账）；实体版本服务层必填校验；**pytest 319/319 · 双闸拒绝实测 · 未跑正式迁移** | `814725c` |
| 07-08 | **代码精简审查完成（4 个 Fable 组并行，43 条发现，未执行修改）**：无结构性问题；死代码簇 14 处、迁移报告 mapped 计数与实际执行范围错位（★迁移前必修）、表单三重枚举等。**报告与执行批次（批1零风险/批2低风险/批3需走查）见 `docs/reviews/2026-07-08-simplify-review.md`** | 本次 |
| 07-08 | **精简批1 执行**（零风险净赚）：死代码簇删除 + `del current_user`→`_current_user`×15 + 100上限/占位/冻结闸注释 + 迁移 mapped-vs-执行范围语义注释钉死。**门禁全绿：pytest 319 · vitest 117 · 生成物零漂移 · check_field_source 逐格一致** | `759a472` |
| 07-08 | **精简批2 执行**（低风险直白化）：B4 生成器拼接残影→f-string(regen 同 commit) · B7/B8/B9 migrate 去重加载/拆形状嗅探/状态查表 · B10 formula 双键兜底删除(前后端) · C3 去绕道扫模块 · C9 AddSampleControls · C10 §7 标签走元数据(删12 locale 键) · C11 叶子自取 useAuth · D2 zodResolver→手写 · D3 去枚举 token 启发式→声明条件反查 · D4/D5 render_field_sheet 提取+req_fill 前缀函数。**门禁同上全绿** | `abd00f9` |
| 07-08 | **批1+批2 Codex xhigh 独立复审**：10 项非机械重构逐条判等价，**零行为变更**（无 confirmed/plausible 发现，各带 file:line 证据）；Codex 未跑门禁（沙箱只读），门禁本机已绿。结论落 `docs/reviews/2026-07-08-simplify-review.md` 头 | 复审 |
| 07-09 | **v1 单轨化决策 + v2 架构评审（5 组 Fable 探查/评审并行）**：用户确认 **v1 试运行数据可弃、不为兼容妥协** → 定案完全拆除 v1（当前仓库内、不新开项目、v2 不重写）。评审结论：v2 骨架正确无过度工程（单一源管线 A-、锁版快照正确、元数据驱动表单为真）；发现 2 个产品缺口（**v2 无 submit/lock 状态机**、`refresh_result_missing_todo` 零调用者悬空；表征记录挂不了文件）+ 管线软肋（条件表达式解析器 4 份已漂移、失败静默；DB 词表孤儿双源"改了没用"）。**完整计划落 `docs/engineering/v2-single-track-plan.md`（批0–批7，取代 P5/P6）**；P5 迁移全线作废、俊杰 3 个迁移映射问题作废 | `27bb653` |
| 07-11 | **单轨化计划深入复评 + 修订（5 组并行取证，逐断言 file:line 验证）**：批2"models 层零 import"**被证伪**（`normalize_module_payload`←`clone_for_run`、`ExperimentRepository` setup join、`file_asset_service` 词表校验三处红线硬依赖）+ 漏列 schemas/repositories 两层与 4 聚合器；批3 实际范围扩大（锁定守卫缺 5 条写路径、v2 零 audit、v1 行为表钉入计划）；发现**缺生产切换批**（容器启动即 `alembic upgrade`，squash 后老库部署即崩）→ **新增批8 人工门** + 红线"批8 前禁 deploy"；批6 否决"生成 TS matcher"（过度工程）改为后端 import 收敛+前端手工对齐+跨语言 fixture；批5 地基确认干净（待删表零入度 FK、裸 Uuid 列、SQLite 兼容要求）。修订版计划为准。**随后用户拍板两项**：放弃 submit 版本快照、P1.5 冻结范围排除 UI 呈现属性（均入 §4 冻结清单） | `47ce09a` |
| 07-11 | **单轨化开工**：批0 用户豁免（确认全部为测试数据，无需备份）；**批1 完成**——删除遗留前端 `frontend/`（31.9k 行），README 9 处引用清理（含 :143/:147 "dev compose 构建旧前端"过时错话修正、回归清单 `cd ../frontend`→`frontend-next`）、AGENTS.md 去退役表述；门禁：compose config OK、残留引用仅存 untracked 历史规划稿。工作模式：**codex-first**（实现委派 Codex CLI，Claude 规格/评审/门禁，技能落 `.claude/skills/codex-first`） | `73c0236` |
| 07-11 | **单轨化批2完成（后端 v1 面拆除）**：删除 v1 endpoints/services/schemas/repositories/commands/models、迁移映射与 v1 生成物；四处保留路径切耦合；文件上传词表校验改读 `field-source.yaml`；samples 测试改由 v2 建炉次；样品详情最小补丁改读 v2 炉次且不再跨引 v1 experiments API；CI 生成物 job 仅保留 v2 导出与漂移检查。**pytest 77/77（含 full walkthrough）· vitest 117/117 · ruff/tsc/eslint/字段源校验全绿** | `0d755a3` |
| 07-11 | **单轨化批3完成（v2 状态机收编）**：新增 submit/lock/unlock/invalidate/return-to-draft 五端点，R0 服务门、全转移审计、结果缺失待办接线、五条锁定写守卫、读模型时间戳/待办字段；`list_runs` schema 过滤与 count 下推、实体版本冲突转 409；前端状态徽章/动作/缺失清单/终态只读体验与双语文案。**pytest 81/81 · vitest 124/124 · ruff/tsc/eslint/字段源校验全绿** | `641f09b` |
| 07-11 | **单轨化批4完成（前端收编）**：删除五组 v1 feature（20,493 行）与对应路由（112 行），`experiments-v2` URL 收编为 `/experiments`、侧边栏单轨；OpenAPI 类型从当前后端全量重生成并清除 legacy 声明；`experiment-v2-form` 三重枚举收敛为 `MODULE_SPECS`，新增 12 条行为测试覆盖各模块 payload/setup-reference/失败路径。**pytest 81/81 · vitest 114/114 · tsc/eslint/字段源校验全绿；UI 手工走查待用户** | `ce20afc` |
| 07-11 | **批4 走查修复（3 个 E2E 发现）**：12 个复合输入按 YAML `input` 元数据渲染自由值+下拉并无损拼接/回读；`target_product.chemical_formula` 补录/清空同步 `material_system`；Select 空初值保持受控。补齐纯函数、双代表控件、受控值及后端更新/清空/旁路回归测试。 | `9e93353` |
| 07-11 | **单轨化批5完成（Schema 重基线）**：34 段 Alembic 链 squash 为单一 initial，终态仅 14 表；炉次/样品模型与 API 删 v1 列，`schema_version` 非空，module 默认 `cvd_v2`，`basic_info.run_code` 双存保持原快照语义，`file_assets` 预埋表征 FK 与双向 ORM 关系；OpenAPI 与 samples UI 收敛。**pytest 86/86 · vitest 128/128 · alembic check/upgrade/downgrade · ruff/tsc/eslint 全绿** | `e8bbd75` |
| 07-11 | **单轨化批6完成（API 收编 + 管线加固）**：全套 v2 端点 `/api/v1/v2/*` 收编为 `/api/v1/*`，OpenAPI/前端调用同步；后端生成模型改复用运行期 `condition_matches`，与前端共享 matcher 构成现实下限 2 份；新增 16 例跨语言 fixture；字段源校验补条件引用/op/in值/下拉 options 四护栏；3 个 `visibility_gated` 由 YAML 透传到前端并删除硬编码 Set。**pytest 103/103 · vitest 147/147 · 路由 path+method 冲突 0 · ruff/tsc/eslint/生成物漂移/字段源校验全绿** | `31fafa8` |
| 07-11 | **单轨化批7完成（文档收尾）**：STATUS §0/§1/§6 重写为 v2 单轨现状（线上=切换前旧部署，批8 人工门待执行）；AGENTS.md 状态流表述对齐 v2 实际、删失效"设计语境"节（指向他人机器绝对路径且 PRODUCT/DESIGN 已归档）；CLAUDE.md 一句话现状更新；两份计划文档头部横幅更新（P5/P6 取代关系+批1–7 完成）；README 四个 v1 大章节（前端/后端能力、接口清单、行为边界）重写为 v2 现状。**线 A 至此只剩批8 生产切换（人工门）** | `f4ff953` |
| 07-11 | **收尾批 F1 完成（保险与硬顺序）**：`v1-final` tag（`47ce09a` 逃生舱）；`deploy.sh` schema 哨兵（库版本不在迁移链→拒绝部署并提示批8，`SKIP_SCHEMA_GUARD=1` 应急旁路）；F1–F6 收尾批计划与锁定语义甲落盘 | `51f67db` |
| 07-11 | **收尾批 F2 完成（锁定语义甲落地）**：工艺/结果写守卫分域，locked 仅锁模块 payload、装置引用与 setup diagram，样品可继续增改，表征记录/实测产物可继续增改删，characterization file 可继续上传/软删除；invalid 仍全拒；六条结果 CRUD 全部接线 `refresh_result_missing_todo`；前端工艺/结果禁用边界与双语锁定横幅对齐。**pytest 106/106 · vitest 148/148 · ruff/tsc/eslint/字段源校验全绿** | `94fdc84` |
| 07-11 | **收尾批 F3 完成（优雅性清扫）**：写操作按炉次可见性统一分层（不可见 404，可见无写权 403）；`status` 边界收紧并重生成 OpenAPI；`v2_service.py` 拆为实体/炉次/结果三域；模块 upsert 与实体追加版本补轻量审计；样品码唯一冲突 rollback 后 409；dev 字段源绕过缓存；清理 draft-only/v1 语义残留命名与前端 status 手工重铸。**pytest 111/111 · vitest 148/148 · ruff/format/tsc/eslint/字段源校验全绿** | `8614344` |
| 07-11 | **收尾批 F4 完成（表征文件证据链闭环）**：表征记录附件上传/按记录过滤/审计快照接线，跨炉次与样品不匹配拒绝；活跃附件阻止删表征记录，附件软删除后可删；前端每记录单文件上传、列表、下载与 AlertDialog 软删除，locked 可写、invalid 只读。**pytest 118/118 · vitest 153/153 · ruff/format/tsc/eslint/字段源校验全绿** | `5a9a9ae` |
| 07-11 | **收尾批 F5 完成（测试补强）**：`results-section` 补建样、表征/实测 CRUD、表征关联、附件失败 detail 与 locked/invalid 行为级覆盖；12 个复合字段从生成元数据参数化全覆盖；审计 action actor/entity/action 断言补齐；F2 工艺/结果守卫矩阵逐格盘点无缺口。**pytest 118/118 · vitest 171/171 · ruff/format/tsc/eslint/字段源校验全绿** | `e67d7a0` |
| 07-11 | **收尾批 F6 完成（全栈验证）**：API 级真服务冒烟通过（空库单步建成→登录→建炉→R0 422 结构化清单→前端生产构建）；**Codex xhigh 全量 diff 复审**（批2–F5）产出 5 CONFIRMED + 3 PLAUSIBLE（全部转 F7 修复）；浏览器 E2E 因 codex exec 无头会话无内置浏览器，移交用户交互式会话（走查工单固化至 `docs/operations/e2e-walkthrough-checklist.md`） | `45c0f3e` |
| 07-11 | **收尾批 F7 完成（xhigh 复审修复）**：submit/lock 合并 R0+全量必填门（含条件/过程步/PVD 语义）；非属主编辑入口归零，样品详情对齐结果域；词表判型删启发式、仅依 `field.input`；恢复审计复合索引并精确锁定全表索引基线；unknown-op 双端非对称语义 fixture 定案；表征附件 method 由记录派生且冲突 422；initial 删 `file_assets.method` 默认。**pytest 122/122 · vitest 181/181 · initial upgrade · ruff/format/tsc/eslint/字段源校验全绿** | `41c0f2d` |
| 07-12 | **收尾批 F8 完成（浏览器 E2E 两发现修复）**：仅内存 SQLite 保留 StaticPool，文件库恢复 QueuePool 并启用 WAL/5000ms busy timeout；`started_at` 按实验员本地墙钟保存 naive ISO，历史 Z 串继续按浏览器本地时区回读。并发鉴权读取 48/48 为 200，跨午夜两例无日期漂移。**pytest 124/124 · vitest 185/185 · ruff/format/tsc/eslint/字段源校验全绿** | `ff00f2e` |
| 07-12 | **收尾批 F9 完成（全库深审 → 五单全修 A1/A2/B/C/D）**：浏览器 E2E 重跑业务链路 16 项全通、唯一 FAIL 为控制台 Select 受控警告——四处 `value={X\|\|undefined}` 改既有 `\|\| ''` 约定并红绿回归（先行修复）；随后 5 路并行深审（后端/前端实验域/前端基建/文案 i18n/单一源管线），全部发现分五单修复。**A1 后端正确性**：run_code 格式门 `^CVD-\d{4}-\d{4}$`（乱格式建样永久 500 根除）+ 发号改当年 max+1 并撞号重试（行数计数死锁根除）；实体载荷数值/长度校验（SQLite 静默脏数据 vs PG 500 分叉堵死）；仪器引用成对且须存在否则 422；表征 method 过词表 + 附件 method/file_kind 级联同步；basic_info 回写 `experiment_date`、payload run_code 强制真身（创建后冻结）；R0 setup_ref 只认 run 列；登录邮箱大小写不敏感；`invalid_reason` 入读模型；422 统一 `detail.missing`/`detail.invalid`（pydantic 原文不再透出）；pyyaml 显式声明 + alembic↔models 零差测试。**A2**：审计补齐（结果域 CRUD/实体创建/建炉/装置引用，删除带前快照）；守卫收敛 `experiment_guards.py`（visible/owned + 工艺/结果/文件三种锁定策略具名，四服务去重）；「无」独占校验前移实体侧；Integer 拒非整 float；属主可见自身 invalid 炉次；后端死方法清理。**B 前端实验域**：模块保存成功回写 Query 缓存 + 表单 `key={runId}`（30s staleTime 下的数据回退路径根除）；列表分页 50/页+总数（20 条静默截断根除）；接入 RouteLeaveGuard；创建部分失败仍导航编辑页（孤儿 run 复建根除）；并发保存 Set+修订戳；非属主只读横幅；结果域拆 fieldset 一刀切（只读态下载/切样品可用）；表征/实测编辑加取消与指示、产物删除加确认、四查询补加载/错误态；编辑态 run_code 只读；表征记录随样品过滤并标注归属；`detail.invalid` 按字段标签中文渲染；a11y label/aria-describedby 补齐。**C 基建与文案**：storage 事件跨标签登出/登录同步（登出被刷新复活根除）；http-error 后端 detail 全量中文映射（29 静态串+3 类动态+字节转 MB+按状态兜底，结构化 422 直透表单层）；实体页 queryKey 去 token；登录/注册页已登录重定向；登出 401 豁免全局过期事件；实体详情按条件过滤不适用字段+历史版本编辑提示；错误态不再叠加空态；样品两页整页 i18n+角色统一 `roles.*`（「基底」两套译名/虚构存放位置列/「自动生成」错误空态根除）；自动保存不再禁用输入打断录入；StatusTag 复用状态键、未知状态不再伪装草稿；登录/注册/外壳/路由边界/离开守卫文案全部入 locales（zh/en 键镜像）；术语统一（炉次/装置/基础库/en Invalidated/全站「你」）；作废框写明后果+补取消键，解锁加确认框；必填缺失清单显示区块名不再暴露内部 key；新增 CJK 硬编码防回归扫描测试（AST 级）。**D 工程防护+死代码**：`deploy.sh` 哨兵 fail-closed（读不到 DB revision 即中止）；CI drift 补未跟踪文件门 + pip 钉主版本；`check_field_source` 补三护栏——`ne` 驱动须 required（`field_devices` 具名跨实体豁免+依据注释）/条件值∈驱动词表（`/`与`·`双分隔）/key 唯一性独立于 label_en；删 charts 等零引用死代码 65 文件 + 11 个独占依赖（prod build 通过）。**pytest 146/146 · vitest 210/210 · ruff/format/tsc/eslint/build/字段源校验全绿**（Codex gpt-5.6-sol 五单初稿 + Fable 深审/裁决/验收；Fable 另补 file_kind 级联缺口） | 未提交 |
| 07-16 | **炉次优先产品重构逐项确认**：炉次主线、两步状态、衬底生成样品、统一结果录入、基础资料就地新增、CVD-only UI、边做边记、locked 跨成员补结果、完整双语、筛选/审计/导出均获用户确认；规格落 `docs/product/run-first-workflow-and-copy-design.md`。文档改按 standard/product/engineering/operations/reviews/archive 分层，不再使用 Superpowers 文档流程。 | `149a48a`, `7dd057a` |
| 07-17 | **产品重构阶段 0 完成**：F9 工作区经独立 Agent 全量审核，修复 PostgreSQL 数值边界、炉次号耗尽、跨标签换号缓存、部署指引断链和 CI 工具链问题；复审通过。门禁：pytest 147、vitest 210、ruff/format/tsc/eslint/build、生成物与字段源校验全绿。 | `52bc560` |

## 6. 下一步

**线 A：炉次优先产品重构 → 发布 → 批8**

1. **阶段 0 已完成**：F9 基线已独立复审、全门禁验收并提交（`52bc560`）。
2. **当前执行阶段 1**：状态流简化、锁定时样品生成、跨成员结果权限与后端数据结构；完成后独立 Agent 审核。后续再实施统一结果录入、基础资料就地新增、CVD-only UI、筛选/审计/导出和全量双语。总规格见 `docs/product/run-first-workflow-and-copy-design.md`。
3. **验收**：后端、前端、生成物和字段源全门禁 → 更新 `docs/operations/e2e-walkthrough-checklist.md` → 浏览器 E2E 复验完整新流程与控制台零警告。
4. **发布硬顺序**：push → GitHub Actions 首绿 → 设置 required checks → **批8生产切换（人工门，用户在场）**：停容器 → 重建生产库 → 部署 → `create_admin` → 线上冒烟。**批8完成前禁止运行 `deploy.sh`**。

**线 B：标准冻结（外部线，不阻塞线 A 的非语义 UI 与工作流实现）**

1. **与俊杰当面对齐**：①观察到的现象粒度；②SEM覆盖率叫法和量化；③堆垛类型粒度；④外观描述词表。
2. 答案落地到 `field-source.yaml`，重跑全部生成器和校验。
3. 标准头 `DRAFT`→`FROZEN`、YAML `meta.status`→`FROZEN`，Actions 首绿后打 `v2.0.0` tag。

**明确延后**：实验模板和 clone、PVD、分析仪表盘、批量导入、JWT 服务端吊销、xlsx 字节级稳定性。化学式渲染规则仍待组内确认。

## 7. 已归档、别当真相的（在 `docs/archive/`，均带⚠️横幅）
v1 文字标准三件套、旧字段表(v1/v2)、v1 自动生成产物(`generated/`)、旧顶层设计(DESIGN/PRODUCT/v1设计/Agent brief)、汇报PPT/系统介绍/组会大纲、progress-report。**仅供追溯，不代表现状。**

## 8. 研究素材（仍有用，但不是"真相/规范"）

统一存放在 `docs/research/`：导师批注原件、国际对标表、会议纪要和材料数据标准调研附件。
