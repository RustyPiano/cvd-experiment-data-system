> ⚠️ **已归档 · 仅历史（v1/早期设想，不代表现状）。** 现行真相见仓库 `docs/standard/STATUS.md`；字段以 `docs/standard/字段草案-v3.xlsx` 为准。归档于 2026-07-06。

# CVD-2D 工艺数据标准 (CVD-2D Process Data Standard) — v0.1 (草案 / DRAFT)

> 状态:**DRAFT**,供内部审阅,尚未冻结。
> 版本:`0.1.0`(对应数据载荷 `schema_version = cvd_v1`)
> 适用范围:化学气相沉积(CVD)法生长二维材料的**工艺参数 → 结果(含失败)** 数据。
> 本文档既是给人看的规范,也是后续自动生成机读 JSON Schema 的唯一权威来源。

---

## 0. 这份文档是什么 / 不是什么

- **是**:一本精确的、带版本号的"字段字典 + 规则书"。它规定每条实验记录由哪些模块、哪些字段构成,每个字段的含义、单位、类型、取值范围、是否必填,以及彼此关系。任何机构只要照它产数据,数据就互相兼容、可合并、可喂给模型。
- **不是**:不是软件文档,也不绑定本系统的某次实现。本系统(FastAPI + React App)是这份标准的**参考实现**之一,而非标准本身。

设计目标对齐国际科研数据通行框架 **FAIR**(可发现 / 可访问 / 可互操作 / 可复用),其中我们把最难的 **可复用(Reusable)** 当作首要目标——它依赖"丰富且一致的元数据",这正是本标准的核心。

---

## 1. 设计原则

| # | 原则 | 含义 |
|---|------|------|
| P1 | **失败即数据(True Negative)** | 失败 / 中断的实验**必须**作为正式记录保存,不得丢弃。公开材料库普遍缺失"尝试过且失败"的真负样本,这是本标准的核心差异化与最大价值。 |
| P2 | **`null` ≠ `0`** | 空值 = 未测量 / 未记录;显式 `0` = 测得为零。表单与导入器**不得**把空白强制转成 0。二者在统计与建模中含义完全不同。 |
| P3 | **设定值 vs 实测值** | v0.1 中所有温度 / 流量等过程量均为**设定值(目标值)**。实测值(`*_measured`)为 v0.2 预留。数据使用方据此无歧义解读。 |
| P4 | **单位显式且权威** | 每个数值字段的单位由字段字典(`unit`)权威定义,并随导出一并输出,不依赖字段名后缀的隐含约定。 |
| P5 | **单一权威 + 防漂移** | 字段字典(`FieldDefinition`)是**对外发布的规范层**;运行时校验由 Pydantic schema 承担;两者之间用**一致性测试**强制对齐,杜绝"三套真相"漂移(见 §6)。 |
| P6 | **对接而非重造** | 复用 FAIR / OPTIMADE / DataCite / EMMO 既有生态;只对"CVD-2D 工艺 + 失败"这一真正空白自建词表。 |

---

## 2. 版本与治理

- **语义化版本**:`MAJOR.MINOR.PATCH`。
  - MAJOR:不兼容的字段删除 / 语义变更。
  - MINOR:向后兼容的新增字段 / 新增受控词表取值。
  - PATCH:文字、标签、描述修订,不改数据形态。
- 数据载荷携带 `schema_version`(当前 `cvd_v1`),与本规范版本通过映射表对应(`cvd_v1 ↔ 0.1.x`)。
- **受控核心 + 登记扩展**:核心字段集由本规范统一管理;机构特有的扩展字段须加机构前缀(参照 OPTIMADE 的 `_provider_` 机制,如 `_pku_chamber_pressure_pa`),不得污染核心命名空间。
- **演进治理**(借鉴 CIF/COMCIFS 的成功经验):推广期设一个轻量"标准维护小组",负责审核字段增改;近期(协作组阶段)以 PI 间的轻量协议替代正式委员会。

---

## 3. 数据模型总览

一条实验记录(Experiment Run)= 一个炉次 = 标准的最小单元,由以下部分组成:

