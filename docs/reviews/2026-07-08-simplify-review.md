# v2 代码精简审查报告（2026-07-08）

> **性质**：只读审查。**执行状态：批1（`759a472`）+ 批2（`abd00f9`）已执行、门禁全绿；批3 待执行**（需 UI 手工走查，见 §3 精简方案）。
> **独立复审（2026-07-08，Codex xhigh）**：对批1+批2 全部 10 项非机械重构（B4/B7/B8/B9/B10 · C3/C10/C11 · D2/D3/D4/D5）逐条判等价，**零行为变更（无 confirmed/plausible 发现）**——含 B7 run 复用、D3 条件反查、D2 手写 resolver、D4/D5 底色映射等重点项均带 file:line 证据。Codex 未跑门禁（沙箱只读挡 `uv`），门禁由本机已跑绿。
> **范围**：本迭代 16 个 commit（`e6f38a7..814725c`）的新增代码；v1 遗留代码不在范围。
> **方法**：4 个 Fable 审查组并行（后端核心/命令与生成器/前端 experiments-v2/实体库与脚本），
> 统一镜头：过度复杂/无需求防御/为测试牺牲可读性/可减分支抽象/无关改动；
> 每组自跑测试与验证脚本，宿主抽查 5 项关键论断全部属实。
> **约束**：全部建议满足"行为不变、436 测试（后端319+前端117）不变、最小改动"。

## 1. 总体评价

整体质量高于同类元数据驱动系统常见水位：单一源贯彻到位、纯逻辑与框架分层干净、测试锚定业务语义，43 条发现**无一结构性问题**。债务四类：①废弃设计残留簇（死参数/死分支/死兜底）；②迁移报告 `mapped` 计数与实际执行范围错位（唯一实质语义债）；③三处重复（表单三重枚举/xlsx渲染器/§7组件）；④两处聪明过头（启发式驱动字段发现/动态zod resolver）。

## 2. 精简方案（三批）

| 批 | 内容 | 风险 | 状态 |
|---|---|---|---|
| **批1 零风险净赚** | 死代码簇 14 处删除 + `del current_user`→`_current_user`×15 + 4 处注释（100上限/本征占位/experiment_type/stageTypes冻结闸）+ 映射语义注释钉死（YAML头+`_write_v2_payloads` docstring） | 无 | ✅ 已执行 `759a472` |
| **批2 低风险直白化** | 启发式→声明条件反查 · zod resolver→手写 · §7标签改走元数据 · xlsx渲染器提取 `render_field_sheet` · migrate重复加载/形状嗅探/if-elif链 · 生成器拼接残影(需regen同commit) · formula双键兜底删除(前后端同commit) · results-section局部组件 · prop钻透 | 低 | ✅ 已执行 `abd00f9` |
| **批3 单独立项** | `experiment-v2-form.tsx` 三重模块枚举→表驱动 `MODULE_SPECS`（该文件无单测，**必须配合UI手工走查**，建议与俊杰补丁同天） | 中 | ⬜ 待执行 |

**明确不做**：datetime 兜底链收敛、`list_runs` 100上限的行为修复（属行为变更→P6 前决策）、任何 v1 模块。
**执行纪律**：涉及生成器的改动必须"改生成器+重跑+生成物同 commit"；每批完成跑全量门禁（pytest 319 + vitest 117 + check_field_source），任何一红回滚该条。

## 3. 全部发现（按组）

### A组 后端核心（models/services/repository/endpoints）
| # | 位置 | 问题 | 最小修改 | 风险/置信 |
|---|---|---|---|---|
| A1 | v2_service.py:64-91 | `EntityConfig.key` 零读取点，与dict key重复 | 删字段及3处实参 | 无/高 |
| A2 | endpoints/v2.py ×15 | `del current_user` 压lint；v1惯例是 `_current_user` 前缀 | 15处改名删del | 无/高 |
| A3 | v2_service.py:554 | `run.schema_version or SCHEMA_VERSION` 兜底不可达（create显式设置/404过滤/列表过滤） | 去 `or` | 低/高 |
| A4 | v2_service.py:303-304,211; snapshot_service:16,32 | `if version.attrs else None` 防御 nullable=False 列；三处 `or {}` 同族 | 直接 `.get()` | 无-低/高 |
| A5 | v2_service.py:177-198 | `_validate_entity_payload` 对每字段无条件解析condition，required/conditional挤同层 | 按level分if/elif，condition解析入conditional分支（顺序不变） | 无/高 |
| A6 | v2_service.py:325 | `except (ValidationError, ValueError)`——前者是后者子类（venv实证） | `except ValueError` +注释 | 无/高 |
| A7 | v2_service.py:271-282 | `list_runs` 借v1分页取前100条再内存过滤——数据超100后v2列表静默截断 | **只加注释**标注上限假设；真修（仓库层过滤）=行为变更留P6前 | 说明/高 |
| A8 | v2_service.py:261-266 | 硬编码 `structure_type:"本征"` 占位、`experiment_type=SCHEMA_VERSION` 无解释 | 各加一行注释（不改值） | 无/高 |

