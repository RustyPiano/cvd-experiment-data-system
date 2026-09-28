# 现状（STATUS）

> 本仓库的单一入口：背景、当前进度、已定决策。与其他文档冲突时以本文件为准。最后更新：2026-09-28。

## 0. 速览

- **CVD 二维材料实验数据采集系统**，v2 单轨：唯一实验域 `cvd_v2`、唯一前端 `frontend-next`、唯一命名空间 `/api/v1`。单轨化计划与执行记录见 [`v2-single-track-plan.md`](../engineering/v2-single-track-plan.md)（批0–批8）。
- **香港生产**：`304c96f / v4.0-alpha.43`，Alembic `20260909_0016 (head)`。2026-07-24 切换到 v2，2026-08-07 经用户授权清空测试数据。旧 v1 库离线归档为 `cvd_v1_archive_20260724`。发布证据见 [`production-deployment-report-2026-07-24.md`](../operations/production-deployment-report-2026-07-24.md)。
- **仓库**：`742c5f0 / v4.0-alpha.48 / INTERNAL_VALIDATION`，未发布。alpha.44–48 为表征仪器配置整改：[OM](../reviews/2026-09-10-om-implementation.md)、[Raman](../reviews/2026-09-11-raman-implementation.md)、[PL](../reviews/2026-09-11-pl-implementation.md)、[SHG](../reviews/2026-09-13-shg-implementation.md)。
- **字段**：126 个实验字段（91 个进入前端/JSON 契约）、3 张一等实体表 67 个字段（55 个进入前端元数据）、26 个 R0 标记。`字段草案-v3.xlsx` 已按 alpha.48 重生成。
- **评审输入**：2026-07-07 导师书面批注（已纳入 v3.4）；2026-07-24 线上走查 M/A/F；发布后试填与终审 U-01—U-32。计划见 [`2026-07-24-meeting-remediation-plan.md`](../product/2026-07-24-meeting-remediation-plan.md)，逐项状态见 [`2026-07-24-teacher-meeting-remediation.md`](../reviews/2026-07-24-teacher-meeting-remediation.md)。
- 已定决策见 §4，不重开。工程技术决策 D1–D12 见 [`v2-implementation-plan.md`](../engineering/v2-implementation-plan.md)。
- 读序：本文件 → [`docs/README.md`](../README.md) → [`run-first-workflow-and-copy-design.md`](../product/run-first-workflow-and-copy-design.md) → [`cvd-2d-process-data-standard-v2.0.md`](cvd-2d-process-data-standard-v2.0.md) → `字段草案-v3.xlsx` → [`metadata-v2-review-and-redesign.md`](metadata-v2-review-and-redesign.md) →（写代码）根 `AGENTS.md`。

## 1. 系统现状

- **数据库**：已发布 Alembic 链 `20260711_0001`–`20260909_0016`，只新增迁移。
- **制备实验记录**：六步表单（基本信息、目标材料、装置与衬底、前驱体装载、生长条件、检查并提交）。状态 `draft → locked`，锁定时按衬底生成样品；锁工艺、结果后补。过程只保留预处理、反应条件和具名其他记录；设定温度按温区录入，实测温度绑定文件与通道；每种气体引用气瓶批次并记录多段供气。
- **目标材料**：结构形式与各区域组成、合金、掺杂、晶体结构、层数分开填写；几何形态与成膜形式分开。
- **实验装置**：装置来源必填，商业/自制/改造各显示对应身份字段；实验室编号唯一，管理员可发新版本纠错；装置图单附件预览；附加能力支持多名称。
- **衬底**：标称晶面按衬底提供常用选项并校验自定义指数；放置方式按单片姿态/多片关系拆分，倾角 α、方位角 φ 带示意图。
- **表征**：记录直接关联样品，只记观测值、原始文件和处理信息。OM/Raman/PL/SHG 使用设备目录（物镜 NA 等登记必填）、配置快照和采集预设；功率设置与样品处测值分开；文件区分 raw/processed/supporting。
- **基础资料**：仅管理员维护。页面主称呼为"制备实验记录 / 表征实验记录 / 基础资料维护"。
- **导出**：JSON 与关系型多表 CSV ZIP。
- **审查**：M-01—M-24、A-01—A-09、F-01—F-12、U-01—U-32 与制备终版均已关闭；2026-08-31 表征终审 P0/P1/P2 = 0。

## 2. 真相三件套

1. **[`field-source.yaml`](field-source.yaml)**：字段单一权威源。`字段草案-v3.xlsx`（沿用旧文件名）是其渲染产物。导师批注原件 `docs/research/FSS Re-副本字段草案-v3.xlsx` 为输入件，不改。
   - **改字段只改 YAML**，然后用 UV 运行 `build_field_tables.py` 重新生成 xlsx、`check_field_source.py` 校验（CI 强制逐格一致）。
