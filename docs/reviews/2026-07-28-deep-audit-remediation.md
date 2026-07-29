# 2026-07-28 深度审查整改记录

状态：`v4.0-alpha.2 / INTERNAL_VALIDATION`。`db208e3` 二次复核提出的 B1—B8 已在后续本地工作树完成代码收口，等待外部 Agent 复验；不得合并或发布生产。

本记录对应 `cvd_experiment_data_system_deep_audit_2026-07-28.md`。用户已确认：先完成代码最优版；G1—G12 案例和真实实验数据后续由俊杰、博研等实际实验人补充；无需兼容当前测试数据。

## P0 收口

| 审查项 | 代码落地 | 验收入口 |
|---|---|---|
| P0-1 目标产物不正交 | `TargetSpec`、`TargetMaterialRegion`、`TargetCompositionRelation` 分离架构、空间区域和组成关系 | `target_product` 科学 payload；锁定后投影到不可变修订 |
| P0-2 目标与实际混淆 | Run 只保存 target；Sample 保存 `actual_state` / `actual_material_summary`，实际结论只由测量声明聚合 | 样品列表、详情、JSON/CSV 导出均并列展示 target 与 actual |
| P0-3 缺少物理装料 | `SourceLoad` + 多 `SourceLoadIngredient` + 容器实例、共同制备步骤、初始位置/位置程序、加热通道 | 科学表单“物理装料与源位” |
| P0-4 无统一时间轴 | `ProcessSegment` + `ProcessChannel` + `ScientificProcessEvent`；通道区分 setpoint/measured/inferred，支持 scalar/多区间/文件 | 科学表单统一时间轴、文件绑定 `process_channel` |
| P0-5 结果不可比较 | `MeasurementRun` 语义记录 + `AnalysisRun` + `PropertyValue` + `MaterialAssertion`；方法条件、样品区域、仪器快照、原始文件和派生边 | `/measurements`、表征列表、科学导出 |
| P0-6 样品只有父子 | `TransformationRun/Input/Output` 表达切割、转移、退火等过程与多输入/多输出 | `/transformations`、`/samples/{id}/lineage`、样品详情转换图 |
| P0-7 炉次不可科学复原 | `RunRevision` 内容快照与 SHA-256；锁定内容 ORM 级不可变；审阅和纠错新修订 | `/experiments/{id}/revisions`、review、correction-drafts、修订历史 UI |
| P0-8 PVD 占位外露 | 新记录只允许 CVD；PVD 写入返回冲突；PVD 与旧扁平结果字段标未发布且不进入 Pydantic 注册表、前端元数据或 JSON 发布契约 | 字段源 `scientific_contract.excluded_profiles`、生成物漂移门禁 |
| P0-9 采集查询不闭环 | RunFeature 锁定投影；数据集条件构建器覆盖目标、装置、批次、衬底、过程数值、气体、事件、实际声明、性质和溯源完整度 | `/datasets/query` 与 `/datasets`；manifest 含查询哈希、版本、单位和缺失值语义 |

## 基础对象与治理

- MaterialLot 拆出 Substance、CommercialProduct、ContainerInstance；纯度含 basis/source，粒径含统计和方法语义。
- Setup 支持部件、部件绑定和生命周期；Instrument 支持多能力与生命周期，不再依赖单一 `name_type`/最近校准日期表达全部事实。
- 衬底支持 stack/layer；样品支持载体、区域、尺寸、生命周期和显式转换谱系；每次锁定追加 `SampleRevisionAssociation` 快照，不再只依赖会前滚的 Sample 当前视图。
- SourceLoad 锁定时冻结容器代码、类型、批次、开封/存储/余量和当时状态；测量的仪器快照同时冻结测量时点最近一次校准及有效性、修正、不确定度和证书哈希。
- 正式导出只包含指定不可变修订的内容哈希、贡献者、目标、SourceLoad/容器快照、时间轴、事件、样品—修订关联、测量、分析、文件派生、性质、声明和转换图；不再混入可变 Sample 当前状态。
- JSON Schema 从当前科学 Pydantic 模型生成，版本/状态/排除 profile 读取字段单一源；未发布字段只保留在 xlsx 人读追溯视图。
- 旧 unlock 覆盖、旧 `process_steps.items`、旧目标=实际、旧扁平结果表单已退出当前产品路径；九条旧结果写端点保留鉴权后统一返回 410，只保留历史读取。

