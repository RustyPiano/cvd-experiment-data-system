# v2 单轨化计划（拆除 v1 + Schema 重基线）

> 本计划**取代** `v2-implementation-plan.md` 的 P5（正式迁移，作废）与 P6（切换，升级为拆除+批8 找回人工门）。
> 依据：2026-07-09 用户确认 **v1 试运行数据可弃**（项目未正式投入使用，不为兼容历史数据做架构妥协）；
> 三组独立架构评审（后端 / 前端 / 单一源管线，2026-07-09）+ 两组 v1/v2 耦合探查结论。
> **2026-07-11 修订（5 组并行取证复评，逐断言 file:line 验证）**：批2 原"models 层零 import"断言被证伪→补 schemas/repositories 两层+三处红线切耦合+前端最小补丁；批3 扩范围（守卫缺 5 路径+审计/再校验+快照语义决策）；批6 换更省方案（反对生成 TS matcher）；**新增批8 生产切换**（原 P6 人工门找回，容器启动即 `alembic upgrade head`，squash 后老库部署即崩）。
> 状态：**批0 豁免（测试数据）；批1–7 已执行完毕（2026-07-11，含批4 走查修复）；仅剩批8 生产切换（人工门，用户在场）**。最后更新：2026-07-11。
> **现行性提示**：批1–7章节保留的是当时的实施计划与执行依据，其中旧 `submitted` 状态和旧端点仅用于历史追溯；当前产品逻辑是 `draft → locked`，以 [`../standard/STATUS.md`](../standard/STATUS.md) 和 [`../product/run-first-workflow-and-copy-design.md`](../product/run-first-workflow-and-copy-design.md) 为准。本文件当前仍具约束力的部分是批8生产切换。

## 0. 决策与边界

**定案**：
- 完全删除 v1（代码、表、端点、前端面、迁移机器），v2 收编为唯一实验域。
- 在**当前仓库**清理重建，不新开项目（保 CI/测试/标准资产/git 历史——论文叙事的评审证据链）。
- v2 本体**不重写**：三大架构选型（YAML 单一源+生成校验、实体锁版快照、元数据驱动表单）经评审确认正确，债集中且可枚举。

**执行红线（2026-07-11 增）**：
- **批8 完成前禁止运行 `deploy.sh` / 任何生产部署**。后端容器启动命令是 `alembic upgrade head && uvicorn`（`backend/Dockerfile:23`）：批2–批7 任何中间态部署上去功能都是断的；批5 squash 后生产库 `alembic_version` 指向不存在的修订号，后端直接崩溃循环。切换只能走批8 的整库重建。

**随之作废**（原 STATUS §6 / 实现计划相关项）：
- P5 正式迁移全线（`migrate_v1_to_v2`、`v1-to-v2-mapping.yaml`、archive 表、备份门、`--reconcile`、迁移报告 mapped 计数必修项）。
- 给俊杰的 3 个**迁移语义映射**确认问题（quality_label / failure_modes / color_change）——无迁移即无映射。

**不受影响、并行推进**：
- 俊杰 4 个**字段问题**对齐 + P1.5 冻结仪式（YAML 内容层，与本计划正交）。原时序交叉点已解除（2026-07-11 拍板）：**P1.5 冻结范围 = 字段语义层，明确排除 UI 呈现属性**——批6 往 `field-source.yaml` 加 UI 属性不受冻结约束。
- §4 全部冻结决策（本计划反而消除 `quality_label` 强喂等与冻结决策的矛盾）。

## 1. 终态定义（完成标志）

1. 仓库只有**一个实验域**（v2 语义）、**一个前端**（frontend-next）、**一个 API 命名空间**（`/api/v1`）。
2. schema = **单一 initial migration**，无 v1 列/表/枚举。
3. 字段与词表唯一源 = `field-source.yaml`，治理走 YAML + git + CI；**无 DB 可编辑词表面**。
4. v2 补齐状态机（submit/lock/unlock + `refresh_result_missing_todo` 接线——§4"结果缺失待办"规则上电），且锁定守卫覆盖**全部**写路径。
5. 全门禁绿（pytest / vitest / tsc / eslint / 生成物零漂移 / check_field_source）+ UI 手工走查完成。
6. **生产环境运行纯 v2**（批8 切换完成，线上冒烟一条真实炉次走通）。

