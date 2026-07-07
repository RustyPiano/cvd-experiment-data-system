# CVD v2 系统重构·实现方案（防跑偏基准）

> **状态：ACTIVE（实现期路线图）** | 制定：2026-07-08 | 依据：`docs/standard/STATUS.md`（现状）+ 2026-07-08 v1 代码库全量摸底
>
> **本文角色**：实现阶段的**唯一路线图与边界文件**。STATUS 回答"现在在哪"，本文回答"怎么走、什么不能碰"。字段级真相永远在字段字典（现 `字段草案-v3.xlsx`，P1 后为 YAML 单一源），本文不复制字段内容。
> 每个开发 session 开始：先读 STATUS，再按本文 §6 自检清单核对本次改动是否在轨。

## 0. 一句话目标

把已经三轮评审 + 导师书面评审的元数据标准 v2.0（77 字段 + 3 一等实体 + R0 最小可复现集）落成运行系统 `cvd_v2` 并替换 `cvd_v1`；核心手段 = **字段单一源 + 生成器**，让"标准改动"永远是**数据改动**而非代码手术。

## 1. 范围与非目标

**范围内**：字段 YAML 单一源与五路生成器；一等实体关系表 + 锁版快照；`cvd_v2` 记录 schema 与校验；R0 合规报告；v2 表单；v1→v2 数据迁移与并行验证；CI 门禁。

**明确的非目标（做了就是跑偏）**：
- ❌ 重写后端框架 / 更换技术栈（FastAPI·SQLAlchemy·Postgres·React·shadcn 全部保留）
- ❌ 新业务功能（导出/导入/审计/版本/克隆只做 v2 适配，不加能力）
- ❌ 重开 STATUS §4 冻结决策（记录单元、结果模型、坐标系、components、锁版……）
- ❌ 维护旧前端 `frontend/`（只归档删除，移植测试思路）
- ❌ 本轮完整实现时序通道注册（FileAsset 现状够用，仅预留字段）与 PVD 合规（占位）

## 2. 基线事实（2026-07-08 摸底，详情见当日会话记录）

- 后端 ~27.5k LOC，分层干净（models/schemas/repositories/services/endpoints），286 个测试，**值得整体继承**。数据模型 = 头表 `experiment_runs` + 每模块一行 JSONB（`experiment_module_payloads`，`schema_version='cvd_v1'`）+ 字段字典表 `experiment_field_definitions`。
- **核心病灶：字段定义存在 4 份手工拷贝**——①字典表种子（散在 31 个 migration）②Pydantic `MODULE_PAYLOAD_MODELS` ③`normalize_module_payload()` ~190 行默认值 ④前端 `editor-types.ts`（~2000 行）+ 手写表单区块。①②有一致性测试，**④无任何防漂移手段**。
- 无 CI（无 `.github/`）；frontend-next eslint 配置缺失；`docs/standard/generated/` 已被移走导致 `test_t5_5` 回归测试断裂。
- 双前端并存：部署链只用 `frontend-next`（4 个测试文件）；旧 `frontend/`（38 个测试文件）已脱离部署。
- 成熟子系统（继承不重写）：导出（JSON/分析平表/多 sheet Excel）、导入 profile（`cvd_process_package_v1`）、FileAsset（sha256/软删除/按 run 目录存储）、审计/版本/`derived_from_run_id` 血缘、`ExperimentSetupSnapshot` 快照模式。

## 3. 核心技术决策（D1–D8，改动任何一条须在本文记录理由）

