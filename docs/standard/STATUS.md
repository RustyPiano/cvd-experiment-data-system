# 现状与真相指针（STATUS）— 任何新 session / Agent 先读我

> 本文件是本仓库的**单一入口**：读完它 = 拿到全部背景 + 当前进度 + 下一步，**无需向用户重复交代**。
> 任何文档与本文件冲突，**以本文件为准**。最后更新：2026-07-11。

## 0. 一分钟速览（给接手的 Agent）
- 这是一个 **CVD 二维材料实验数据采集系统**。
- **线上运行 = v1**（`cvd_v1` / 68 字段），但 **2026-07-09 已定案：v1 试运行数据可弃、完全拆除 v1、v2 单轨化**——拆除+重基线计划见 **`docs/v2-single-track-plan.md`**（批0–批8，取代原 P5 迁移/P6 切换；**迁移全线作废**；**2026-07-11 经 5 组取证复评修订**——批2 补两层+三处红线切耦合、批3 扩范围、批6 换方案、新增批8 生产切换人工门，执行前以修订版为准）。v2 代码已开发完成（P0–P5 工具，见 §5）。
- 当前阶段：两线并行——**线 A** 单轨化拆除**执行中**（批0 用户豁免（测试数据）、批1–4 已完成，下一步批5；批4 UI 手工走查待用户）；**线 B** 等俊杰对齐 4 问 → P1.5 冻结（互不阻塞，见 §6）。
- 两份交付物已 **freeze-ready**（经 **3 轮独立评审**，最终 8.5/10）：
  - 字段表 `字段草案-v3.xlsx`（**v3.4**，77 字段 + 3 张一等实体表）——生成脚本 `build_field_tables.py`
  - 文字标准 `cvd-2d-process-data-standard-v2.0.md`
- **导师书面评审已回**（2026-07-07，`FSS Re-副本字段草案-v3.xlsx`，标黄 9 处+红字 2 处）→ **v3.4 已回改 6 条**；剩 **4 个问题待与俊杰当面对齐**（见 §6 首条），对齐后即可正式冻结。
- **不要擅自重开已定决策**（见 §4 冻结清单）。
- **实现期已启动（2026-07-08）**：路线图与边界见 **`docs/v2-implementation-plan.md`**（P0–P6 阶段/验收门/D1–D8 技术决策/跑偏自检清单）——**写代码前先读它**。
- 推荐读序：本文件 → `cvd-2d-process-data-standard-v2.0.md` → `字段草案-v3.xlsx` →（要背景细节再看）`metadata-v2-review-and-redesign.md` →（写代码）`../v2-implementation-plan.md`。

## 1. 系统现状
- **线上运行 = v1**（schema `cvd_v1`，68 字段）；**生产数据未迁移**。
- **v2 代码已在仓库**（2026-07-08 完成；2026-07-11 批2 起 v1 后端面已拆除）：实体三件套+锁版（Alembic `0032–0034`）、`/api/v1/v2` 全套端点、生成器（seed 已随批2 删除，余①②④⑤）、`experiments`/`entity-library` 前端、`check_r0` 命令。**门禁：后端 pytest 81 · 前端 vitest 114 · CI 四 job 全绿（本地）；commit 尚未 push**。
- 工程约定见根 `AGENTS.md`；实现路线与红线见 `docs/v2-implementation-plan.md`。