## 2. 评审结论摘要（计划依据）

**v2 架构判定：骨架正确，无过度工程，可放心收编。** 做对了的：单一源 5 路生成+字节级防漂移；锁版快照（不可变版本+引用时刻去规范化留档，非冗余）；DB 层约束实（`uq(entity_id,version)`/FK/NOT NULL）；前后端三实体泛型化无拷贝；表单真元数据驱动（§5 过程步纯 `stage_types` 数据驱动）；前端校验复用 field-logic 无 zod 第二份；测试行为级、walkthrough 闭环到 R0。

**问题分三类**（详见各批次安排）：
- **产品缺口（单独成批，非重构）**：① v2 无状态流转端点/UI，锁炉依赖 v1 工作流，`refresh_result_missing_todo` 零调用者悬空；② 表征记录挂不了文件（FileAsset 无 `characterization_record_id`，前端无上传）。
- **双源/漂移（管线软肋）**：③ 条件表达式解析器多份且已语义漂移 + 条件引用解析失败四端静默；④ DB 词表孤儿双源（seed 无运行期消费者、admin 面"改了没用"）；⑤ `formula.ts` 显式复刻后端；⑥ `VISIBILITY_GATED_KEYS` 前端硬编码。
- **实现债**：⑦ `list_runs` 100 条内存过滤；⑧ `experiment_type` 挪用 + `material_system`/`run_code` 列与 payload 双存；⑨ `append_version` 并发撞唯一约束返 500；⑩ `experiment-v2-form.tsx` 三重模块枚举（精简审查批3）；⑪ 测试薄区（表单编排/results-section 零测试、权限/锁定负例缺失）。

**2026-07-11 复评勘误**（问题全部成立，构成描述修正）：③ 实际 = **3 份运行实现 + 1 份生成器内字符串模板**（前端是 1 份共享实现被 re-export，非"两份"）；后端运行期 `condition_matches` 无 list 分支 vs 生成物 `_matches` 有（`v2_field_source.py:117-127` vs `v2_module_payload.py:17-23`）属实；且四端静默的**兜底真值互相相反**——entity-library 解析失败按"显示"兜底（`field-logic.ts:136`），experiments-v2 按"条件不成立"兜底（`field-logic.ts:67`），同一条件两页面可一显一隐，比"静默"更糟。

**明确不动（YAGNI）**：拆分 `v2_service.py`（577 行仍内聚）；`list_entities` N+1（几十条实体）；版本不可变 DB 触发器（软保证+测试够用）；实体级权限/归属模型（个位数信任用户）；服务层 HTTPException 去耦（FastAPI 常规）；xlsx 渲染管线（冻结后仍是导师/俊杰人读视图，护栏成本已沉没）；**生成 TS 条件 matcher**（复评增：~12 行固定逻辑无逐字段内容可特化，生成器无单一源收益，见批6）。

## 3. 批次计划（每批独立 commit，门禁全绿再进下一批）

### 批0 · 备份留档 — **已豁免（2026-07-11 用户确认：全部为测试数据，无需备份）**
- 原内容：生产库 `pg_dump` + 文件卷 tar 归档仓库外。用户明示跳过，拆除自由。批8 切换时直接重建库，无恢复预期。

### 批1 · 删旧 `frontend/`（~0.5h，零风险）
- 整目录删除（31,889 行；复评确认 compose/CI/deploy.sh/backup.sh 零引用）；清 README 9 处提及（`README.md:6,7,54,132,143,147,152,247,297`）——其中 **:143/:147 声称"dev compose 构建旧前端"是过时错话**（`docker-compose.yml:84` 实际已指 frontend-next），一并修正；AGENTS.md 去"旧前端退役中"表述（`AGENTS.md:8`）。
- **门**：compose build 不受影响（本来就只 build frontend-next）。

### 批2 · 后端 v1 面拆除（~1.5–2 天）

> ⚠️ 复评修正：原"v2 运行路径零 import"仅对 endpoints/services/commands 三层成立，**models 层被证伪**（三处红线运行路径硬依赖，见"切耦合"）；原清单还漏了 **schemas / repositories 两层与四个聚合器**。工期从 ~1 天上调。