| # | 决策 | 关键点 | 防跑偏红线 |
|---|---|---|---|
| D1 | **字段单一源** `docs/standard/field-source.yaml` | 字段/模块/类型/单位/词表/必填级别+条件表达式/R0标记/状态(`frozen`·`pending-alignment`)。生成五路产物：①Pydantic 校验模型 ②JSON Schema ③字段字典种子数据 ④xlsx（`build_field_tables.py` 改造为读 YAML）⑤前端字段元数据 TS 模块 | 字段/词表改动**只准改 YAML**；手改生成物一律打回；生成器输出必须可重现（regen-drift 测试 diff=空） |
| D2 | **数据模型** | 一等实体 = `entity` + 不可变 `entity_version` 行，实验引用 `(entity_id, version)` + 落快照 JSON（沿用 v1 snapshot 模式）；实验记录 = 头表 + 每模块 JSONB（`schema_version='cvd_v2'`）；表征+实测产物 = **独立表** FK→样品；过程步/过程事件留 JSONB，按『阶段类型』discriminated union 校验 | 不把过程步拆关系表（阶段结构多变，得不偿失）；不动"炉次=记录单元、样品=关联主键"冻结决策 |
| D3 | **条件规则 = 数据** | 条件必填（相态≠气 / 结构类型≠本征 / Setup有外场 / 降温段 / 仅SiO₂/Si / PVD）与 R0 写成受限条件表达式，后端校验器与前端显隐**都从它生成**；提供 `check-r0` 命令对任意记录输出合规报告（论文"R0 可被 schema 证明"的实证） | 禁止在代码里散写字段级 if；新增条件类型必须先进 YAML 的表达式语法 |
| D4 | **种子出 migration** | Alembic 只管表结构；词表/字段字典种子 = 幂等 seed 命令读 YAML。v1 的 31 个 migration 原样保留（历史） | 新 migration 里不准再嵌种子数据 |
| D5 | **迁移策略** | v1→v2 逐字段 mapping（68 字段去向，含 `quality_label`/`failure_modes`/`color_change` 落点）本身是 YAML 的一部分；迁移命令带 dry-run + 差异报告；v1 原始 payload 原样存档不销毁；新旧并行核对后切换；文件卷与 `file_assets` 行一起迁 | 不做破坏性原地改写；mapping 没写完不准跑正式迁移 |
| D6 | **前端** | 只保留 `frontend-next`；模块区块**手写**，但 label/单位/选项/必填显隐从生成的字段元数据模块取（替代手维护 `editor-types.ts` 的字段清单部分）；加"前端字段键 ⊆ schema"漂移测试 | 不引入表单自动生成框架；§7 相关 UI 排在 P1.5 冻结之后 |
| D7 | **CI 门禁** | GitHub Actions：backend（ruff + pytest）、frontend（tsc + eslint + vitest）、regen-drift（重跑生成器 git diff 必须为空）。先修 eslint 配置与断裂的 `test_t5_5` | CI 红不准进下一阶段；不准 skip 测试换进度 |
| D8 | **兼容承诺** | 三种导出形状与导入 profile 在 v2 给出等价版本；消费端字段改名须出对照说明 | 悄悄改导出列名/结构 = 跑偏 |
| D9 | **v1/v2 表复用策略** | v2 **复用** `experiment_runs`/`experiment_module_payloads`/`samples` 等 v1 表（`schema_version='cvd_v2'` 区分行），继承审计/版本/文件外键机制；实体三件套与 §7 两张表为**新表**。"不碰 v1 表"精确化为：**只允许加可空列和新表，禁止改语义、删列、改 v1 行为** | 另起一套平行实验表 = 跑偏；给 v1 列改语义 = 跑偏 |
| D10 | **机器字段键 = 契约** | 每字段带 `key`（snake_case + 单位后缀，沿 v1 风格 `_C/_mm/_sccm`…），是 API/payload/生成代码的对接键；**冻结后改 key 视同改字段**，走 §5 流程；v1→v2 对应**不靠同名**，统一落 P5 mapping YAML | 代码里出现 YAML 之外的字段名 = 跑偏；改 key 不登记 = 跑偏 |
| D11 | **动态表单映射与词表存储** | §5"阶段类型→参数组"映射 = YAML `stage_types` 节（数据非代码），P3 union 与 P4 显隐都从它生成；v2 词表**复用 `ControlledVocabulary` 表**由 YAML 种子写入，**不用 DB enum** | 在代码里散写"某阶段显示某字段" = 跑偏；新建 DB enum = 跑偏 |

## 4. 阶段计划与验收门（P0→P6 顺序执行，门不绿不进下一阶段）