干净：v2_entities/v2_results 模型、experiment/module_payload 增量（D9合规）、v2_repository、v2_field_source、schemas/v2、15组三胞胎路由显式展开（合惯例）、`_validate_external_field_requirement` 的 `["无"]` 分支（YAML多选形态有据）。

### B组 命令与生成器
| # | 位置 | 问题 | 最小修改 | 风险/置信 |
|---|---|---|---|---|
| B1 | check_r0.py:47,71,84,99,143 | `db` 穿透两层未用+`samples`预载未读+`measured_products`分支不可达（同一废弃设计残留；16个r0字段module_key已枚举验证） | 删参数/预载/分支 | 极低/高 |
| B2 | generate_v2_models.py:315,190 | 死兜底 `_stage_class_name` 永不触发且正则写错（`r"\\W+"` 匹配字面反斜杠） | 删函数，`STAGE_CLASS_NAMES[name]` 直取（漏配即KeyError） | 无/高 |
| B3 | generate_v2_models.py:257,268 | `del doc`/`del field` 占位参数（ruff无ARG规则） | 删形参 | 无/高 |
| B4 | generate_v2_models.py:298（产物:63,99,121） | 生成物含 `'components' + ' is conditionally required'` 拼接残影；类间3空行 | 生成器改f-string字面量+重跑regen同commit | 低/高 |
| B5 | migrate_v1_to_v2.py:520 | 手写 `_missing` 与 `v2_field_source.missing` 逐字重复 | import as | 无/高 |
| B6 ★ | migrate_v1_to_v2.py:371-381,412,437; mapping.yaml | **本轮最重要**：`--execute` 只写 kind=module_payload，11条 entity_field/table_field/run_field 被静默跳过却计入 `mapped`；23种transform名只有 `merge_into_*` 前缀+一个路径后缀有机器语义，其余按copy执行 | 注释钉死（YAML头声明+docstring+分支注释）；**人工执行前须复审**：被跳过11条要不要自动迁、`legacy_stage_to_stage_type` 直拷是否产出不合词表值 | 零(注释)/事实高 |
| B7 | migrate_v1_to_v2.py:98-112 | execute 路径重复 load_mapping+_select_v1_runs 各两次 | 一次取用，内部抽 `_reports_for_runs` | 低/中高 |
| B8 | migrate_v1_to_v2.py:169-182 | `render_text_report` 靠 `"counts" not in report` 嗅探报告形状 | 拆 `render_reconcile_text`，main 按 `args.reconcile` 选 | 低/中高 |
| B9 | migrate_v1_to_v2.py:296-305 | 状态计数4路if/elif；拼错status被无声吞掉 | 模块级dict查表（未知即KeyError） | 低/中 |
| B10 | formula_display.py:29-34 + 前端formula.ts:196-208 | `chemical_formula`/`order` 双键兜底全仓无生产者（components是v2新字段无历史别名） | 前后端同commit删兜底；`render_formula_display` 后端零调用点→docstring注明"参考实现" | 低/兜底无生产者高 |
| B11 | seed_from_field_source.py:136,50,56 | 死 `removesuffix`（上行正则已吞）；`list(list)` 双包 | 删136行；去多余list() | 无/高 |
| B12 | mapping.yaml | `source_path` 恒可派生（但被测试用作比对键，冗余低害）；8条 `path`==`key`；`report_categories` 纯文档无代码读 | 标注"documentation only"即可，低优先 | 零/事实高 |

干净：export_v2_schema、生成物形状（union/`extra=forbid`/`# fmt: off` 均有理由）、双闸+未映射拒绝+归档deepcopy（需求支撑非过度防御）、6个测试文件。