删除：
- **endpoints**（7 个）：`experiments.py`、`recipes.py`、`setup_library.py`、`field_definitions.py`、`imports.py`、`admin_dashboard.py`、`vocabularies.py`；`api/v1/router.py` 同步去 7 行挂载。
- **services**：`experiment_service`、`experiment_validation_service`、`experiment_export_service`、`setup_library_service`、`setup_methods_*`×3、`recipe_service`、`field_definition_service`、`import_service`+`imports/`、`admin_dashboard_service`、`spec_export_service`、`vocabulary_service`；**`services/__init__.py` 同步去 re-export**（`FieldDefinitionService`/`RecipeService`——不改则任何 `import app.services.*` 导入期即炸）。
- **schemas（原计划漏列）**：`experiment`、`field_definition`、`recipe`、`setup_library`、`vocabulary`、`experiment_version`、`setup_methods`、imports 相关；`schemas/module_payload.py` 去 `ExperimentModuleKey` 引用；**`schemas/__init__.py` 同步**。
- **repositories（原计划漏列）**：`recipe_repository`、`field_definition_repository`、`setup_library_repository`、`experiment_version_repository`；`setup_methods_repository`/`vocabulary_repository` 随下方切耦合一并删。
- **commands**：`migrate_v1_to_v2.py`、`generate_spec.py`、`seed_from_field_source.py`（复评确认孤儿：除自身 `__main__` 与自测外零调用方，不在 CI/entrypoint/conftest）。
- **models**：`setup_library`、`setup_methods`、`recipe`、`experiment_version`、`field_definition`、`vocabulary`；`module_payload.py` 内删 `normalize_module_payload` 全家（~190 行）、`ExperimentModuleKey`、`ExperimentModulePayloadV1Archive`（`ExperimentModulePayload` 主模型保留）；**`models/__init__.py` 同步**（`alembic/env.py:8` 经它触发全量 import）。
- **docs**：`v1-to-v2-mapping.yaml`；`generated/` 内 cvd_v1 产物（`cvd-2d-field-dictionary.json/md`、`cvd-2d-process.schema.json`）。
- **测试**：v1 面约 **27 个文件（全仓实 46 个，修正原文"50 中约 40"）**+ 迁移测试。**两颗保留测试的雷**：`tests/models/test_v2_database_models.py:12` import 待删 `ExperimentModuleKey`（删该断言）；`tests/api/test_samples.py` 全程用 v1 `POST /experiments` 建实验驱动 substrate-sync（改用 v2 建炉次 fixture 重写，samples 端点保留 ≠ 此测试原样保留）。
- **CI**：generated-artifacts job 去掉 `alembic upgrade` 与 `generate_spec` 步骤（只剩 YAML 驱动的 `export_v2_schema` + 漂移检查，不再需要 DB）。

切耦合（红线保留件内的 v1 残肢——复评发现的三处硬依赖 + sample_service，逐一修法）：
1. `module_payload_repository.py:8,61`：`clone_for_run` 顶层 import 并调用 `normalize_module_payload`，而该仓库被 `v2_service.py:25,220` 使用（删函数即导入期炸 v2）。`clone_for_run` 唯一调用者是待删 v1 clone 流 → **连 `clone_for_run` 一起删**。
2. `experiment_repository.py:9,35-40,179-180,217-218`：红线 `ExperimentRepository.list_visible` outer-join `ExperimentSetupSnapshot` 判 setup 残缺（纯 v1 语义）→ 删该 join 与相关字段。
3. `file_asset_service.py`：`:64,193` setup 简图查询（v1）删；**`:321` 上传期 `characterization_method` 词表校验是信任边界，不许顺手删**——改读 YAML 词表（`v2_field_source` 已有词表能力），与"词表单一源"方向一致。
4. `sample_service.py`：删 `sync_substrate_samples`（:109-112，含 `normalize_module_payload` 调用）与 `clone_samples` 两个方法（唯一调用者均为待删 `experiment_service`）+ :12 的 import。`samples.py` 端点**整体保留**（v2 前端建样走 `POST /experiments/{id}/samples`，`frontend-next .../experiments-v2/api.ts:112`）。