| 阶段 | 内容 | 主要产出 | 验收门 | 粗估* |
|---|---|---|---|---|
| **P0 工程底线** | CI 工作流；修 eslint 配置；修 `generated/` 断测（重定目录并重新生成） | `.github/workflows/*`；绿的全量测试 | CI 全绿跑通一次 | ~1 天 |
| **P1 单一源+生成器** | `field-source.yaml`（含 77 字段 + 3 实体 + 条件表达式 + R0；4 个待对齐字段标 `pending-alignment`）；五路生成器；regen-drift 测试 | YAML + 生成器 + 测试 | 由 YAML 重生成的 xlsx 与 v3.4 现版**字段级 diff = 空**；drift 测试进 CI | 2–4 天 |
| **P1.5 对齐+冻结**（外部事件） | 俊杰 4 问落 YAML；回复导师 2 点；标准头 `DRAFT`→`FROZEN`；**push + 云端 CI 首绿**；打 `v2.0.0` tag | 冻结的标准 | 待明确清单 #5–9 关闭 + Actions 全绿 + tag 存在 | 等对齐 |
| **P2 v2 数据库** | 实体表 + 版本表 + 快照；`cvd_v2` 结构 migration；seed 命令 | Alembic 结构迁移 + seed | 空库 `migrate + seed` 一键起；模型测试绿 | 3–5 天 |
| **P3 API+校验** | v2 Pydantic（生成/校验）；实体库与实验 v2 endpoints；`check-r0` 合规命令 | API + 合规报告 | 契约测试绿；样例记录 R0 报告正确（含条件必填用例） | 3–5 天 |
| **P4 前端表单** | 实体库管理页；v2 表单区块（**§7 最后做**）；字段键漂移测试 | v2 录入界面 | 漂移测试进 CI；主流程 e2e 手工过一遍 | 5–8 天 |
| **P5 数据迁移** | **⚠️ 生产库+文件卷备份（硬性前置）**；mapping YAML；迁移命令 dry-run→报告→执行；并行验证（v1/v2 导出对账） | 迁移工具 + 对账报告 | 备份可恢复；全量 dry-run 无未映射字段；抽样对账 100% 一致 | 2–4 天 |
| **P6 切换** | 切 `cvd_v2`；旧表单下线；`frontend/` 归档删除；STATUS/AGENTS 更新 | 上线 | v2 录入一条真实炉次全流程走通 | ~1 天 |

\* 粗估为"专注工作日"，允许穿插；**顺序不允许跳**（P4 的 §7 部分依赖 P1.5）。
**预授权例外**：若 P1.5 因日程拖延超过 2 天，P2 可先行开工——实体表与记录结构均为已冻结决策，不受对齐结果影响；但 §7 相关实现与冻结仪式（FROZEN/tag）仍必须等 P1.5。

## 4b. 阶段工作分解与验收清单（2026-07-08 定稿）

### P1.5 对齐+冻结（外部事件，约半天）
1. 俊杰 4 问答案落 `field-source.yaml`（#5 观察现象词表/层级 · #6 SEM覆盖率叫法 · #7 堆垛下拉或文本 · #8 外观词表）→ 重跑渲染 + 校验
2. 回导师两点（SEM覆盖率定义；必填标识方案）；待明确清单 #5–9 状态置"已定"
3. `cvd-2d-process-data-standard-v2.0.md` 头 `DRAFT→FROZEN`；`field-source.yaml` meta.status → `FROZEN`
4. **push origin/main → 确认 Actions 四 job 云端首绿**；打 `v2.0.0` tag；STATUS 标记冻结
- ✅ 验收：待明确 #5–9 关闭 · 云端 CI 全绿 · tag 存在

