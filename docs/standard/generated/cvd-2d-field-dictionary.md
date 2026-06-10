# CVD-2D 工艺数据字段字典 · cvd-2d-process v1.0.0

> module_payload schema 版本：`cvd_v1`　|　字段总数：68

本文件由 FieldDefinition + 受控词表自动生成，请勿手改。

## basic_info

| 字段 | 中文 | 英文 | 类型 | 单位 | 必填 | 词表 | 候选值 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `operator_id` | 操作人 | Operator | select |  | 是 |  |  |
| `experiment_type` | 实验类型 | Experiment Type | select |  | 是 |  |  |
| `material_system` | 材料体系 | Material System | select |  | 是 | material_system | MoS2、WS2、WSe2、MoSe2、hBN、graphene、other |
| `experiment_date` | 实验日期 | Experiment Date | date |  | 是 |  |  |
| `objective` | 实验目的 | Objective | textarea |  |  |  |  |
| `recipe_id` | 来源 Recipe | Source Recipe | select |  |  |  |  |
| `layer_count` | 层数 | Layer Count | select |  |  | layer_count | 1、2、3、多层 |

## environment

| 字段 | 中文 | 英文 | 类型 | 单位 | 必填 | 词表 | 候选值 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `indoor_temperature_C` | 室内温度 | Indoor Temperature | number | ℃ |  |  |  |
| `indoor_humidity_percent` | 室内湿度 | Indoor Humidity | number | % |  |  |  |
| `sample_env` | 样品环境 | Sample Environment | select |  |  | sample_env | clean、normal、contaminated、unknown |
| `abnormal_note` | 异常备注 | Abnormal Note | textarea |  |  |  |  |

## precheck

| 字段 | 中文 | 英文 | 类型 | 单位 | 必填 | 词表 | 候选值 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `seal_intact` | 密封完好 | Seal Intact | boolean |  |  |  |  |
| `hood_clean` | 通风橱清洁 | Hood Clean | boolean |  |  |  |  |
| `flange_blocked` | 法兰口阻塞 | Flange Blocked | boolean |  |  |  |  |
| `boat_contamination_level` | 舟污染程度 | Boat Contamination | boolean |  |  |  |  |
| `tube_contamination_level` | 管污染程度 | Tube Contamination | boolean |  |  |  |  |
| `risk_note` | 风险备注 | Risk Note | textarea |  |  |  |  |

## precursors

| 字段 | 中文 | 英文 | 类型 | 单位 | 必填 | 词表 | 候选值 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `items` | 前驱体列表 | Precursor Items | array |  | 是 |  |  |
| `species` | 物种 | Species | text |  |  |  |  |
| `brand` | 品牌 | Brand | select |  |  | precursor_brand | 阿拉丁、麦克林、国药、Sigma-Aldrich、Alfa Aesar |
| `concentration` | 浓度 | Concentration | number |  |  |  |  |
| `concentration_unit` | 浓度单位 | Concentration Unit | text |  |  |  |  |
| `method` | 制备方法 | Preparation Method | select |  |  | precursor_method | melting、spin_coating、powder、solution、other |
| `melting_temperature_C` | 熔融温度 | Melting Temperature | number | ℃ |  |  |  |
| `spin_speed_rpm` | 旋涂转速 | Spin Speed | number | rpm |  |  |  |
| `spin_time_s` | 旋涂时长 | Spin Time | number | s |  |  |  |
| `pre_spin_speed_rpm` | 预旋涂转速 | Pre-spin Speed | number | rpm |  |  |  |
| `pre_spin_time_s` | 预旋涂时长 | Pre-spin Time | number | s |  |  |  |
| `preparation_time_min` | 制备时长 | Preparation Time | number | min |  |  |  |
| `mass_mg` | 质量 | Mass | number | mg |  |  |  |
| `batch_no` | 批次号 | Batch No | text |  |  |  |  |

## substrates