```
ExperimentRun (run_code 唯一标识)
├── 实验级标量 (一等列, 可索引/可查询)
│     experiment_type · material_system · experiment_date · status · outcome
├── 10 个工艺/结果模块 (module payload, 按 module_key 存储, schema_version=cvd_v1)
│     basic_info · environment · precheck · precursors · substrates
│     furnace_program · gas_program · process_observation · characterization · result_summary
├── Samples (样品, 含谱系 parent_sample_id —— 可追溯)
├── FileAssets (原始/派生文件: setup diagram · 表征文件 · 导入源表)
└── Versions + Audit (不可变版本快照 + 审计日志 —— 溯源)
```

**模块清单:**

| module_key | 中文 | 形态 | 说明 |
|---|---|---|---|
| `basic_info` | 基础信息 | 对象 | 操作人、类型、材料体系、日期、目的 |
| `environment` | 环境条件 | 对象 | 室温、湿度、样品环境 |
| `precheck` | 预检查 | 对象 | 密封、清洁、污染等开炉前检查 |
| `precursors` | 前驱体 | **数组** `items[]` | 每种前驱体一条 |
| `substrates` | 基底 | **数组** `items[]` | 每片基底一条,可生成样品 |
| `furnace_program` | 炉温程序 | 对象(含数组) | 炉信息 + 放置 + 各温区升温程序 |
| `gas_program` | 气体程序 | 对象(含数组) | 洗炉气 + 各气体段(含混合组分) |
| `process_observation` | 过程观察 | 对象 | 颜色变化、异常事件 |
| `characterization` | 表征结果 | **数组** `methods[]` | 每种表征方法一条 + 文件 |
| `result_summary` | 结果总结 | 对象 | **结果/失败模型所在(见 §7)** |

---

## 4. 数值与单位约定

- 单位以字段字典 `unit` 为准(℃ / % / sccm / mg / rpm / min / W / mm / nm 等),导出时随每个数值字段输出。
- **`null` ≠ `0`**(原则 P2):缺失即 `null`;测得为零才填 `0`。
- 时间统一以**分钟(min)**为基准;温度以**摄氏度(℃)**;气体流量以 **sccm**。
- **待修(v0.1)**:`substrate.size_mm` 当前为字符串(如 "5x10"),无法数值化分析 → 改为结构化数值(`length_mm` × `width_mm`,或拆分),并与受控词表 `substrate_size` 对齐。
- `concentration` + `concentration_unit` 为显式单位字段(浓度单位异构,如 mol/L、wt%),使用方需按 `concentration_unit` 归一。
- **未来对接**:单位字符串将映射到 QUDT / EMMO 单位本体,以实现跨库互操作(v0.2+)。

---

## 5. 受控词表(Controlled Vocabularies)

分类型字段的取值受控,保证一致性。**当前权威取值**(以系统种子为准):

| vocab_key | 取值 | 用户可扩展 |
|---|---|---|
| `material_system` | MoS2, WS2, MoSe2, WSe2, hBN, graphene, other | 否 |
| `sample_env` | clean, normal, contaminated, unknown | 否 |
| `precursor_method` | melting, spin_coating, powder, solution, other | 否 |
| `precursor_brand` | (实验室录入) | **是** |
| `substrate_role` | top, bottom（产物/对照在样品层) | 否 |
| `substrate_type` | 硅片单抛N<100>、蓝宝石单抛<0001>/<11-20> 等(见系统) | 否 |
| `substrate_brand` | 华赫硅材料, 合肥科晶, 苏州研材微纳科技 … | **是** |
| `substrate_size` | 5x5, 5x8, 5x10, 10x10 | 否 |
| `substrate_treatment_method` | none, plasma_cleaning, uv_cleaning, annealing | 否 |
| `gas_label` | Ar, CO2, O2, Ar+H2, Ar+O2, H2+CO2, CO+Ar, air | 否 |
| `characterization_method` | OM, Raman, PL, AFM, SEM, Other | 否 |
| `quality_label` | success, partial, failed, unknown(将被 §7 的 `outcome_category` 取代) | 否 |
| **`failure_mode`** | **(v0.1 新增,见 §7)** | 否 |

> 用户可扩展词表(`precursor_brand` / `substrate_brand`)允许成员录入新值;但仅 MEMBER/ADMIN 可写(VIEWER 只读)。

---

## 6. 单一权威与防漂移(原则 P5 的落地)

系统当前对"字段定义"有**三处**,会漂移:

1. **`FieldDefinition` 表** — 描述字段(单位/类型/词表/必填/中英标签),当前仅用于前端表单。
2. **Pydantic `module_payload` schema** — 运行时**实际**校验权威。
3. **`payload_json`** — 实际存储的数据。

