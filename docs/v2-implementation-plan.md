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

## 4. 阶段计划与验收门（P0→P6 顺序执行，门不绿不进下一阶段）

| 阶段 | 内容 | 主要产出 | 验收门 | 粗估* |
|---|---|---|---|---|
| **P0 工程底线** | CI 工作流；修 eslint 配置；修 `generated/` 断测（重定目录并重新生成） | `.github/workflows/*`；绿的全量测试 | CI 全绿跑通一次 | ~1 天 |
| **P1 单一源+生成器** | `field-source.yaml`（含 77 字段 + 3 实体 + 条件表达式 + R0；4 个待对齐字段标 `pending-alignment`）；五路生成器；regen-drift 测试 | YAML + 生成器 + 测试 | 由 YAML 重生成的 xlsx 与 v3.4 现版**字段级 diff = 空**；drift 测试进 CI | 2–4 天 |
| **P1.5 对齐+冻结**（外部事件） | 俊杰 4 问落 YAML；回复导师 2 点；标准头 `DRAFT`→`FROZEN`；打 `v2.0.0` tag | 冻结的标准 | 待明确清单 #5–9 全部关闭 | 等对齐 |
| **P2 v2 数据库** | 实体表 + 版本表 + 快照；`cvd_v2` 结构 migration；seed 命令 | Alembic 结构迁移 + seed | 空库 `migrate + seed` 一键起；模型测试绿 | 3–5 天 |
| **P3 API+校验** | v2 Pydantic（生成/校验）；实体库与实验 v2 endpoints；`check-r0` 合规命令 | API + 合规报告 | 契约测试绿；样例记录 R0 报告正确（含条件必填用例） | 3–5 天 |
| **P4 前端表单** | 实体库管理页；v2 表单区块（**§7 最后做**）；字段键漂移测试 | v2 录入界面 | 漂移测试进 CI；主流程 e2e 手工过一遍 | 5–8 天 |
| **P5 数据迁移** | mapping YAML；迁移命令 dry-run→报告→执行；并行验证（v1/v2 导出对账） | 迁移工具 + 对账报告 | 全量 dry-run 无未映射字段；抽样对账 100% 一致 | 2–4 天 |
| **P6 切换** | 切 `cvd_v2`；旧表单下线；`frontend/` 归档删除；STATUS/AGENTS 更新 | 上线 | v2 录入一条真实炉次全流程走通 | ~1 天 |

\* 粗估为"专注工作日"，允许穿插；**顺序不允许跳**（P4 的 §7 部分依赖 P1.5）。

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

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 俊杰对齐结果超出叶子级（如观察现象改两级结构） | YAML 词表设计预留层级表达；最坏改生成器模板，不伤 D2 数据模型 |
| 阶段类型驱动的动态表单复杂 | 沿用 v1 现成 furnace/gas 区块模式复刻，不造新轮子 |
| v1 自由文本 Setup 无法自动结构化 | 人工辅助映射表进 P5，不阻塞 P2–P4；映射不完的挂"待人工确认"标记 |
| 单人推进容易欠账 | 每阶段验收门硬性；宁可砍范围（见 §1 非目标）不欠测试 |
| 导出/导入消费端悄悄破坏 | D8 兼容承诺 + 导出对账进 P5 验收门 |