2. **[`cvd-2d-process-data-standard-v2.0.md`](cvd-2d-process-data-standard-v2.0.md)**：人读规范（原则、五判据、数据模型、词表、结果哲学、合规）；字段明细以 YAML 为准。
3. **[`metadata-v2-review-and-redesign.md`](metadata-v2-review-and-redesign.md)**：设计依据与国际对标（NOMAD/GEMD/ESCALATE/2DCC/NeXus/CHMO）。

`cvd_v2` 是历史载荷标识；RunRevision 快照随部署版本记录字段源版本。

## 3. 背景

- 2026-06-11 组会导师系统性批评 v1 元数据设计（字段逻辑随意、缺压力/降温/几何、主观词表、无最小可复现证据、未对标其他数据库）。
- 产出 `metadata-v2-review-and-redesign.md`：逐条自查、国际对标、隐变量文献、v2 方案。
- 2026-06-24 与师兄（俊杰等）逐字段走查，收敛为 `字段草案-v3.xlsx`。
- 三轮 Fable 独立架构评审（6 → 7.5 → 8.5/10），记录 schema 可冻结。
- 论文定位：**面向气固多相 CVD 的最小可复现元数据标准**本身（字段有机理/文献依据、同行逐条评审、国际对标、失败溯源验证路径）；工程能力为次要卖点。

## 4. 已定决策（不重开）

> **2026-09-09 表征元数据首批**：恢复/补充定义明确的采集与最少处理来源信息；数字 OM 要求仪器及原始文件；实际测试人与系统录入者分开；推荐参数缺失时明确显示，不猜填默认值。处理后文件与说明性附件的分类、来源和结果文件定位进入详情/导出。图像统计、粗糙度、元素定量、通用分析面板、材料判定与强制测区继续暂缓。

> **2026-09-09 制备字段**：结构形式与各区域组成/合金/掺杂/晶体结构/层数独立填写；装置附加能力不限于场、可登记多个名称，使用记录绑定具体名称；目标几何形态与成膜形式分开；溶液体积按处理步骤记录。属内部验证实现，专业标准尚未对外冻结。

> **2026-09-04 表征复核**：新记录直接关联样品，不区分测区、不默认为整片；只记观测值、原始文件及处理信息。峰归属、物相、多型、堆垛、层数、取向和生长判定不再作为新录入项；历史判定仅作历史证据，不汇总为整片结论。

> **2026-09-04 表征最小录入**：只保留定义明确的条件与有文件依据的结果。图像覆盖率/对象尺寸/密度、AFM 粗糙度、元素定量暂不开放新录入；移除通用分析面板与统计/不确定度编辑器。`legacy_only` 只用于新表单筛选，不清理历史数据，不收窄既有 API、详情或导出；不把未记录的统计方式补为单次观测。

> **2026-07-28 深度审查**：目标采用正交 TargetSpec；前驱体核心对象为 SourceLoad；过程采用统一 Segment/Channel/Event 时间轴；目标材料与样品实际状态分离；炉次内容按不可变 RunRevision 锁定、以新修订纠错；结果链为 Sample → MeasurementRun → AnalysisRun → PropertyValue / MaterialAssertion；样品转化为显式图；PVD 不进入发布契约；数据集查询只返回当前修订及其测量证据。下列旧决定与此冲突处以此为准。

- **记录单元** = 制备实验记录（内部键 `run_code`，不改公共 API）；**样品 = 关联主键**；表征为独立记录、外键指向样品。
- **结果模型**：录入端不判成败，去掉 success/partial/failed，保留"观察到的现象"客观词表；锁定后无结果提示"结果待补"（失败即数据）。
- **坐标系全局固定**：上游负、下游正，原点固定，随装置引用冻结。
- **掺杂/合金/异质结** → `结构类型`（判别器）+ `组成明细 components[]`（权威，复合体系条件必填）；显示化学式为派生。
- **温度** = 设定 + 实测（删"估算衬底真温"）。
- **过程事件**：事件、是否终止、终止原因、具体说明和处理措施分开表达；每条事件用稳定 UUID 绑定附件。
- **一等实体**（MaterialLot / Setup / 表征仪器）= 引用 + `版本号` 锁版快照；实验只引用不重录。
- **R0 最小可复现集**（26 项，按相态、结构类型和记录类型条件化）：字段内约束由 JSON Schema 验证；Setup 快照、温区全覆盖、气瓶身份、过程总时长和跨实体条件由服务层在保存/锁定时补验。供应商晶向状态、标称粗糙度与独立平均降温速率不属于 R0；程序降温使用温度步骤。PVD 暂不纳入 v2.0 合规。
- **时序**不进 payload_json（FileAsset + 通道注册 + 派生标量）。
- **术语**：衬底≠基底、生产批号≠供应商货号、校准≠标定；实验前气体置换统一称"气氛置换"（2026-09-04）。
- **不做实验级版本快照**（2026-07-11）：实体锁版快照 + 状态流转审计已覆盖。
- **P1.5 冻结范围 = 字段语义层**（字段集合、必填与条件、词表、R0 标记；2026-07-11）；UI 呈现属性可经单一源管线继续演进。
- **锁定语义 = 锁工艺、结果后补**（2026-07-11）：locked 炉次工艺域只读，结果域（表征记录、实测产物、表征附件）可写；"结果待补"随结果写入自动消除；invalid 炉次拒绝一切写入。
- **炉次优先产品重构**（2026-07-16）：炉次为默认入口；状态 draft→locked；衬底自动生成样品；结果一次录入、底层分表；全组成员可为 locked 炉次补结果；基础资料就地新增；PVD 不开放；提供筛选、审计时间线和 JSON/多表 CSV 导出。词表值以 ASCII code 存储、中英文本地化显示，旧中文仅作写入兼容别名（2026-07-22）。
- **实验人 = 炉次创建者**（2026-07-22）：新建时自动填入当前登录账号，不可修改；后端创建与更新均强制回写 owner 姓名。