## 2. 真相三件套（+ 字段表怎么改）
1. **`field-source.yaml`** —— **字段单一权威源**（P1 起生效，实现方案 D1）：77 字段 + 46 实体字段 + 条件必填表达式 + R0 标记 + pending-alignment 标记。`字段草案-v3.xlsx` 是它的**渲染产物**（人读视图，4 个 sheet），由 `build_field_tables.py` 生成。导师批注原件在 `FSS Re-副本字段草案-v3.xlsx`（勿改，输入件）。
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
| 07-08 | **实现期启动**：v1 代码库全量摸底（4份字段拷贝/无CI/双前端等）→ 定稿 `docs/v2-implementation-plan.md`（D1单一YAML源+五路生成器 · P0–P6 阶段与验收门） | `c13dc5e` |
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
| 07-09 | **v1 单轨化决策 + v2 架构评审（5 组 Fable 探查/评审并行）**：用户确认 **v1 试运行数据可弃、不为兼容妥协** → 定案完全拆除 v1（当前仓库内、不新开项目、v2 不重写）。评审结论：v2 骨架正确无过度工程（单一源管线 A-、锁版快照正确、元数据驱动表单为真）；发现 2 个产品缺口（**v2 无 submit/lock 状态机**、`refresh_result_missing_todo` 零调用者悬空；表征记录挂不了文件）+ 管线软肋（条件表达式解析器 4 份已漂移、失败静默；DB 词表孤儿双源"改了没用"）。**完整计划落 `docs/v2-single-track-plan.md`（批0–批7，取代 P5/P6）**；P5 迁移全线作废、俊杰 3 个迁移映射问题作废 | 本次 |
| 07-11 | **单轨化计划深入复评 + 修订（5 组并行取证，逐断言 file:line 验证）**：批2"models 层零 import"**被证伪**（`normalize_module_payload`←`clone_for_run`、`ExperimentRepository` setup join、`file_asset_service` 词表校验三处红线硬依赖）+ 漏列 schemas/repositories 两层与 4 聚合器；批3 实际范围扩大（锁定守卫缺 5 条写路径、v2 零 audit、v1 行为表钉入计划）；发现**缺生产切换批**（容器启动即 `alembic upgrade`，squash 后老库部署即崩）→ **新增批8 人工门** + 红线"批8 前禁 deploy"；批6 否决"生成 TS matcher"（过度工程）改为后端 import 收敛+前端手工对齐+跨语言 fixture；批5 地基确认干净（待删表零入度 FK、裸 Uuid 列、SQLite 兼容要求）。修订版计划为准。**随后用户拍板两项**：放弃 submit 版本快照、P1.5 冻结范围排除 UI 呈现属性（均入 §4 冻结清单） | 本次 |
| 07-11 | **单轨化开工**：批0 用户豁免（确认全部为测试数据，无需备份）；**批1 完成**——删除遗留前端 `frontend/`（31.9k 行），README 9 处引用清理（含 :143/:147 "dev compose 构建旧前端"过时错话修正、回归清单 `cd ../frontend`→`frontend-next`）、AGENTS.md 去退役表述；门禁：compose config OK、残留引用仅存 untracked 历史规划稿。工作模式：**codex-first**（实现委派 Codex CLI，Claude 规格/评审/门禁，技能落 `.claude/skills/codex-first`） | 本次 |
| 07-11 | **单轨化批2完成（后端 v1 面拆除）**：删除 v1 endpoints/services/schemas/repositories/commands/models、迁移映射与 v1 生成物；四处保留路径切耦合；文件上传词表校验改读 `field-source.yaml`；samples 测试改由 v2 建炉次；样品详情最小补丁改读 v2 炉次且不再跨引 v1 experiments API；CI 生成物 job 仅保留 v2 导出与漂移检查。**pytest 77/77（含 full walkthrough）· vitest 117/117 · ruff/tsc/eslint/字段源校验全绿** | 本次 |
| 07-11 | **单轨化批3完成（v2 状态机收编）**：新增 submit/lock/unlock/invalidate/return-to-draft 五端点，R0 服务门、全转移审计、结果缺失待办接线、五条锁定写守卫、读模型时间戳/待办字段；`list_runs` schema 过滤与 count 下推、实体版本冲突转 409；前端状态徽章/动作/缺失清单/终态只读体验与双语文案。**pytest 81/81 · vitest 124/124 · ruff/tsc/eslint/字段源校验全绿** | 本次 |
| 07-11 | **单轨化批4完成（前端收编）**：删除五组 v1 feature（20,493 行）与对应路由（112 行），`experiments-v2` URL 收编为 `/experiments`、侧边栏单轨；OpenAPI 类型从当前后端全量重生成并清除 legacy 声明；`experiment-v2-form` 三重枚举收敛为 `MODULE_SPECS`，新增 12 条行为测试覆盖各模块 payload/setup-reference/失败路径。**pytest 81/81 · vitest 114/114 · tsc/eslint/字段源校验全绿；UI 手工走查待用户** | 本次 |