## 二次复核 B1—B8 收口

| 阻断项 | 收口结果 | 最小证据 |
|---|---|---|
| B1 新旧结果写路径并存 | 9 条旧 Characterization/MeasuredProduct/SampleResult 写端点统一 410；前端旧写 API 删除；科学测量增加数据库身份约束 | `test_f9_a2_audit_guards.py` 覆盖全部旧写端点 |
| B2 手工派生样品绕过转换图 | 创建端点只接受 `ControlSampleCreate`，`derived`/父样品等额外字段 422；派生样品仅由 Transformation 生成 | `test_samples.py`、`test_sample_service.py` |
| B3 Review/Transformation ACL | review 仅管理员；reviewed 纳入可见性；转换仅输入炉次 owner/admin，输入行加锁且只接受 active，消费后不可重用 | `test_scientific_integrity.py` 跨用户、reviewed 和 consumed 覆盖 |
| B4 多输入修订与谱系 | TransformationRun 改为显式输出炉次；每条输入边保存自身 revision/provenance；谱系跨炉次广度遍历 | 跨炉次双输入 stack 测试 |
| B5 单位污染特征 | 受控单位注册；原值/单位与 canonical 值/单位并存；设定/实测分投影；未解析文件通道标 unavailable | K↔℃、Torr/mbar↔Pa 与数据集特征测试 |
| B6 导出混合草稿/旧修订 | 正式导出必须指定 revision_id 且仅读 RunRevision；草稿导出独立标记 DRAFT/NON_CITABLE；批量只取当前锁定/已审阅修订 | revision export、draft export、PostgreSQL repeatable-read 测试 |
| B7 数据集查询语义 | `ne` 改为 NOT EXISTS equal；默认只用 valid measurement/property；growth 查询用聚合 Sample actual_state；cursor 累积和精确 revision manifest 下载 | 集合语义、质量过滤、分页与 manifest 测试 |
| B8 前端不可交付 | 内部键改为自动 UUID 并隐藏；受控字段只显示中文标签；事件 outcome 与多值项改为 Select/复选清单；参与者可选；环境显式记录实测/估计/未测量及时间/传感器；声明/不确定度/质量/多输入转换可录 | 后端受控词表/环境证据边界测试、351 个前端测试、隔离 Browser 桌面/390 px 验收 |

## 自动化证据

- 后端：`uv run ruff check .`、`uv run ruff format --check .`、`uv run pytest`。
- 前端：`bun run check`、`bun run lint`、`bun run typecheck`、`bun run test`、`bun run build`。
- 字段与生成物：Pydantic、JSON Schema、前端字段元数据、xlsx 全部重生成；`check_field_source.py` 逐格校验。
- 最终结果：后端 329 passed、4 skipped；前端 50 files、351 tests；字段源 93 个实验字段、66 个实体字段、29 个 R0，全部门禁全绿。
- 迁移：新增 `20260729_0004`；隔离 SQLite 与 PostgreSQL `20260728_0003 → 20260729_0004` 前滚、PostgreSQL 空库到 head 均通过；PostgreSQL 9 条方言专项通过，包含直接 SQL 篡改 RunRevision 被触发器拒绝；临时数据库与角色已清理。
- 浏览器：隔离 SQLite 实例完成管理员登录；新建页确认室温/湿度为空且炉前检查驱动按钮状态；数据集新增条件显示“最高设定温度（°C）/介于”；桌面与 390 px 移动端无错误遮罩，console 0 warning/error，测试目录已清理。
- 科学主线测试覆盖：创建 CVD 炉次、正交目标、SourceLoad、多通道时间轴、不可变锁定、目标/实际分离、无生长与矛盾声明、数据集查询、科学导出、样品切割谱系、审阅、纠错新修订、旧修订不可变、查询只使用当前修订证据。

## 明确后置

- G1—G12 金标准案例与真实用户试填：等待用户确认代码后，再由俊杰、博研等实际实验人填充。
- MaterialAssertion 已支持 active/superseded/disputed 数据状态，但“由谁、以何种理由、是否必须绑定替代证据”的撤回/争议业务流尚无组内决定；不在本轮自行臆造，仍是 alpha 阶段治理项。
- 生产发布：本轮没有获得发布授权；香港生产继续使用 `07eccde / v3.18`。
- v4 新科学页面当前面向课题组中文内测；开始英文试用前，将新增页面文案提取到双语 locale，并移除对应 i18n 守卫例外。