前端最小补丁（消批2→批4 中间态破窗，~30 行）：samples 详情页借用的 3 个 v1 api 函数（`sample-detail-page.tsx:187/194/284`）搬入 `features/samples`；其中 `getExperiment` 改指 v2 读端点（`listExperimentFiles`/`downloadExperimentFile` 走保留的 `files.py`，本就不受影响）。

保留：`files.py`+`file_asset_service`（时序/表征文件是 v2 既定基建）、auth、audit、`ExperimentRepository`（`next_run_code`/`list_visible`，切 join 后）。
- **门**：pytest 剩余全绿，`test_v2_full_walkthrough` 必过。

### 批3 · v2 状态机收编（~1 天）

批2 删掉了仓库里唯一的 submit/lock 实现。**v1 行为表复评时已提取如下，照此对齐，勿再 git 考古**：

| 转移 | 谁 | 守卫 | 副作用 |
|---|---|---|---|
| submit | 属主/admin | 仅 DRAFT（否则 409）；全量校验 | SUBMITTED + submitted_at；审计 |
| lock | 属主/admin | 仅 SUBMITTED；**再校验** | LOCKED + locked_at；审计 |
| unlock | **仅 admin**（取记录前判 403） | 仅 LOCKED | 回 SUBMITTED，清 locked_at；审计 |
| return_to_draft | 属主/admin | 仅 SUBMITTED | 回 DRAFT，清两时间戳；审计 |
| invalidate | 属主/admin | INVALID/LOCKED 拒（locked 只许 clone） | INVALID + invalid_reason；审计 |

范围（复评后比原文大）：
- 端点：`POST /experiments/{id}/submit | lock | unlock | invalidate`（+return_to_draft），对齐 AGENTS 状态流 draft→submitted→locked→invalid。
- submit 校验：必填模块齐全 + R0 检查（复用 `check_r0` 逻辑）；lock 再校验（对齐 v1）。
- **守卫补齐（复评发现）**：`_ensure_editable` 已存在但只挂 3 条写路径（setup-reference/upsert_module/create_characterization），锁定后以下 5 条仍畅通——update/delete characterization（`v2_service.py:387/:400`）、create/update/delete measured product（`:415/:434/:447`）→ 全部补上。
- **审计接线（复评发现）**：v2 目前**零** `audit.record_event` 调用；每次状态流转写审计（v1 每转移必审计；audit 服务保留，成本低）。
- lock 钩子：**接线 `refresh_result_missing_todo`**（该函数已有服务级测试但零端点调用者——§4 冻结规则借此上电）。
- 读模型：`_run_read` 补 `result_missing_todo`/`submitted_at`/`locked_at`（前端状态徽章/待办标记的数据来源，现只吐 status）。
- 顺手修（后端评审低成本项）：`list_runs` 过滤+分页下推 repository（消 100 条截断）；`append_version` 捕 IntegrityError→409（对齐 `create_run` 既有写法 `v2_service.py:239-246`）。
- 前端：list/edit 页状态流转入口 + 状态徽章。
- **已拍板（2026-07-11，用户确认）：放弃"submit 创建版本快照"语义**。`experiment_versions` 表随拆除消失，不另建 v2 实验级快照机制——实体锁版快照 + 全转移审计留痕已覆盖留档需求；未来真有需求再单独立项。**勿在批3 里"顺手"重建快照。**
- **门**：新端点测试（转移矩阵正负例、锁定拒编辑覆盖**全部**写路径、result_missing_todo 接线正负例、非属主 403、unlock 非 admin 403）。

