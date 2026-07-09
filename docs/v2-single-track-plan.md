# v2 单轨化计划（拆除 v1 + Schema 重基线）

> 本计划**取代** `v2-implementation-plan.md` 的 P5（正式迁移，作废）与 P6（切换，升级为拆除）。
> 依据：2026-07-09 用户确认 **v1 试运行数据可弃**（项目未正式投入使用，不为兼容历史数据做架构妥协）；
> 三组独立架构评审（后端 / 前端 / 单一源管线，2026-07-09）+ 两组 v1/v2 耦合探查结论。
> 状态：**已批准待执行**。最后更新：2026-07-09。

## 0. 决策与边界

**定案**：
- 完全删除 v1（代码、表、端点、前端面、迁移机器），v2 收编为唯一实验域。
- 在**当前仓库**清理重建，不新开项目（保 CI/测试/标准资产/git 历史——论文叙事的评审证据链）。
- v2 本体**不重写**：三大架构选型（YAML 单一源+生成校验、实体锁版快照、元数据驱动表单）经评审确认正确，债集中且可枚举。

**随之作废**（原 STATUS §6 / 实现计划相关项）：
- P5 正式迁移全线（`migrate_v1_to_v2`、`v1-to-v2-mapping.yaml`、archive 表、备份门、`--reconcile`、迁移报告 mapped 计数必修项）。
- 给俊杰的 3 个**迁移语义映射**确认问题（quality_label / failure_modes / color_change）——无迁移即无映射。

**不受影响、并行推进**：
- 俊杰 4 个**字段问题**对齐 + P1.5 冻结仪式（YAML 内容层，与本计划正交）。
- §4 全部冻结决策（本计划反而消除 `quality_label` 强喂等与冻结决策的矛盾）。

## 1. 终态定义（完成标志）

1. 仓库只有**一个实验域**（v2 语义）、**一个前端**（frontend-next）、**一个 API 命名空间**（`/api/v1`）。
2. schema = **单一 initial migration**，无 v1 列/表/枚举。
3. 字段与词表唯一源 = `field-source.yaml`，治理走 YAML + git + CI；**无 DB 可编辑词表面**。
4. v2 补齐状态机（submit/lock/unlock + `refresh_result_missing_todo` 接线——§4"结果缺失待办"规则上电）。
5. 全门禁绿（pytest / vitest / tsc / eslint / 生成物零漂移 / check_field_source）+ UI 手工走查完成。

## 2. 评审结论摘要（计划依据）

**v2 架构判定：骨架正确，无过度工程，可放心收编。** 做对了的：单一源 5 路生成+字节级防漂移；锁版快照（不可变版本+引用时刻去规范化留档，非冗余）；DB 层约束实（`uq(entity_id,version)`/FK/NOT NULL）；前后端三实体泛型化无拷贝；表单真元数据驱动（§5 过程步纯 `stage_types` 数据驱动）；前端校验复用 field-logic 无 zod 第二份；测试行为级、walkthrough 闭环到 R0。

**问题分三类**（详见各批次安排）：
- **产品缺口（单独成批，非重构）**：① v2 无状态流转端点/UI，锁炉依赖 v1 工作流，`refresh_result_missing_todo` 零调用者悬空；② 表征记录挂不了文件（FileAsset 无 `characterization_record_id`，前端无上传）。
- **双源/漂移（管线软肋）**：③ 条件表达式解析器 **4 份且已语义漂移**（后端 `condition_matches` 无 list 处理 vs 生成物 `_matches` 有；前端两份 field-logic 各自兜底）+ 条件引用解析失败**四端静默**；④ DB 词表孤儿双源（seed 无运行期消费者、admin 面"改了没用"）；⑤ `formula.ts` 显式复刻后端；⑥ `VISIBILITY_GATED_KEYS` 前端硬编码。
- **实现债**：⑦ `list_runs` 100 条内存过滤；⑧ `experiment_type` 挪用 + `material_system`/`run_code` 列与 payload 双存；⑨ `append_version` 并发撞唯一约束返 500；⑩ `experiment-v2-form.tsx` 三重模块枚举（精简审查批3）；⑪ 测试薄区（表单编排/results-section 零测试、权限/锁定负例缺失）。

**明确不动（YAGNI）**：拆分 `v2_service.py`（577 行仍内聚）；`list_entities` N+1（几十条实体）；版本不可变 DB 触发器（软保证+测试够用）；实体级权限/归属模型（个位数信任用户）；服务层 HTTPException 去耦（FastAPI 常规）；xlsx 渲染管线（冻结后仍是导师/俊杰人读视图，护栏成本已沉没）。