### P2 v2 数据库（3–5 天）
1. 实体三件套：`material_lots` / `setups` / `instruments` + 各自 `*_versions` 表（**版本行不可变**，`(entity_id, version)` 唯一，修改=插入新版本）；注册必填字段用类型列、其余进 attrs JSONB（默认取向，改动登记）
2. 实验侧引用：`(entity_id, version)` 外键 + 引用时刻快照 JSON（沿用 v1 `ExperimentSetupSnapshot` 模式）
3. `cvd_v2` 模块键锚定（默认命名，微调需登记）：`basic_info / target_product / equipment / precursors / substrates / process_steps / process_events / pvd`；§7 → `characterization_records` + `measured_products` 独立表，FK→`samples`
4. "结果缺失"合规支撑：run 终态派生状态位（机制 P2 定，语义按标准 §7/§10）
5. **生成器③**：`app/commands/seed_from_field_source.py`（读 YAML 幂等写字段字典/词表）
6. Alembic 结构 migration（按 D9：新表 + 仅加可空列、语义不变；不嵌种子）
- ✅ 验收：空库 `migrate + seed` 一键起 · seed 跑两遍幂等 · 模型/迁移测试绿

### P3 API + 校验（3–5 天）
1. **生成器①**：由 YAML 生成 v2 Pydantic（模块模型 + 阶段类型 discriminated union + 条件必填 validator 直接消费 YAML 表达式）；生成物入库 + regen-drift 测试
2. **生成器②**：v2 JSON Schema 导出（spec_export v2 版）
3. 实体库 CRUD + 版本锁定 + 引用快照端点；实验 v2 端点（run / payload / 样品 / 表征）
4. **`check-r0` 合规命令**：任意 run 输出 R0 报告（条件必填按表达式判定；PVD 排除）——论文实证物
5. 词表结构化（options 拆受控列表，此时才动 YAML 结构）；化学式/异质结显示串渲染规则=纯函数+测试（关闭待明确 #1）
- ✅ 验收：契约测试绿 · 样例 run 的 R0 报告含全部条件必填用例 · OpenAPI 可 `gen:api`

### P4 前端表单（5–8 天，最大块）
1. **生成器⑤**：TS 字段元数据模块（label/单位/选项/必填/条件显隐）+ "前端字段键 ⊆ schema"漂移测试进 CI
2. 实体库管理页 ×3（含版本历史与"改动即新版本"交互）
3. v2 录入表单 §1–§6：复刻 v1 furnace/gas 区块模式；条件显隐 + **必填红星**（导师B93）；components[] 编辑器；化学式输入（文本+元素校验，关闭待明确 #2）
4. §7 区块**最后做**（表征引用仪器 + 实测产物 + 对齐后的观察现象词表）
5. `gen:api` 重新生成 openapi 类型
- ✅ 验收：漂移测试绿 · 一条完整炉次（条件字段/复合体系/事件/表征全覆盖）手工录入全流程走通

### P5 数据迁移（2–4 天）
0. **⚠️ 硬性前置门：生产库 `pg_dump` + 文件卷备份，并实际验证可恢复**；写明回滚预案
1. mapping YAML：68 字段逐字段去向——重点三个落点 `quality_label` / `failure_modes` / `color_change` →（§7 客观词表/过程事件）映射表；v1 自由文本 Setup → 实体重建人工辅助映射（映射不完的挂"待人工确认"）
2. `migrate_v1_to_v2` 命令：dry-run 全量报告（**未映射字段=0 才许执行**）→ 执行；v1 payload 原样存档
3. `file_assets` + 存储卷迁移；导出 v2 适配 + v1/v2 导出对账（抽样 100% 一致）；导入 profile 适配（D8）
- ✅ 验收：备份可恢复 · dry-run 零未映射 · 对账 100% · 回滚预案在案

### P6 切换（约 1 天）
1. 前端默认 v2 表单，v1 数据只读可查；compose / prod 配置更新
2. 删除旧 `frontend/`（git 历史保留）
3. STATUS / AGENTS 回写；应用侧 release tag
- ✅ 验收：真实录入一条新炉次全流程走通 · 旧数据可读可导出

### 目标节奏（周历，按实际可顺延，顺序不变）
| 周 | 目标 |
|---|---|
| 本周（≤07-11） | P1.5 + P2 |
| 07-13 ~ 07-17 | P3 完成 + P4 开工 |
| 07-20 ~ 07-24 | P4 完成 + P5（含备份+dry-run） |
| 07-27 ~ 07-31 | P6 切换 + 缓冲 + 论文侧 R0 报告示例 |