### 批4 · 前端收编（~1 天）
- 删 `features/experiments`（16.5k 行）、`setup-library`、`field-definitions`、`vocabularies`、`admin-dashboard`（合计 ~20.5k 行）+ 对应路由文件。复评确认：除 samples 详情页 3 函数（已在批2 搬家）外，保留代码对五者**零 cross-import**，可整删。（原"i18n 死键"项删除——复评发现 v1 功能未接 i18n、全部硬编码中文，死键≈0。）
- **批内顺序**：先删 v1 `routes/_authed/experiments/` 路由树，**再**改名 experiments-v2→experiments（否则路径冲突）。`/` 默认重定向本就指 `/experiments`，改名后自动落新页，零改动。侧边栏单轨（删 v1 项、去 `app-shell.tsx:127-130` "v2 先于 v1 匹配"特判）。
- **顺手做精简审查批3**：`experiment-v2-form.tsx` 三重模块枚举（`:203-223`/`:242-289`/`:346-401`，复评确认行号未漂移）→ 表驱动 `MODULE_SPECS`（equipment 走 setup-reference 作唯一特例分支）；**重构前先补 `saveModule`/`createAndSave` 行为测试**（该文件现零测试）。
- **门**：vitest/tsc/eslint 绿 + **UI 手工走查**（浏览器完整录入一条炉次——原 STATUS §6 步骤5 在此完成）。

### 批5 · Schema 重基线（~0.5–1 天）

> 复评好消息：待删表**零入度 FK**（无任何保留表外键指向它们）；`project_id`/`template_version_id`/`recipe_id` 是无约束裸 Uuid 列（projects/templates 表根本不存在），直接删列；批8 定为整库重建后，squash **无需考虑老库在位升级**（孤儿 enum、drop 顺序均不适用）——新 initial 只写纯 v2 形状。

- **squash 34 个 Alembic 迁移 → 单一 initial**（纯 v2 schema；无生产数据，合法）。**必须 SQLite 兼容**——测试建库走 `alembic upgrade head`（`conftest.py:79-81`），CI 后端 job 用 SQLite。
- `experiment_runs` 瘦身：删 `quality_label`（含 DB enum 类型 `quality_label`）、`summary_result`、`template_version_id`、`recipe_id`、`project_id`、`derived_from_run_id`；`schema_version` 设 NOT NULL；**删 `experiment_type` 挪用**（`v2_service.py:229-231` 同步改）；`material_system`/basic_info 内 `run_code` 双存问题二选一（保留列则 upsert 同步、或改读时投影——执行时定，原则：单写入点）。enum 处置：保留 `user_role`/`experiment_status`，`quality_label` 随列删，`setup_visibility` 随 `setup_library_entries` 消失。
- `samples` 瘦身：v2 建样只提交 `role`（`results-section.tsx:201`）→ 删 `substrate_type`/`brand`/`size_mm`/`treatment`/`position_mm`/`storage_location` 六列。
- `experiment_module_payloads`：默认 `schema_version` 改 `cvd_v2`；保留 `UniqueConstraint(experiment_run_id, module_key)`。
- **`file_assets` 加 `characterization_record_id` 可空 FK**（表征挂文件的地基，squash 时加列零边际成本；上传功能本身见 §5 后续项）。
- 删表（实际表名，复评核实）：`experiment_field_definitions`、`controlled_vocabularies`、`recipes`、`setup_library_entries`、`experiment_setup_snapshots`、`experiment_versions`、`experiment_module_payloads_v1_archive`。
- 保留清单补全（原文漏写）：`experiment_module_payloads`、`material_lot_versions`/`setup_versions`/`instrument_versions` 三张实体版本表。
- 对应模型/服务同步（`v2_service.py` 去 `QualityLabel` import 等）。
- **门**：空库 `alembic upgrade head` 一步建成 + 全测试绿 + walkthrough 过。

### 批6 · API 收编 + 管线加固（~0.5 天）
- `/api/v1/v2/*` → `/api/v1/*`；openapi 类型重生成（`gen:api`），前端 `api.ts` 路径改。
- **条件表达式解析器收敛（复评换方案：现实下限 = 2 份而非 1 份；原"生成 TS matcher"方案否决——matcher 是 ~12 行固定逻辑，无逐字段内容可特化，写生成器无单一源收益）**：
  1. **后端 3→1**：删 `generate_v2_models.py:87-101` 的字符串模板内联，生成物改为 `import` 运行期 `condition_matches`（`v2_field_source.py:117`）；后者补 list 驱动值分支（直接采用生成物现有实现 `v2_module_payload.py:17-23`）。
  2. **前端保持 1 份手写**（复评：本就只有 `entity-library/field-logic.ts:98` 一份被 re-export），手工对齐两处分歧：unknown op 兜底 `true`（`:112`）→ 对齐后端语义；**统一解析失败兜底真值**（现 entity-library"显示"vs experiments-v2"条件不成立"，相反）。
  3. **跨语言一致性 fixture**：`docs/standard/condition-cases.json` 枚举刁钻用例（list 驱动值、`in` 标量/列表、unknown op、不可解析引用），pytest 与 vitest 双端断言同结果——这是防再漂移的真护栏，比生成 matcher 省且稳。
