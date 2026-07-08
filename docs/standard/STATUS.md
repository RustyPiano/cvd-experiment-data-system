# 现状与真相指针（STATUS）— 任何新 session / Agent 先读我

> 本文件是本仓库的**单一入口**：读完它 = 拿到全部背景 + 当前进度 + 下一步，**无需向用户重复交代**。
> 任何文档与本文件冲突，**以本文件为准**。最后更新：2026-07-08。

## 0. 一分钟速览（给接手的 Agent）
- 这是一个 **CVD 二维材料实验数据采集系统**。
- **线上系统 = v1**（`cvd_v1` / 68 字段，在跑）。**v2/v3 是元数据重构的设计，尚未落代码**。
- 当前工作聚焦在**元数据标准 / 字段的重构设计**（不是写业务功能、不是改 v1 代码）。
- 两份交付物已 **freeze-ready**（经 **3 轮独立评审**，最终 8.5/10）：
  - 字段表 `字段草案-v3.xlsx`（**v3.4**，77 字段 + 3 张一等实体表）——生成脚本 `build_field_tables.py`
  - 文字标准 `cvd-2d-process-data-standard-v2.0.md`
- **导师书面评审已回**（2026-07-07，`FSS Re-副本字段草案-v3.xlsx`，标黄 9 处+红字 2 处）→ **v3.4 已回改 6 条**；剩 **4 个问题待与俊杰当面对齐**（见 §6 首条），对齐后即可正式冻结。
- **不要擅自重开已定决策**（见 §4 冻结清单）。
- **实现期已启动（2026-07-08）**：路线图与边界见 **`docs/v2-implementation-plan.md`**（P0–P6 阶段/验收门/D1–D8 技术决策/跑偏自检清单）——**写代码前先读它**。
- 推荐读序：本文件 → `cvd-2d-process-data-standard-v2.0.md` → `字段草案-v3.xlsx` →（要背景细节再看）`metadata-v2-review-and-redesign.md` →（写代码）`../v2-implementation-plan.md`。

## 1. 系统现状
- **运行中的系统 = v1**（schema `cvd_v1`，68 字段）。后端（FastAPI + SQLAlchemy + Alembic + PostgreSQL）与数据库**仍是 v1**，尚未按 v2/v3 改动。
- v2/v3 是**设计阶段**产物。看到任何"v2/v3 字段"时，默认它 = 设计稿，不是线上现状。
- 工程约定（工具链 UV/Bun、开发流程、测试门禁）见根 `AGENTS.md`。

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
| 07-08 | **D10 命名标准化二轮 + D12 国际化**：key 全词化 5 处、命名规则入 YAML meta；**123 字段全量补 `label_en`**（护栏强制）；D12 分层策略入方案（词表英文@P3 · i18next@P4 · 英文UI打磨不阻塞 v2.0）；P6 增 v1 退役清理择机项 | 本次 |
| 07-08 | **P2 完成（v2 数据库，按预授权先行；Codex xhigh 初稿 + Fable 验收）**：新增实体三件套 `material_lots`/`setups`/`instruments` + 不可变 `*_versions` 表（(entity_id,version) 唯一，required 字段=类型列+attrs JSONB）；`experiment_runs` 仅加 4 个可空列（setup_ref/版本/快照/结果缺失位，D9 合规）；新增 `characterization_records`/`measured_products`（FK→samples）；`seed_from_field_source.py` 幂等（验收修正：二遍 +0/~0/-0）写 cvd_v2 字段字典 123 条+词表 189 条；Alembic `20260708_0032` 续链、SQLite 空库 migrate+seed 一键起；**pytest 300/300 · ruff/format 全绿** | 本次 |
| 07-08 | **P3 后端完成（API+校验）**：新增生成器① `generate_v2_models.py` 生成 `schemas/generated/v2_module_payload.py`（stage_types 判别 union + 记录内条件 validator，Setup 外场跨实体条件留服务层）；生成器② `export_v2_schema.py` 输出 `cvd-2d-process-v2.schema.json` + `cvd-2d-field-dictionary-v2.json` 并进 generated-artifacts CI；新增 `/api/v1/v2` 实体库/实验/模块/表征/实测产物端点，run 级 `schema_version` 可空列 additive-only；新增 `check_r0.py`（PVD 排除）与化学式显示串默认规则纯函数（待明确#1）；**pytest 309/309 · ruff/format 全绿**。未改 `field-source.yaml` / xlsx；词表英文结构化待 P1.5 对齐后走 YAML 补丁 | 本次 |
| 07-08 | **P5 工具建设批次 + 硬化完成（未执行正式迁移）**：新增 `docs/standard/v1-to-v2-mapping.yaml` 覆盖 v1 68 字段（52 已映射 / 12 丢弃 / 3 待用户确认 / 1 需人工映射；`quality_label`/`failure_modes`/`color_change` 均保持待确认，`furnace_info` 纳入人工 Setup 重建）；新增 archive 表 `experiment_module_payloads_v1_archive`（Alembic `20260708_0034`，additive-only）；新增 `migrate_v1_to_v2` 命令（dry-run 默认、文本/JSON、`--execute`+`--i-have-backup` 双闸、先归档后覆盖、同事务、对账模式）；实体版本创建服务层改为基于 `field-source.yaml` 汇总返回全部缺失必填/条件必填字段；新增映射一致性/命令/硬化测试。**ruff/format 全绿 · pytest 319/319 · SQLite 空库 migrate+seed 二遍通过 · 仅 dry-run/安全闸验证，未跑正式写库迁移** | 本次 |