**v0.1 收敛方案:**

- 保留 **Pydantic 为运行时校验权威**(严格、有测试、可靠)。
- 将 **`FieldDefinition` 升级为"对外发布规范层"**:本规范文档与机读 JSON Schema 均由它生成。
- 增加 **一致性测试**:断言"每个 Pydantic 字段都有对应字段定义,且类型/单位/必填一致",CI 中强制,防止任一处单独漂移。

**当前已发现、v0.1 必须修复的漂移项:**

| # | 漂移 | 现状 | v0.1 处理 |
|---|------|------|-----------|
| D1 | 基底处理参数 | 字段字典是扁平 `treatment_*`;Pydantic 是嵌套 `treatment_params{}` | 统一为**嵌套**(与已存数据一致),更新字段字典 |
| D2 | `furnace_info` 类型 | 字段字典标 `field_type:"object"`,但类型枚举无 `object` | 在 `FieldType` 增加 `OBJECT`,或改为 `array`/拆分 |
| D3 | 表征备注 | 字段字典 `characterization_note` vs 载荷 `note` | 统一字段名 |
| D4 | 层数 | Pydantic `basic_info.layer_count` 存在,字段字典缺失 | 补字段定义 |
| D5 | 旋涂时间 | `spin_time_s` / `pre_spin_time_s` | 确认字段定义已随迁移补齐 |
| D6 | 尺寸类型 | `size_mm` 为字符串 | 改结构化数值(见 §4) |
| D7 | 质量标签 | `quality_label`(扁平) | 迁移到 `outcome_category` + `failure_mode`(§7) |

---

## 7. 结果 / 失败模型(v0.1 核心新增)

> 这是本标准相对现有公开数据库的**核心差异化**。当前系统只有一个扁平的 `quality_label`,信息量不足。v0.1 在 `result_summary` 模块扩展为结构化的结果模型。

**`result_summary` 扩展字段:**

| 字段 | 类型 | 单位 | 必填 | 说明 |
|---|---|---|---|---|
| `outcome_category` | select(`outcome_category`) | — | **是** | 取代 `quality_label`,见下表 |
| `failure_modes` | multi_select(`failure_mode`) | — | 当 failed/partial 时必填 | 失败模式分类,可多选 |
| `failure_detail` | textarea | — | 否 | 结构化"为什么失败"的文字补充 |
| `coverage_percent` | number | % | 否 | 覆盖率(可量化结果) |
| `observed_layer_count` | number | — | 否 | 实测层数 |
| `summary_result` | textarea | — | 否 | 自由文字总结(保留) |
| `next_step` | text | — | 否 | 下一步计划(保留) |

**`outcome_category` 取值:**

| 值 | 含义 | 与旧 `quality_label` 映射 |
|---|---|---|
| `success` | 达到实验目标 | success |
| `partial` | 有产物但未达标 | partial |
| `failed` | **完成了实验流程但结果不符** —— 真负样本,最有价值 | failed |
| `aborted` | 过程中断 / 设备故障,**非材料学结论** | (新增,旧无) |
| `unknown` | 未判定 | unknown |

> 关键区分:`failed`(工艺跑完了但没长好 → 对建模是宝贵的真负样本) vs `aborted`(炉子坏了 → 不能当材料学失败)。两者混淆会污染训练集。

**`failure_mode` 受控词表(v0.1 新增):**

| 值 | 中文 |
|---|---|
| `no_growth` | 无生长 |
| `discontinuous` | 不连续膜 / 覆盖不全 |
| `multilayer` | 多层 / 厚度失控 |
| `wrong_phase` | 物相错误 |
| `wrong_morphology` | 形貌异常 |
| `small_domain` | 畴区过小 |
| `low_crystallinity` | 结晶质量差 |
| `contamination` | 沾污 |
| `substrate_damage` | 基底损坏 |
| `equipment_failure` | 设备故障(配合 aborted) |
| `other` | 其他 |

**强制规则(原则 P1):**
- `failed` / `aborted` 的炉次**必须**作为正式记录保存,系统不得将其当作可丢弃的草稿。
- 这是"真负样本"的唯一来源——失败数据现在不记录,将永久丢失,无法补录。

---

## 8. 字段字典(Field Dictionary)

完整字段清单。`必填`列为规范层声明;`词表`列指向 §5。标 ⚠ 的为 §6 的待修漂移项。