| 字段 | 中文 | 英文 | 类型 | 单位 | 必填 | 词表 | 候选值 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `items` | 基底列表 | Substrate Items | array |  | 是 |  |  |
| `role` | 角色 | Role | select |  |  | substrate_role | top、bottom、control、product |
| `type` | 类型 | Type | select |  |  | substrate_type | 硅片单抛N<100>、蓝宝石单抛<0001>/<11-20>、蓝宝石单抛<10-10>/<0001>、蓝宝石单抛<11-20>/<0001>、蓝宝石双抛C<0001>、蓝宝石双抛A<11-20>、蓝宝石双抛M<10-10> |
| `brand` | 品牌 | Brand | select |  |  | substrate_brand | 华赫硅材料、合肥科晶、苏州研材微纳科技 |
| `size_mm` | 尺寸 | Size | select | mm |  | substrate_size | 5x5、5x8、5x10、10x10 |
| `batch_no` | 基底批次 | Substrate Batch | text |  |  |  |  |
| `treatment_method` | 处理方法 | Treatment Method | select |  |  | substrate_treatment_method | none、plasma_cleaning、uv_cleaning、annealing |
| `position_mm` | 相对温区位置 | Relative Zone Position | number |  |  |  |  |
| `treatment_temperature_C` | 处理温度 | Treatment Temperature | number | ℃ |  |  |  |
| `treatment_duration_min` | 处理时长 | Treatment Duration | number | min |  |  |  |
| `treatment_power_W` | 处理功率 | Treatment Power | number | W |  |  |  |
| `treatment_gas` | 处理气体 | Treatment Gas | text |  |  |  |  |

## furnace_program

| 字段 | 中文 | 英文 | 类型 | 单位 | 必填 | 词表 | 候选值 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `furnace_info` | 炉子信息 | Furnace Info | object |  | 是 |  |  |
| `placements` | 前驱体放置 | Precursor Placements | array |  |  |  |  |
| `zones` | 温区程序 | Zone Programs | array |  | 是 |  |  |

## gas_program

| 字段 | 中文 | 英文 | 类型 | 单位 | 必填 | 词表 | 候选值 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pre_washing_gas` | 洗炉气体 | Pre-washing Gas | select |  |  | gas_label | Ar、CO2、O2、Ar+H2、Ar+O2、H2+CO2、CO+Ar、air |
| `segments` | 气体段列表 | Gas Segments | array |  | 是 |  |  |
| `stage` | 阶段 | Stage | text |  |  |  |  |
| `gas` | 气体 | Gas | select |  |  | gas_label | Ar、CO2、O2、Ar+H2、Ar+O2、H2+CO2、CO+Ar、air |
| `start_min` | 开始时间 | Start Time | number | min |  |  |  |
| `end_min` | 结束时间 | End Time | number | min |  |  |  |
| `flow_sccm` | 流量 | Flow | number | sccm |  |  |  |
| `components` | 混合组分 | Gas Components | array |  |  |  |  |

## process_observation

| 字段 | 中文 | 英文 | 类型 | 单位 | 必填 | 词表 | 候选值 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `color_change` | 颜色变化 | Color Change | text |  |  |  |  |
| `abnormal_events` | 异常事件 | Abnormal Events | multi_select |  |  |  |  |
| `note` | 备注 | Note | textarea |  |  |  |  |

## characterization

| 字段 | 中文 | 英文 | 类型 | 单位 | 必填 | 词表 | 候选值 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `methods` | 表征方法列表 | Characterization Methods | array |  | 是 |  |  |
| `method` | 方法 | Method | select |  |  | characterization_method | OM、Raman、PL、AFM、SEM、Other |
| `result` | 结果 | Result | text |  |  |  |  |
| `enabled` | 启用 | Enabled | boolean |  |  |  |  |
| `excitation_nm` | 激发波长 | Excitation Wavelength | number | nm |  |  |  |
| `characterization_note` | 备注 | Note | textarea |  |  |  |  |

## result_summary

| 字段 | 中文 | 英文 | 类型 | 单位 | 必填 | 词表 | 候选值 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `summary_result` | 结果摘要 | Summary Result | textarea |  |  |  |  |
| `quality_label` | 质量标签 | Quality Label | select |  |  | quality_label | success、partial、failed、unknown |
| `next_step` | 下一步计划 | Next Step | text |  |  |  |  |
| `failure_modes` | 失败模式 | Failure Modes | multi_select |  |  | failure_mode | no_growth、sparse_nucleation、low_coverage、multilayer、discontinuous、poor_uniformity、wrong_phase、amorphous、contamination、cracked、equipment_fault、other |
| `failure_detail` | 失败说明 | Failure Detail | textarea |  |  |  |  |