## 3. 批次计划（每批独立 commit，门禁全绿再进下一批）

### 批0 · 备份留档（~0.5h，一次性人工门）
- 生产库 `pg_dump` + 文件卷 tar 一份，归档到仓库外（数据已确认可弃，留档纯为考古保险）。
- **门**：备份文件存在且可 `pg_restore --list`。此后拆除自由。

### 批1 · 删旧 `frontend/`（~0.5h，零风险）
- 整目录删除（32k 行；未被任何 compose/CI/脚本引用）；清 README 4 处提及；AGENTS.md 去"旧前端退役中"表述。
- **门**：compose build 不受影响（本来就只 build frontend-next）。

### 批2 · 后端 v1 面拆除（~1 天）
删除（v2 运行路径零 import，探查已证实）：
- **endpoints**：`experiments.py`、`recipes.py`、`setup_library.py`、`field_definitions.py`、`imports.py`、`admin_dashboard.py`、`vocabularies.py`；`router.py` 同步去挂载。
- **services**：`experiment_service`、`experiment_validation_service`、`experiment_export_service`、`setup_library_service`、`setup_methods_*`×3、`recipe_service`、`field_definition_service`、`import_service`+`imports/`、`admin_dashboard_service`、`spec_export_service`、`vocabulary_service`。
- **commands**：`migrate_v1_to_v2.py`、`generate_spec.py`、`seed_from_field_source.py`（v2 运行期不查 DB 词表，seed 为孤儿双源——管线评审第一刀）。
- **models**：`setup_library`、`setup_methods`、`recipe`、`experiment_version`、`field_definition`、`vocabulary`；`module_payload.py` 内删 `normalize_module_payload` 全家（~190 行）、`ExperimentModuleKey`、`ExperimentModulePayloadV1Archive`。
- **docs**：`v1-to-v2-mapping.yaml`；`generated/` 内 cvd_v1 产物（`cvd-2d-field-dictionary.json/md`、`cvd-2d-process.schema.json`）。
- **测试**：对应 v1 测试（50 个文件中约 40 个 v1 面）+ 迁移测试×2。
- **CI**：generated-artifacts job 去掉 `alembic upgrade` 与 `generate_spec` 步骤（只剩 YAML 驱动的 `export_v2_schema`，不再需要 DB）。

改动（红线：**不能整删的共享件**）：
- `sample_service.py` 切 v1 耦合（`sample_service.py:109-110` 从 v1 衬底模块回填的旧行为随 `normalize_module_payload` 一起删）；`samples.py` 端点**整体保留**（v2 前端建样依赖 `POST /experiments/{id}/samples`）。
- 保留：`files.py`+`file_asset_service`（时序/表征文件是 v2 既定基建）、auth、audit、`ExperimentRepository`（`next_run_code`/`list_visible`）。
- **门**：pytest 剩余全绿，`test_v2_full_walkthrough` 必过。

### 批3 · v2 状态机收编（~0.5–1 天）
批2 删掉了仓库里唯一的 submit/lock 实现，本批补上 v2 版（v2 前端原本无入口，无回归风险）：
- 端点：`POST /experiments/{id}/submit | lock | unlock`（invalidate 视 v1 原有能力对齐 AGENTS 状态流 draft→submitted→locked→invalid）。
- submit 校验：必填模块齐全 + R0 检查（复用 `check_r0` 逻辑）。
- lock 钩子：**接线 `refresh_result_missing_todo`**（该函数已有服务级测试但零端点调用者——§4 冻结规则借此上电）。
- 顺手修（后端评审低成本项）：`list_runs` 过滤+分页下推 repository（消 100 条截断）；`append_version` 捕 IntegrityError→409（与 `create_run` 对齐）。
- 前端：list/edit 页状态流转入口 + 状态徽章。
- **门**：新端点测试（含锁定拒编辑负例、result_missing_todo 接线正负例、非属主 403）。

### 批4 · 前端收编（~1 天）
- 删 `features/experiments`（16.3k 行）、`setup-library`、`field-definitions`、`vocabularies`、`admin-dashboard` + 对应路由 + i18n 死键。
- `samples` 页保留：detail 页借用的 3 个 v1 api 函数（`getExperiment`/`listExperimentFiles`/`downloadExperimentFile`）搬家改指 v2 端点。
- 路由改名 `experiments-v2`→`experiments`；默认落地 `/`→新实验页；侧边栏单轨（删 v1 项、去"v2 先于 v1 匹配"特判，`app-shell.tsx`）。
- **顺手做精简审查批3**：`experiment-v2-form.tsx` 三重模块枚举（`:203-223`/`:242-289`/`:346-401`）→ 表驱动 `MODULE_SPECS`（equipment 走 setup-reference 作唯一特例分支）；**重构前先补 `saveModule`/`createAndSave` 行为测试**（该文件现零测试）。
- **门**：vitest/tsc/eslint 绿 + **UI 手工走查**（浏览器完整录入一条炉次——原 STATUS §6 步骤5 在此完成）。

