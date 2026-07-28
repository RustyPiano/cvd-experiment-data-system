# 2026-07-28 深度审查整改记录

状态：`v4.0-rc.1 / RELEASE_CANDIDATE`，本地代码候选，未发布生产。

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
- 衬底支持 stack/layer；样品支持载体、区域、尺寸、生命周期和显式转换谱系。
- 导出包含全部不可变修订、内容哈希、贡献者、目标、SourceLoad、时间轴、事件、测量、分析、文件派生、性质、声明、样品和转换图。
- JSON Schema 从当前科学 Pydantic 模型生成，版本/状态/排除 profile 读取字段单一源；未发布字段只保留在 xlsx 人读追溯视图。
- 旧 unlock 覆盖、旧 `process_steps.items`、旧目标=实际、旧扁平结果表单与对应契约测试已退出当前产品路径。

## 自动化证据

- 后端：`uv run ruff check .`、`uv run ruff format --check .`、`uv run pytest`。
- 前端：`bun run check`、`bun run lint`、`bun run typecheck`、`bun run test`、`bun run build`。
- 字段与生成物：Pydantic、JSON Schema、前端字段元数据、xlsx 全部重生成；`check_field_source.py` 逐格校验。
- 最终结果：后端 331 passed、4 skipped；前端 50 files、351 tests；字段源 93 个实验字段、66 个实体字段、29 个 R0，全部门禁全绿。
- 迁移：隔离 PostgreSQL 空库直升 head、生产基线 `20260728_0002 → 20260728_0003` 前滚均通过；临时数据库与角色已清理。
- 浏览器：隔离 SQLite 实例完成管理员登录、创建炉次、科学编辑页动态装料/事件展开和数据集查询；查询返回指纹与 `schema v4.0-rc.1`，console 0 warning/error，测试目录已清理。
- 科学主线测试覆盖：创建 CVD 炉次、正交目标、SourceLoad、多通道时间轴、不可变锁定、目标/实际分离、无生长与矛盾声明、数据集查询、科学导出、样品切割谱系、审阅、纠错新修订、旧修订不可变、查询只使用当前修订证据。

## 明确后置

- G1—G12 金标准案例与真实用户试填：等待用户确认代码后，再由俊杰、博研等实际实验人填充。
- 生产发布：本轮没有获得发布授权；香港生产继续使用 `07eccde / v3.18`。
- v4 新科学页面当前面向课题组中文内测；开始英文试用前，将新增页面文案提取到双语 locale，并移除对应 i18n 守卫例外。