### 8.1 basic_info — 基础信息
| 字段 | 中文 / EN | 类型 | 单位 | 必填 | 词表 |
|---|---|---|---|---|---|
| operator_id | 操作人 / Operator | select | | ✔ | (用户) |
| experiment_type | 实验类型 / Experiment Type | select | | ✔ | |
| material_system | 材料体系 / Material System | select | | ✔ | material_system |
| experiment_date | 实验日期 / Experiment Date | date | | ✔ | |
| objective | 实验目的 / Objective | textarea | | | |
| recipe_id | 来源 Recipe / Source Recipe | select | | | |
| layer_count ⚠D4 | 目标层数 / Layer Count | text | | | layer_count |

### 8.2 environment — 环境条件
| 字段 | 中文 / EN | 类型 | 单位 | 必填 | 词表 |
|---|---|---|---|---|---|
| indoor_temperature_C | 室内温度 / Indoor Temperature | number | ℃ | | |
| indoor_humidity_percent | 室内湿度 / Indoor Humidity | number | % | | |
| sample_env | 样品环境 / Sample Environment | select | | | sample_env |
| abnormal_note | 异常备注 / Abnormal Note | textarea | | | |

### 8.3 precheck — 预检查
| 字段 | 中文 / EN | 类型 | 单位 | 必填 | 词表 |
|---|---|---|---|---|---|
| seal_intact | 密封完好 / Seal Intact | boolean | | | |
| hood_clean | 通风橱清洁 / Hood Clean | boolean | | | |
| flange_blocked | 法兰口阻塞 / Flange Blocked | boolean | | | |
| boat_contamination_level | 舟污染 / Boat Contamination | boolean | | | |
| tube_contamination_level | 管污染 / Tube Contamination | boolean | | | |
| risk_note | 风险备注 / Risk Note | textarea | | | |

### 8.4 precursors — 前驱体(数组 `items[]`,每条)
| 字段 | 中文 / EN | 类型 | 单位 | 必填 | 词表 |
|---|---|---|---|---|---|
| species | 物种 / Species | text | | | |
| brand | 品牌 / Brand | text | | | precursor_brand |
| concentration | 浓度 / Concentration | number | (见单位列) | | |
| concentration_unit | 浓度单位 / Concentration Unit | text | | | |
| method | 制备方法 / Preparation Method | select | | | precursor_method |
| melting_temperature_C | 熔融温度 / Melting Temperature | number | ℃ | | |
| spin_speed_rpm | 旋涂转速 / Spin Speed | number | rpm | | |
| spin_time_s ⚠D5 | 旋涂时间 / Spin Time | number | s | | |
| pre_spin_speed_rpm | 预旋涂转速 / Pre-spin Speed | number | rpm | | |
| pre_spin_time_s ⚠D5 | 预旋涂时间 / Pre-spin Time | number | s | | |
| preparation_time_min | 制备时长 / Preparation Time | number | min | | |
| mass_mg | 质量 / Mass | number | mg | | |
| batch_no | 批次号 / Batch No | text | | | |

### 8.5 substrates — 基底(数组 `items[]`,每条)
| 字段 | 中文 / EN | 类型 | 单位 | 必填 | 词表 |
|---|---|---|---|---|---|
| role | 角色 / Role | select | | | substrate_role |
| type | 类型 / Type | select | | | substrate_type |
| brand | 品牌 / Brand | text | | | substrate_brand |
| size_mm ⚠D6 | 尺寸 / Size | text→数值 | mm | | substrate_size |
| treatment_method | 处理方法 / Treatment Method | select | | | substrate_treatment_method |
| position_mm | 位置 / Position | number | mm | | |
| treatment_params ⚠D1 | 处理参数(嵌套) / Treatment Params | object | | | |
| └ temperature_C | 处理温度 | number | ℃ | | |
| └ duration_min | 处理时长 | number | min | | |
| └ power_W | 处理功率 | number | W | | |
| └ gas | 处理气体 | text | | | |

### 8.6 furnace_program — 炉温程序
| 字段 | 中文 / EN | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| furnace_info ⚠D2 | 炉子信息 / Furnace Info | object | ✔ | `zones_count` · `model` · `initial_temperatures_C{}` |
| placements | 前驱体放置 / Placements | array | | 每条:`precursor_index` · `zone_key` · `position_cm` · `note` |
| zones | 温区程序 / Zones | array | ✔ | 每条:`zone_key` · `temperature_program[]` · `note` |
| └ temperature_program[] | 升温节点 | array | | 每节点:`node_index` · `time_min` · `temperature_C` · `note` |