## 6. 下一步（两条线并行；⚠️ 2026-07-09 起 P5/P6 已由 **`docs/v2-single-track-plan.md`** 取代）

**线 A：v1 单轨化拆除（工程线，已批准待执行，详见 `docs/v2-single-track-plan.md`）**
1. 批0 备份留档（已豁免）→ 批1 删旧 `frontend/`（已完成）→ 批2 后端 v1 拆除（已完成）→ 批3 v2 状态机收编（已完成）→ 批4 前端收编（已完成；**UI 手工走查待用户**）→ **批5 Schema 重基线**（squash 34 迁移、删 v1 列/表、file_assets 预埋表征 FK）→ 批6 API 收编 `/api/v1/v2`→`/api/v1` + 管线加固（解析器收敛至下限 2 份+跨语言 fixture+护栏补齐）→ 批7 文档收尾 → **批8 生产切换（人工门，用户在场：停容器→重建库→部署→建管理员→线上冒烟）**。每批独立 commit、门禁全绿再进；**红线：批8 完成前禁止 `deploy.sh`**（中间态部署即断/崩）。
2. 后续项（不阻塞）：表征文件上传功能（FK 已预埋）；`formula.ts` 双源留注释。

**线 B：标准冻结（外部线，不受线 A 影响）**
1. **⏰ 与俊杰当面对齐（待用户）**——问题全文见 xlsx `待明确清单` #5–10：① §7『观察到的现象』粒度（折中案：一级『生长/未生长』必选＋二级细分可选）；② SEM覆盖率叫法/量化；③ 堆垛类型粒度；④ 外观描述词表。**回导师**：SEM占比=覆盖率（已改名）；必填标识已加图例+字体强化。（原第 3 项"3 个迁移语义映射确认"**已作废**——无迁移即无映射。）
2. **俊杰答案落地**：改 `field-source.yaml` → 重跑全部生成器+校验 → §7 相关 UI 补丁（≤半天）。
3. **P1.5 冻结仪式**：标准头 `DRAFT`→`FROZEN`、YAML meta.status→FROZEN → **push（Actions 首绿）** → tag `v2.0.0`。冻结范围 = 字段语义层，**不含 UI 呈现属性**（§4，2026-07-11 拍板）。

> 悬而未决小项：化学式渲染规则组内确认（待明确#1）。（原 ② submit 快照、③ UI 属性冻结时序两项已于 2026-07-11 拍板入 §4；原 `list_runs` 100 条上限项已并入线 A 批3。）

## 7. 已归档、别当真相的（在 `docs/archive/`，均带⚠️横幅）
v1 文字标准三件套、旧字段表(v1/v2)、v1 自动生成产物(`generated/`)、旧顶层设计(DESIGN/PRODUCT/v1设计/Agent brief)、汇报PPT/系统介绍/组会大纲、progress-report。**仅供追溯，不代表现状。**

## 8. 研究素材（仍有用，但不是"真相/规范"）
`元数据国际对标表.xlsx`、`别人平台的元数据字段表-NOMAD与催化.xlsx`、`材料基因工程数据标准学习笔记.docx`、`材料数据库与ELN元数据设计-五个代表性工作调研.docx`、`CVD元数据V2-会议纪要与设计原则-v1/v2.docx`。