- `VISIBILITY_GATED_KEYS` 编入单一源：根因是 YAML 无"条件不满足时隐藏 vs 仅红星"UI 属性 → 在 `field-source.yaml` 新增该属性、生成器⑤透传、`isFieldVisible` 纯数据驱动。**时序已拍板（2026-07-11，用户确认）：P1.5 冻结范围 = 字段语义层（字段集合/必填与条件/词表/R0），明确排除 UI 呈现属性**——本项与线 B 冻结解耦，批6 何时落地都不违反冻结。
- `check_field_source.py` 补护栏（复评确认四条现全缺）：`condition.field` **可解析**断言（消"四端静默"于源头）、`op ∈ {eq,ne,in}`、`in` 值必须为 list、下拉字段词表可解析。
- **门**：生成物零漂移 + check_field_source 过 + condition-cases fixture 双端一致性测试绿。

### 批7 · 文档收尾（~0.5h）
- STATUS.md 重写现状（v2 单轨、v1 已拆）+ 进展日志；AGENTS.md 去 v1 提及、修复失效的设计语境路径（§设计语境指向他人机器绝对路径）；CLAUDE.md 一句话现状更新；`v2-implementation-plan.md` 头部加"P5/P6 已由本计划取代"横幅。
- push 时机与 tag 随 P1.5 冻结仪式，由用户定。

### 批8 · 生产切换（~0.5 天，人工门，用户在场）——2026-07-11 增

> 原 P6"生产切换必须用户在场"的人工门在此找回。前提：批0 备份在手、批1–7 全部门禁绿、代码已 push。

1. 停生产容器（`docker compose -f docker-compose.prod.yml down`）。
2. **drop 并重建生产数据库**（1Panel 共享 PG 上的本库；文件卷内旧上传按需清理）。
3. 部署新代码（`deploy.sh`；容器启动自动 `alembic upgrade head` → 纯 v2 单一 initial 一步建成）。
4. 建管理员账号（`create_admin`），核对 `.env`（邀请码/JWT 等）。
5. **线上冒烟**：完整录入一条真实炉次（实体→引用→全模块→样品→表征→实测→submit/lock→`check-r0` compliant）。
- **门**：冒烟通过 + 健康检查绿。在此之前**禁止任何 `deploy.sh`**（见 §0 执行红线）。

**总计 ~5.5–7 天**（含门禁与走查；批2 复评后上调）。回滚方式：每批独立 commit 可 `git revert`；数据兜底 = 批0 备份。

## 4. 保留资产红线（防误删）

`samples.py` + `sample_service`（切耦合后）｜ `files.py` + `file_asset_service` + `file_storage_service`（词表校验改读 YAML 后）｜ auth/users/audit ｜ `ExperimentRepository`（切 setup join 后）+ `module_payload_repository`（删 clone_for_run 后）｜ v2 全家（models/services/endpoints/schemas/generated）｜ 单一源管线（YAML、生成器①②④⑤、check 脚本、CI 四 job；③seed 删除）｜ `test_v2_full_walkthrough` ｜ `docs/standard/` 标准资产与 `docs/archive/`。

## 5. 后续项（不阻塞单轨化，单独立项）

- `formula.ts` 118 元素表双源：文件头已声明同步义务，规则不变不动；若再改一次化学式规则，改为生成器吐。
- locked 炉次 clone：遇真实需求再做。
- 词表运行期热更新（不改代码改词表）：当前 YAML+git 治理对冻结标准是**正确模型**；若冻结后出现高频词表变更需求，再评估 DB 化，勿提前。
- xlsx 重生成的 zip 元数据级 diff：**明确不修**（openpyxl 确定性输出成本高，CI 逐格比对不受影响）。

## 6. 收尾批 F1–F6（2026-07-11 批7 后评估追加；F2 方案甲已拍板）