## 5. 进展日志

细节见各链接文档与 git 历史。

| 日期 | 事项 |
| --- | --- |
| 06-11 — 07-08 | 导师批评 → v2 重构；字段表 v3、文字标准 v2.0；三轮 Fable 评审；导师书面批注 → v3.4 |
| 07-08 | 实现期 P0–P5：字段单一源、v2 数据库、API 与校验、生成式前端表单、迁移工具；代码精简批1/2（[评审](../reviews/2026-07-08-simplify-review.md)） |
| 07-09 — 07-12 | v2 单轨化批0–7 与收尾批 F1–F9：拆除 v1、Schema 重基线、锁定语义甲、表征证据链、全库深审 |
| 07-16 — 07-17 | 炉次优先产品重构阶段 0–4 与全库复核（[E2E 报告](../operations/e2e-run-first-report-2026-07-17.md)） |
| 07-22 — 07-24 | 录入契约收紧；[全库审查整改](../reviews/2026-07-24-comprehensive-audit-remediation.md)；批8 切换香港生产（`4e0b65a`）；导师线上走查 M/A/F 整改并发布 |
| 07-25 — 07-28 | U-01—U-32 复核；[制备模块终版](../product/2026-07-27-preparation-module-finalization-plan.md)；目标产物 v3.13、装置 v3.14–v3.17、前驱体 v3.18 发布 |
| 07-28 — 07-30 | [v4 深度审查整改](../reviews/2026-07-28-deep-audit-remediation.md)：TargetSpec、SourceLoad、RunRevision、科学结果链；产品简化 v1 |
| 08-01 — 08-13 | 物料、前驱体、衬底、生长条件语义收口；alpha.15 发布并清空测试数据；师兄试填反馈 G-01—G-05；气瓶组成模型 |
| 08-29 — 09-02 | G-01—G-05 发布（`86e4167`, alpha.18）；表征审计发布（`ec8b7b4`, alpha.19）；表单体验优化发布（alpha.23、alpha.25） |
| 09-03 — 09-04 | 目标材料分类、装置/衬底、前驱体装载、气体程序收口；表征客观测量与最小录入（alpha.36–40），随 alpha.40 发布 |
| 09-09 | [制备字段复核](../reviews/2026-09-09-preparation-field-review.md)与实施（alpha.41 发布，`0736d2f`/`9d00ba7`）；晶面与抛光拆分（alpha.42）；[表征元数据审查](../reviews/2026-09-09-characterization-metadata-audit.md)与[首批实施](../reviews/2026-09-09-characterization-metadata-implementation.md)（alpha.43） |
| 09-10 | alpha.43 发布（`304c96f`）；仪器配置预设（alpha.44）；[前端设计复核](../reviews/2026-09-10-frontend-design-audit-verification.md)与[修复](../engineering/2026-09-10-frontend-design-remediation-plan.md)；[OM 复核](../reviews/2026-09-10-om-field-review.md)与整改（alpha.45） |
| 09-10 — 09-11 | [Raman 复核](../reviews/2026-09-10-raman-field-review.md)与整改（alpha.46）；[PL 复核](../reviews/2026-09-11-pl-field-review.md)与整改（alpha.47）；[AFM 复核](../reviews/2026-09-11-afm-field-review.md)；衬底处理文案"紫外/臭氧表面处理" |
| 09-13 | [SHG 复核](../reviews/2026-09-11-shg-field-review.md)与整改（alpha.48，提交 `742c5f0`） |
| 09-20 | 清理未使用的本地工具、技能和脚手架文件（`ac4a25b`） |
| 09-21 | [字段名称与分类体系审核](../reviews/2026-09-21-field-terminology-taxonomy-review.md)：30 项问题 + 4 项文字建议 |
| 09-28 | 文档精简；删除 deploy.sh 批8切换逻辑与结构指纹检查、重复的 `create_admin`、前端脚手架文件和 CI 本地工具检查 |
| 09-28 | 删除死代码：旧一代制备表单编辑器、旧结果接口与 `V2ResultsService`、无调用方的后端私有方法和前端辅助函数 |

## 6. 已归档

`docs/archive/`：v1 文字标准、旧字段表、v1 生成产物、旧顶层设计、汇报材料、progress-report。仅供追溯。

## 7. 研究素材

`docs/research/`：导师批注原件、国际对标表、会议纪要、材料数据标准调研。