## 6. 下一步 / 开放项
0. **⏰ 最近待办（2026-07-08 当面问，问题全文见 xlsx `待明确清单` #5–10）**：
   - **问俊杰**：① §7『观察到的现象』粒度——7项多选 vs 只记生长/不生长（导师K75点名；可带折中案：一级『生长/未生长』必选＋二级细分可选）；② SEM覆盖率组里习惯叫法/量化方式；③ 堆垛类型可判粒度（2H/3R/AA/AB/扭转角→定文本还是下拉）；④ 前驱体『外观描述』词表（常见形态+潮解后外观）。
   - **回导师**：SEM占比=SEM视场内材料面积覆盖占比（已改名给定义）；必填/选填标识已加图例+字体强化，表单UI将用红星。
1. **正式冻结**：标准头 `DRAFT`→`FROZEN` + STATUS 标记 + 打 `v2.0.0` git tag —— 导师书面评审已回改（v3.4），**与俊杰对齐上述 4 问后即可落锤**（=实现方案 P1.5）。
1b. **实现推进**：按 `docs/v2-implementation-plan.md` 顺序执行；**P0、P1、P2 已完成（07-08；P2 按实现方案预授权例外先行）**；**P3 后端 API+校验已完成（未动待对齐 YAML 词表结构）**；**P1.5 对齐+冻结**仍待外部当面对齐（即上面第 0/1 条，§7 词表与冻结仪式等对齐后落锤）；下一工程阶段为 **P4 前端表单**，但 §7 词表最终口径仍须等 P1.5。
2. **v1 → v2 逐字段迁移映射**：工具批次已出初稿并进测试（68/68 覆盖，未映射=0）；`quality_label`/`failure_modes`/`color_change` 仍为科学判断，标 `待用户确认`；`furnace_info` 标 `需人工映射`，需人工重建 Setup。
3. **词表归一到单一源**（YAML/CSV，xlsx 反向生成）；化学式/异质结**渲染规则**已落后端默认纯函数，仍待组内确认（待明确#1）。
4. **v1 自由文本 Setup → 结构化重建策略**；化学式录入 UI（文本+元素校验）。
5. 最终：**实现 cvd_v1 → cvd_v2**（迁移 + Pydantic/API + 前端表单 + 一致性/regen-drift 测试）。
> 详见 xlsx `待明确清单` sheet 与标准 §11。

## 7. 已归档、别当真相的（在 `docs/archive/`，均带⚠️横幅）
v1 文字标准三件套、旧字段表(v1/v2)、v1 自动生成产物(`generated/`)、旧顶层设计(DESIGN/PRODUCT/v1设计/Agent brief)、汇报PPT/系统介绍/组会大纲、progress-report。**仅供追溯，不代表现状。**

## 8. 研究素材（仍有用，但不是"真相/规范"）
`元数据国际对标表.xlsx`、`别人平台的元数据字段表-NOMAD与催化.xlsx`、`材料基因工程数据标准学习笔记.docx`、`材料数据库与ELN元数据设计-五个代表性工作调研.docx`、`CVD元数据V2-会议纪要与设计原则-v1/v2.docx`。