### 8.7 gas_program — 气体程序
| 字段 | 中文 / EN | 类型 | 单位 | 必填 | 词表 |
|---|---|---|---|---|---|
| pre_washing_gas | 洗炉气体 / Pre-washing Gas | select | | | gas_label |
| segments | 气体段 / Segments | array | | ✔ | |
| └ stage | 阶段 / Stage | text | | | |
| └ start_min | 开始时间 / Start | number | min | | |
| └ end_min | 结束时间 / End | number | min | | |
| └ gas | 气体 / Gas | select | | | gas_label |
| └ flow_sccm | 流量 / Flow | number | sccm | | |
| └ components[] | 混合组分 / Components | array | | | 每条:`name`·`gas`·`flow_sccm`·`fraction`·`ratio_percent` |

### 8.8 process_observation — 过程观察
| 字段 | 中文 / EN | 类型 | 词表 |
|---|---|---|---|
| color_change | 颜色变化 / Color Change | text | |
| abnormal_events | 异常事件 / Abnormal Events | multi_select | |
| note | 备注 / Note | textarea | |

### 8.9 characterization — 表征结果(数组 `methods[]`,每条)
| 字段 | 中文 / EN | 类型 | 单位 | 词表 |
|---|---|---|---|---|
| method | 方法 / Method | select | | characterization_method |
| result | 结果 / Result | text | | |
| enabled | 启用 / Enabled | boolean | | |
| excitation_nm | 激发波长 / Excitation | number | nm | |
| note ⚠D3 | 备注 / Note | textarea | | |

### 8.10 result_summary — 结果总结(含 §7 结果模型)
见 §7。字段:`outcome_category`(✔)· `failure_modes` · `failure_detail` · `coverage_percent` · `observed_layer_count` · `summary_result` · `next_step`。

---

## 9. 导出与互操作

- **`cvd_analysis_v1`(已实现)**:把嵌套 payload 摊平成扁平长表(tidy data)——precursor_rows / substrate_rows / furnace_temperature_rows / gas_segment_rows 等,每行带 `run_code` 等上下文外键,可直接拼成 ML 训练集。
- **批量导出(v0.1 待补)**:新增按条件筛选后整批导出的端点(流式 NDJSON / 合并行集),复用现有 `build_analysis_export`。
- **可查询性(v0.1 待补)**:对 `payload_json` 建 GIN 索引并开放若干 JSONB 过滤查询,实现"按炉温 / 前驱体 / 气体筛选"。
- **单位随出**:导出时附带字段字典中的 `unit`,下游无需重建单位映射。
- **未来生态对接(v0.2+)**:OPTIMADE `_prefix_` 导出;字段映射到 EMMO / CIF;数据集版本化发布 + DataCite DOI。

---

## 10. 合规性(什么叫"符合 cvd_v1")

一份数据被视为 **cvd_v1 兼容**,当且仅当:
1. 以"一炉次 = 一条记录"组织,带唯一 `run_code`;
2. 模块字段、类型、单位、必填项符合 §8 字段字典;
3. 分类字段取值在 §5 受控词表内(或带机构前缀的合法扩展);
4. 遵守 §1 原则(尤其 P1 失败留存、P2 `null`≠`0`、P4 单位显式);
5. 通过由本规范生成的机读 JSON Schema 校验。

---

## 11. 路线图 / 待定

- **v0.1 落地项**:修复 §6 漂移(D1–D7);实现 §7 结果/失败模型;补单位输出、批量导出、JSONB 查询。
- **v0.2 候选**:实测值字段(`*_measured`);`size_mm` 数值化完成;QUDT/EMMO 单位映射;OPTIMADE 导出。
- **推广期**:多机构 + 分级共享(private→组→联盟→public)+ 禁运期 + DOI/署名;轻量治理小组。
- **开放问题**:
  - `substrate_role` 与样品 `role`(top/bottom/product/control)的精确对应需确认。
  - 旧词表残留(`substrate_treatment` / `gas` 等早期 key)是否需清理。
  - `concentration_unit` 是否收敛为受控词表。

---

*本草案由对现有系统(models / schemas / field_definitions / 受控词表种子)的逐字段审阅生成,非凭空设计。审阅通过后,§6 的一致性测试与 §7 的结果模型将作为 v0.1 的首批实现项。*