> 来源：批7 完成后的客观评价（6 个真问题 + 优雅性清单）。执行方式沿用：每批独立 commit、门禁全绿再进、codex-first。

- **F1 · 保险与硬顺序**（10 分钟，Claude 直做）：`git tag v1-final 47ce09a`（逃生舱）；`deploy.sh` 加 schema 哨兵（库内 `alembic_version` 在本仓库迁移链中不存在 → 拒绝部署并提示批8，`SKIP_SCHEMA_GUARD=1` 应急旁路）；硬顺序落盘：push → Actions 首绿 → F6 → 批8。
- **F2 · 锁定语义甲落地**（~0.5 天）：守卫分域——`_ensure_editable` 拆为工艺域（locked/invalid 拒：模块 payload、装置引用）与结果域（仅 invalid 拒：表征记录、实测产物、表征附件上传）；`refresh_result_missing_todo` 在结果域每次变更后刷新（locked 补结果 → 待办自动消除）；前端锁定横幅与禁用范围同步分域；测试矩阵更新 + walkthrough 扩展（lock → 补表征 → 待办清除）。
- **F3 · 优雅性清扫**（~0.5–1 天）：v1 残留命名对齐（`_get_owned_draft_file` 等）；写操作 403/404 按可见性分层（不可见→404，可见非属主→403）；`status` 边界改 Literal/enum → openapi 重生成 → 前端删手工重铸；**`v2_service.py`（687 行）拆三**（实体域/炉次+状态机/结果域，赶在 F4 加功能前）；轻量审计扩面（upsert_module/实体版本追加，只记 who/when/module_key 或版本号）；`sample_code` 并发 IntegrityError→409；dev 环境禁用 field-source lru_cache。
- **F4 · 表征文件上传**（~0.5–1 天）：上传端点挂 `characterization_record_id`（FK 批5 已预埋）+ results-section 上传/列表/下载 UI + 审计沿用 + 权限遵循 F2 锁定语义。证据链（表征附谱图）闭环。
- **F5 · 测试补强**（~0.5 天）：results-section 行为级测试（含 F4 新功能）；复合输入 12 字段参数化全覆盖；状态机审计断言与 F2 守卫粒度正负例。
- **F6 · 全栈验证收口**（~0.5 天）：本地 compose 全栈 + 浏览器 E2E 复跑全链路（新前缀/新 schema/复合输入/结果补录/表征附件/状态链）；Codex xhigh 对批2–F5 累计 diff 独立等价性复审；STATUS/计划文档收口。
- **F7 · xhigh 复审修复**（执行中追加）：F6② 复审产出 5 CONFIRMED（submit/lock 缺全量必填校验、非属主假编辑入口、样品详情 draft-only 残留、词表启发式仍误杀 4 下拉、squash 丢审计复合索引）+ 3 PLAUSIBLE（unknown-op 非对称定案入 fixture、附件 method 由记录派生、initial 删 method server_default）——全部修复并带测试。
- 依赖：F1 随时；F3 在 F4 前；F5 依赖 F2/F4；F6+F7 收口后才可批8。
- **F8 · 浏览器 E2E 两发现修复**（执行中追加）：用户交互式会话 E2E 发现——文件 SQLite 误用 StaticPool 单连接并发踩踏（随机 500/伪 401，阻断走查步骤 4–9）→ 仅 `:memory:` 保留 StaticPool、文件库 QueuePool+WAL+busy_timeout+16 线程回归；实验日期跨日错位 → `started_at` 定案本地墙钟语义、前端不再转 UTC。
- **执行结果（2026-07-11/12）**：**F1–F8 全部完成**。F6①浏览器 E2E 因 `codex exec` 无头会话无内置浏览器改为:API 级全栈冒烟（通过）+ 浏览器走查移交用户交互式 Codex 会话（工单固化 `../operations/e2e-walkthrough-checklist.md`，因 F8 所修并发问题上次阻断在步骤 4–9，**待重跑**）；F6② xhigh 复审 5C+3P 全部由 F7 修复。终值门禁：**pytest 124 · vitest 185 · 全 lint/生成物/字段源绿**。剩余顺序已由 2026-07-16 产品重构决策更新，见 `../standard/STATUS.md`。