### 批5 · Schema 重基线（~0.5–1 天）
- **squash 34 个 Alembic 迁移 → 单一 initial**（纯 v2 schema；无生产数据，合法）。
- `experiment_runs` 瘦身：删 `quality_label`（含 DB enum 类型）、`summary_result`、`template_version_id`、`recipe_id`、`project_id`、`derived_from_run_id`；`schema_version` 设 NOT NULL；**删 `experiment_type` 挪用**（`v2_service.py:230` 同步改）；`material_system`/basic_info 内 `run_code` 双存问题二选一（保留列则 upsert 同步、或改读时投影——执行时定，原则：单写入点）。
- `samples` 瘦身：删 v2 不用的 v1 形状列（以 v2 前端建样实际字段为准）。
- `experiment_module_payloads`：默认 `schema_version` 改 `cvd_v2`。
- **`file_assets` 加 `characterization_record_id` 可空 FK**（表征挂文件的地基，squash 时加列零边际成本；上传功能本身见 §5 后续项）。
- 删表：`field_definitions`、`controlled_vocabularies`、`recipes`、setup_library 系、`experiment_versions`、`experiment_module_payloads_v1_archive`。
- 对应模型/服务同步（`v2_service.py` 去 `QualityLabel` import 等）。
- **门**：空库 `alembic upgrade head` 一步建成 + 全测试绿 + walkthrough 过。

### 批6 · API 收编 + 管线加固（~0.5 天）
- `/api/v1/v2/*` → `/api/v1/*`；openapi 类型重生成，前端 `api.ts` 路径改。
- **条件表达式解析器收敛为 1 份**（管线评审最高优先级）：`gen:fields` 一并生成 TS matcher 与后端生成物 `_matches` 同源；后端运行期 `condition_matches` 与生成器对齐（补 list 处理）；`VISIBILITY_GATED_KEYS` 编入生成物，`isFieldVisible` 纯数据驱动。
- `check_field_source.py` 补护栏：`condition.field` **可解析**断言（当前解析失败四端静默）、`op ∈ {eq,ne,in}`、`in` 值必须为 list、下拉字段词表可解析。
- **门**：生成物零漂移 + check_field_source 过 + 前后端条件判定一致性测试（同一 YAML 条件、双端断言同结果）。

### 批7 · 文档收尾（~0.5h）
- STATUS.md 重写现状（v2 单轨、v1 已拆）+ 进展日志；AGENTS.md 去 v1 提及、修复失效的设计语境路径（§设计语境指向他人机器绝对路径）；CLAUDE.md 一句话现状更新；`v2-implementation-plan.md` 头部加"P5/P6 已由本计划取代"横幅。
- push 时机与 tag 随 P1.5 冻结仪式，由用户定。

**总计 ~4–5 天**（含门禁与走查）。回滚方式：每批独立 commit 可 `git revert`；数据兜底 = 批0 备份。

## 4. 保留资产红线（防误删）

`samples.py` + `sample_service`（切耦合后）｜ `files.py` + `file_asset_service` + `file_storage_service` ｜ auth/users/audit ｜ `ExperimentRepository` ｜ v2 全家（models/services/endpoints/schemas/generated）｜ 单一源管线（YAML、生成器①–⑤ 中除 seed 外全部、check 脚本、CI 四 job）｜ `test_v2_full_walkthrough` ｜ `docs/standard/` 标准资产与 `docs/archive/`。

## 5. 后续项（不阻塞单轨化，单独立项）

- **表征文件上传功能**（端点 + results-section 上传 UI；FK 已在批5 预埋）——标准要求"表征附谱图"，v2.0 上线前应补，但不塞进重基线节奏。
- `formula.ts` 118 元素表双源：文件头已声明同步义务，规则不变不动；若再改一次化学式规则，改为生成器吐。
- locked 炉次 clone、`results-section.tsx`（712 行）拆分、组件层行为测试补强：遇真实需求再做。
- 词表运行期热更新（不改代码改词表）：当前 YAML+git 治理对冻结标准是**正确模型**；若冻结后出现高频词表变更需求，再评估 DB 化，勿提前。