### C组 前端 experiments-v2
| # | 位置 | 问题 | 最小修改 | 风险/置信 |
|---|---|---|---|---|
| C1 | field-logic.ts:37-52 | `IMPLEMENTED_MODULE_KEYS` 等3导出零引用+过期注释 | 删 | 无/高 |
| C2 | field-logic.ts:513 | `pvdHasAnyValue` 纯透传别名 | 删，调用改 `itemHasAnyValue` | 无/高 |
| C3 | field-logic.ts:487-497 | `isPvdFieldRequired` 取到字段自身condition弃之不用，绕道扫模块 | 直接 `matchesCondition(condition, synthesisMethod.trim())` | 低/高 |
| C4 ★ | experiment-v2-form.tsx:204-415 | 同组模块被if/else链枚举3遍（missing/save/create），新增模块改3处 | 表驱动 `MODULE_SPECS`；equipment与run_code回填留特例。**=批3，需手工走查** | 中/中 |
| C5 | experiment-v2-form.tsx:336-345 | createAndSave 内联重做 buildBasicInfoPayload | 复用+覆盖run_code（做C4则被吸收） | 无/高 |
| C6 | experiment-v2-form.tsx:56-80 | `targetProductMissing` 两个同构if块，且是唯一不在field-logic的checker（躲开单测） | 合并分支移入field-logic | 低/中高 |
| C7 | process-steps-section:41; repeatable-items:52 | `emptyStep/emptyItem` 逐行重写已有 `emptyModuleValues` | 删本地函数 | 无/高 |
| C8 | field-logic.ts:279-290 | 编辑态把components数组String成`'[object Object]'`幽灵值，靠4处散点排除维持 | 还原后置空串，顺手删key排除 | 低/中高 |
| C9 | results-section.tsx:150-244 | 加样品控件空态/非空态各写一遍 | 提局部组件 `AddSampleControls` | 无/高 |
| C10 | results-section.tsx + locales | §7 六个字段标签手抄进zh+en locale（违反自家"字段标签不进locale"约定，YAML改后drift） | 改从 `getModuleFields` 取labelZh/labelEn，删12键（method缩短/纯UI文案保留） | 低/诊断高 |
| C11 | results-section.tsx:74-113 | token/enabled prop钻两层（叶子自取useAuth是本仓先例）；`Boolean(runId)` 恒真 | 子组件内部useAuth；删恒真项 | 低/中 |
| C12 | process-steps-logic.test:33 | `toHaveLength(11)` 与"gen:fields自动对齐"承诺矛盾 | 注明"冻结闸：改阶段数需显式确认"（或放宽） | 无/中 |
| C13 | formula.ts:7-126 | 118元素一符号一行占120行（位置本身对——前端专属，不进YAML） | `'H He Li…'.split(' ')` 缩为8行 | 无/高·低优先 |
| C14 | datetime.ts | 互为防御的兜底链（唯一来源是自己） | **不动**（收敛改脏数据行为）；v2数据面冻结后处理 | —/中 |

干净：hasExternalFieldSetup（镜像后端契约）、getModuleOrNull 404-catch（端点契约）、与entity-library复用边界、i18n组织、form-state状态流、纯逻辑与React切割、元数据驱动贯彻。

### D组 实体库+脚本+CI
| # | 位置 | 问题 | 最小修改 | 风险/置信 |
|---|---|---|---|---|
| D1 | ci.yml:98-138 | `generated-artifacts` job 与 backend pytest 的漂移测试完全重复（test_t5_5+test_v2_generators已逐字节比对全部5个产物） | 删整个job（现无required checks约束；drift失败改以pytest断言报出） | 中(需确认CI偏好)/冗余性高 |
| D2 | entity-form.tsx:77-94 | 每次校验重建 `z.object(shape)` + `as unknown as Resolver` 双重断言 | 手写resolver十行等价（buildSubmitPayload会再trim，载荷逐键相同），删zod/@hookform-resolvers两import | 低/高 |
| D3 | entity-library/field-logic.ts:71-80 | ▸子类驱动字段靠"扫枚举含子类token"两层启发式发现——元数据本有显式eq条件可反查 | `cond.op==='eq'&&cond.value===subcategory → resolveConditionKey(kind,cond.field)`（46字段逐一验证等价）；或至少预计算Map | 低-中/中高 |
| D4 | build_field_tables.py:109-189 | 两sheet渲染块40行近逐行重复（样式漏改不会被逐格校验抓到——只比值不比样式） | 提取 `render_field_sheet()`，重跑后逐格校验须绿 | 低/高 |
| D5 | build_field_tables.py:62-79 | `req_fills` 17项字面dict（含1死条目"条件必填(固态源)"）；与req_font的startswith法并存 | 前缀函数 `req_fill()`（17种raw值逐一核对输出不变；注意"必填/选填"现行橙底特例保持） | 低/中高 |
| D6 | entity-detail-page.tsx:89-92 | 相邻两个invalidateQueries，前者被后者前缀匹配覆盖 | 删第一个 | 极低/高 |
| D7 | shared/i18n/ | 示例组件在src/生产目录仅测试引用；`example.*`等死键无生产消费 | 内联进测试或删；死键zh/en同步删 | 低/中 |
| D8 | check_field_source.py:59,137-144 | `import re`在中部；40条截断的嵌套双break可重复打印截断标记 | import上移；sheet循环头`if len(errors)>40: break` | 极低/高 |
| D9 | scripts/generate-field-metadata.ts | 形状在生成器interface与emitted TYPES双写 | type-only import自身产物（或不动） | 低/低 |

干净：api.ts、config.ts、两个页面（锁版语义直白）、测试（真实生成物做基座）、生成物多重门禁（有意冗余）、frontend/field-source两个CI job。

## 4. 与迁移执行的关联（重要）

B6 的人工复审项已并入 P5 执行前检查单：正式 `--execute` 前须逐条决定 ①11 条被跳过条目（如 `characterization.method`、`basic_info.recipe_id`）自动迁与否；②`legacy_stage_to_stage_type` 等直拷条目是否可能产出不合 v2 词表的 `stage_type`。