## 5. 冻结纪律与变更流程（P1.5 之后生效）

1. 任何字段/词表/条件规则改动：**改 YAML → 重跑生成器 → CHG 变更记录自动带出**。
2. 若改动触碰 STATUS §4 冻结决策或 R0 集合：先停手，**须导师/组会确认**后才落 YAML。
3. 生成物（xlsx、schema.json、字典种子、TS 元数据）一律不手改。
4. 每轮改动回写 STATUS 进展日志（AGENTS.md 约定）。

## 6. 跑偏自检清单（每个开发 session 开始时过一遍）

- [ ] 我在哪个阶段？本次改动在该阶段"主要产出"清单内吗？
- [ ] 是否触碰 §1 非目标或 STATUS §4 冻结决策？→ 是则停，走 §5 变更流程
- [ ] 字段/词表/条件规则改动走的是 YAML 吗？
- [ ] P1.5 冻结前有没有动 §7 表单 UI？
- [ ] 有没有引入新框架/大依赖？→ 默认禁止，需在本文 §3 记录决策
- [ ] 上一阶段验收门是绿的吗？CI 是绿的吗？
- [ ] 收尾时：STATUS 回写了吗？

## 7. 决策变更记录（按 §3 要求，改 D1–D8 须在此登记）

- **2026-07-08 · D1 五路生成器分期落地**：P1 实际交付 = `field-source.yaml`（含条件表达式/R0/pending 标记）+ ④xlsx 渲染器（`build_field_tables.py` 改造完成）+ 逐格一致性校验（`check_field_source.py`，进 CI）。①Pydantic、②JSON Schema、③字典种子、⑤前端 TS 元数据的生成器**推迟到各自消费阶段**（③→P2、①②→P3、⑤→P4）落地——先于消费者产出的生成模板必然返工。词表结构化（options 拆受控列表）同步推迟到 P3 与 Pydantic 词表校验联动。D1 红线不变：字段改动只走 YAML。
- **2026-07-08 · 四个架构空白补定（D9–D11，用户委托"按最优方案定"）**：① D9 表复用策略（复用 v1 头表/payload/samples，additive-only 规则）；② D10 机器字段键——`field-source.yaml` 全部 123 字段已补 `key`（77 实验 + 46 实体，v1 命名风格），`check_field_source.py` 强制"必有/合法/域内唯一"；③ D11 `stage_types` 节落 YAML（11 个阶段类型 × 6 参数组的显隐映射 + `required_extra`，护栏校验自洽性），初版由标准 §5 语义推导、实操不符时改 YAML 即可；④ D11 词表存储=复用 `ControlledVocabulary`、无 DB enum。
- **2026-07-08 · 计划定稿 v1.1（P1 完成后全盘细化）**：新增 §4b 阶段工作分解与验收清单；P1.5 验收门补 **push + 云端 CI 首绿**；P5 补**硬性备份前置门**（生产库 pg_dump + 文件卷 + 恢复演练 + 回滚预案）；锚定 P2 默认命名（实体三件套 `*_versions` 不可变版本行、`cvd_v2` 八个模块键、§7 两张独立表）与三条命令名（`seed_from_field_source` / `check-r0` / `migrate_v1_to_v2`）；新增**预授权例外**（P1.5 拖延 >2 天时 P2 可先行，§7 与冻结仪式除外）；附目标周历（4 周，可顺延不可乱序）。

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 俊杰对齐结果超出叶子级（如观察现象改两级结构） | YAML 词表设计预留层级表达；最坏改生成器模板，不伤 D2 数据模型 |
| 阶段类型驱动的动态表单复杂 | 沿用 v1 现成 furnace/gas 区块模式复刻，不造新轮子 |
| v1 自由文本 Setup 无法自动结构化 | 人工辅助映射表进 P5，不阻塞 P2–P4；映射不完的挂"待人工确认"标记 |
| 单人推进容易欠账 | 每阶段验收门硬性；宁可砍范围（见 §1 非目标）不欠测试 |
| 导出/导入消费端悄悄破坏 | D8 兼容承诺 + 导出对账进 P5 验收门 |
