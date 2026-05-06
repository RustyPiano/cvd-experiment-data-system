# CVD 实验数据采集系统 — 易用性优化设计

**日期**：2026-04-28
**状态**：已确认
**范围**：方案 A — 渐进式优化
**前置文档**：`cvd_experiment_data_system_design_v1.md`、`AGENT_IMPLEMENTATION_BRIEF.md`、`DESIGN.md`

---

## 1. 设计目标

针对科研用户日常使用中的不畅快，在不重构整体架构的前提下，通过 7 项渐进改进同时提升**填写效率**和**数据查看**体验：

| 编号 | 优化项 | 类型 | 优先级 |
|---|---|---|---|
| O1 | Recipe 管理与"从 Recipe 创建" | 填写效率 | P0 |
| O2 | 智能默认值 | 填写效率 | P1 |
| O3 | 温区/气体快捷模板 | 填写效率 | P1 |
| O4 | 渐进式完成度指示 | 填写效率 | P1 |
| O5 | 实验列表 Dashboard 化 | 数据查看 | P1 |
| O6 | 列表页快捷操作 | 数据查看 | P2 |
| O7 | 编辑器 Diff 视图 | 数据查看 | P1 |

每项改进独立可交付、独立可测试。

---

## 2. O1：Recipe 管理与"从 Recipe 创建"

### 2.1 背景与动机

连续做相似实验是最高频场景。当前系统只有"空白创建"和"从历史实验复制"两种迁移路径，缺少**标准工艺模板**。研究者做 MoS2 标准两区工艺时，每次都要从头填写或选择某条历史实验复制——但历史实验的结果和异常会干扰选择。

Recipe 是设计文档中规划但延期的 P1 功能，是整个优化方案的核心减负手段。

### 2.2 数据模型

`experiment_runs` 表已预留 `recipe_id` 列（UUID，可空，无外键约束），但 `recipes` 实体尚未落地。本次需新建此表及对应的模型、迁移、Repository、Service 和 API。

Recipe 表 schema 如下：

| 字段 | 说明 |
|---|---|
| `id` | UUID |
| `name` | Recipe 名称，如 `MoS2 标准两区工艺` |
| `template_version_id` | 适用模板版本（V1 可固定为唯一 CVD 模板） |
| `project_id` | 所属项目（可空） |
| `material_system` | 材料体系 |
| `default_payload_json` | 默认参数 JSON |
| `description` | 说明 |
| `created_by` | 创建人 |
| `is_active` | 是否启用 |

**`default_payload_json` 结构**（Recipe 只覆盖工艺参数模块，不覆盖环境检查、过程观察和结果）：

```json
{
  "precursors": {
    "items": [
      {
        "species": "MoO3",
        "brand": "",
        "method": "melting",
        "mass_mg": null,
        "batch_no": ""
      }
    ]
  },
  "substrates": {
    "items": [
      {
        "role": "top",
        "type": "硅片单抛N<100>",
        "brand": "华赫硅材料",
        "size_mm": "5x10",
        "treatment_method": "plasma_cleaning",
        "treatment_params": {
          "temperature_C": null,
          "duration_min": 5,
          "power_W": 100,
          "gas": ""
        },
        "position_mm": 1
      },
      {
        "role": "bottom",
        "type": "硅片单抛N<100>",
        "brand": "合肥科晶",
        "size_mm": "5x10",
        "treatment_method": "plasma_cleaning",
        "treatment_params": {},
        "position_mm": -1
      }
    ]
  },
  "furnace_program": {
    "zones": [
      {
        "zone_index": 1,
        "precursor_placed": true,
        "temperature_program": [
          {"time_min": 0, "temperature_C": 25},
          {"time_min": 30, "temperature_C": 750},
          {"time_min": 45, "temperature_C": 750},
          {"time_min": 90, "temperature_C": 25}
        ],
        "note": ""
      },
      {
        "zone_index": 2,
        "precursor_placed": true,
        "temperature_program": [
          {"time_min": 0, "temperature_C": 25},
          {"time_min": 30, "temperature_C": 200}
        ],
        "note": ""
      }
    ]
  },
  "gas_program": {
    "pre_washing_gas": "Ar+H2",
    "segments": [
      {
        "stage": "pre_washing",
        "start_min": -10,
        "end_min": 0,
        "gas": "Ar+H2",
        "components": [
          {"name": "Ar", "flow_sccm": 95},
          {"name": "H2", "flow_sccm": 5}
        ],
        "flow_sccm": 100,
        "note": ""
      },
      {
        "stage": "growth",
        "start_min": 0,
        "end_min": 45,
        "gas": "Ar",
        "components": [{"name": "Ar", "flow_sccm": 80}],
        "flow_sccm": 80,
        "note": ""
      }
    ]
  },
  "characterization": {
    "methods": [
      {"method": "OM", "enabled": true, "note": ""},
      {"method": "Raman", "enabled": true, "excitation_nm": 532, "note": ""}
    ]
  }
}
```

### 2.3 后端 API

#### 管理端点（Admin）

```
GET    /api/v1/admin/recipes          — 列表（支持 material_system 和 is_active 筛选）
POST   /api/v1/admin/recipes          — 创建 Recipe
GET    /api/v1/admin/recipes/:id      — 获取单个 Recipe
PATCH  /api/v1/admin/recipes/:id      — 更新 Recipe（部分字段）
DELETE /api/v1/admin/recipes/:id      — 软停用（设 is_active=false）
```

#### 公开端点

```
GET    /api/v1/recipes                — 列出活跃 Recipe（非 admin 也可调用，供前端新建入口使用）
GET    /api/v1/recipes/:id            — 获取单个活跃 Recipe
```

#### 从 Recipe 创建实验

```
POST   /api/v1/experiments/from-recipe
Body:  { "recipe_id": "uuid", "experiment_date?": "2026-04-28", "objective?": "..." }
Response: ExperimentRead (draft)
```

逻辑：
1. 校验 Recipe 存在且 `is_active=true`。
2. 创建 draft 实验，`experiment_type="cvd_2zone"`，`recipe_id=recipe.id`。
3. 从 Recipe 的 `default_payload_json` 中提取各模块 key 对应的 payload，逐个调用 `upsert_module`。
4. 不覆盖的模块（`basic_info`, `environment`, `precheck`, `process_observation`, `result_summary`）保持空白或默认值。
5. `basic_info` 自动设置 `operator_id=当前用户`，`experiment_date=今天或请求指定`。
6. 返回新实验的完整数据。

#### 从已有实验保存为 Recipe

```
POST   /api/v1/experiments/:id/save-as-recipe
Body:  { "name": "MoS2 标准两区", "description?": "..." }
Response: RecipeRead (新创建的 Recipe)
```

逻辑：
1. 校验实验存在且状态为 submitted 或 locked。
2. 从实验的模块 payload 中提取 `precursors`, `substrates`, `furnace_program`, `gas_program`, `characterization` 五个模块的 payload。
3. 清除模块中与具体实验相关的字段（如 `batch_no`, `mass_mg` 等批次相关内容置空）。
4. 组装为 `default_payload_json`。
5. 创建 Recipe 记录，设置 `created_by`, `material_system`, `template_version_id`。
6. 记录审计日志。

### 2.4 前端页面

#### Recipe 管理页 `/admin/recipes`

- 左侧：Recipe 分类/筛选（按 `material_system` 筛选）
- 右侧：Recipe 列表卡片
  - 每张卡片：名称、材料体系、描述、创建人、创建时间、"应用"按钮
- 创建/编辑 Modal：
  - 名称、材料体系（VocabularyCombobox）、描述
  - 各模块 JSON 编辑（V1 可先用简化的 JSON 编辑器，后续改为结构化表单）
  - 从已有实验导入按钮（选择实验，自动填充模块）

#### 新建实验页改造

第 3 张卡片"从 Recipe 创建"激活：
- 点击后展示活跃 Recipe 列表（按 `material_system` 分组）
- 选择一个 Recipe 后，显示预填模块摘要
- 确认后调用 `POST /experiments/from-recipe`，跳转到编辑器

#### 实验详情页

在"操作"区域增加"保存为 Recipe"按钮（仅 submitted/locked 状态显示）：
- 打开 Modal，输入 Recipe 名称和描述
- 系统自动提取工艺参数模块 payload
- 确认后创建 Recipe

---

## 3. O2：智能默认值

### 3.1 逻辑

新建空白实验时（"空白 CVD 实验"入口）：
1. 前端请求 `GET /api/v1/experiments?mine=true&status=draft,submitted,locked&page=1&page_size=1&sort_by=updated_at&sort_order=desc`。
2. 如果存在历史实验，提取其 `environment` 和 `precheck` 模块。
3. 创建空白实验后，前端自动将这两个模块的 payload 写入新实验。
4. 在对应模块卡片上显示"继承自 CVD-2026-XXYY，请确认"提示条。

### 3.2 不覆盖的字段

- `environment.abnormal_note`：永远清空（新实验的异常应重新记录）
- `precheck` 的所有三态字段：重置为 `null`（表示"未检查"）
- `precheck.risk_note`：清空

### 3.3 前端交互

- 编辑器 `environment` 和 `precheck` 卡片顶部显示蓝色 info Alert："以下参数继承自 CVD-2026-XXYY，开始新实验时已自动填入。请确认或修改。"
- 编辑后 Alert 消失或变为"已修改"状态。

---

## 4. O3：温区/气体快捷模板

### 4.1 机制

在编辑器的 `furnace_program` 和 `gas_program` 模块顶部各增加一个"快捷模板"下拉按钮。

下拉选项来源：
- 系统内置模板（硬编码在前端 constants 文件中）
- 用户自定义 Recipe 中的对应模块（从 `GET /api/v1/recipes` 获取）

### 4.2 内置模板

**温区模板：**

| 模板名 | 内容 |
|---|---|
| MoS2 标准两区 | Zone1: [0→750@30min, hold 15min, cool]; Zone2: [0→200@30min] |
| WS2 标准两区 | Zone1: [0→750@30min, hold 20min, cool]; Zone2: [0→250@30min] |
| hBN 标准两区 | Zone1: [0→1300@30min, hold 20min]; Zone2: [0→500@20min] |
| 空白两区 | Zone1: [{0, 25}]; Zone2: [{0, 25}] |

**气体模板：**

| 模板名 | 内容 |
|---|---|
| Ar 洗气 + Ar 生长 | pre_washing Ar+H2 100sccm (-10~0), growth Ar 80sccm (0~45) |
| 纯 Ar 生长 | growth Ar 100sccm (0~45) |
| Ar+H2 生长 | pre_washing Ar+H2 100sccm (-10~0), growth Ar 50sccm + H2 10sccm (0~60) |

### 4.3 行为

- 选择模板后，前端将 payload 填入对应模块并触发 auto-save。
- 模板填入后，模块卡片显示"已应用模板：MoS2 标准两区，请确认或修改"提示条。
- 用户可继续编辑，模板提示在用户修改后变为"已修改"。

---

## 5. O4：渐进式完成度指示

### 5.1 Stepper 每步指示

每个 stepper 步骤旁边显示完成状态：

```
● 基本信息    ██████░░░░ 70%
● 环境与检查  ████░░░░░░ 40%
● 前驱体      ✓ 已完成
● 基底        ✓ 已完成
● 温区        ⚠ 有警告
● 气体        ✓ 已完成
● 过程观察    ░░░░░░░░░░ 未填写
● 表征与文件  ██████░░░░ 60%
● 结果总结    ✗ 有错误
● 提交        —
```

完成度计算规则（前端轻量版）：

| 模块 | 完成度规则 |
|---|---|
| basic_info | experiment_date ✓ + material_system ✓ = 100%; 缺一个 = 50% |
| environment | humidity ✓ + temperature ✓ = 100%; 缺一个 = 50%; 空 = 0% |
| precheck | 所有三态字段不为 null = 100%; 有 null = 50%; 全 null = 0% |
| precursors | 至少 1 条且有 species ✓ + method ✓ = 100%; 有条但缺字段 = 50%; 无条 = 0% |
| substrates | 至少 1 条且有 type ✓ + role ✓ = 100%; 有条但缺字段 = 50%; 无条 = 0% |
| furnace_program | 至少 1 zone 且每个 zone 有 ≥2 个时间点 ✓ = 100%; 有 zone 但时间点不够 = 50%; 无 zone = 0% |
| gas_program | 至少 1 segment ✓ + flow > 0 ✓ = 100%; 有段但缺字段 = 50%; 无段 = 0% |
| process_observation | 有内容 = 100%; 空 = 0% (不阻塞提交，但影响分数) |
| characterization | 至少 1 method enabled = 100%; 无 method = 0% |
| result_summary | quality_label ≠ unknown = 100%; unknown = 0% |

错误和警告标记：
- 调用后端 `validate` 后，将 errors 和 warnings 映射到对应模块。
- 有 errors 的模块显示红色 ✗ 标记。
- 有 warnings 的模块显示黄色 ⚠ 标记。

### 5.2 总体进度条

在编辑器操作栏增加总完成度：

```
总完成度 72% · 已完成 7/10 模块 · 阻塞问题 1 · 提示项 3
```

点击百分比展开详细子模块列表，可跳转到对应模块。

---

## 6. O5：实验列表 Dashboard 化

### 6.1 设计

在 `/experiments` 页面顶部增加任务概览区：

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────────────────┐
│ 我的草稿         │ │ 待提交          │ │ 最近编辑                            │
│ 3 条             │ │ 2 条            │ │ CVD-2026-0015 草稿 MoS2 04/28 14:30│
│ [查看全部 →]      │ │ [查看全部 →]   │ │ CVD-2026-0014 草稿 WS2  04/27 09:15│
│                  │ │                │ │ CVD-2026-0013 提交 hBN  04/26 16:40│
└─────────────────┘ └─────────────────┘ └─────────────────────────────────────┘
```

- **我的草稿**：统计当前用户 status=draft 的实验数量，点击跳转到 `status=draft&mine=true`。
- **待提交**：统计当前用户 status=submitted 的实验数量，点击跳转到 `status=submitted&mine=true`。
- **最近编辑**：最近 3 条 updated_at 最新的当前用户实验，每条显示 run_code、material_system、status badge、更新时间，点击跳转详情。

### 6.2 后端

复用现有 `GET /api/v1/experiments` 端点，前端发 3 个并行请求：
1. `?mine=true&status=draft&page=1&page_size=1` → 取 `total` 作为草稿数
2. `?mine=true&status=submitted&page=1&page_size=1` → 取 `total` 作为待提交数
3. `?mine=true&sort_by=updated_at&sort_order=desc&page=1&page_size=3` → 取最近 3 条

无需新后端端点。

---

## 7. O6：列表页快捷操作

### 7.1 设计

实验列表表格的操作列改为优先级更明确的设计：

| 状态 | 主操作 | 下拉菜单 |
|---|---|---|
| draft | `继续填写` (链接到编辑) | 导出 JSON · 导出 Excel · 作废 |
| submitted | `查看` (链接到详情) | 锁定 · 派生 · 导出 JSON · 导出 Excel |
| locked | `查看` (链接到详情) | 派生 · 导出 JSON · 导出 Excel |
| invalid | `查看` (链接到详情) | 导出 JSON |

草稿状态的"提交"按钮不在列表行内——提交是重大动作，应在编辑器中经过验证确认后才执行。

### 7.2 确认弹窗

列表页快捷操作中涉及锁定和派生时需弹出确认弹窗：
- 锁定确认：`锁定实验 {run_code}？锁定后不可修改，只能派生新实验。此操作会写入审计日志。`
- 派生确认：`将派生实验 {run_code} 的参数为新草稿。确定继续？`

---

## 8. O7：编辑器 Diff 视图

### 8.1 触发条件

当实验有 `derived_from_run_id`（从历史实验克隆）时，编辑器顶部 `ExperimentSourceBanner` 旁增加"查看差异"按钮。从 Recipe 创建的实验没有来源实验可对比，不触发 Diff（Recipe Diff 可作为后续增强）。

### 8.2 实现方案

选择**前端实现**：
- 两个实验的 module payload 数据量不大（每个模块几百字节到几 KB）
- 前端已有当前实验的完整模块数据，来源实验只需额外请求一次 `GET /api/v1/experiments/{derived_from_run_id}/modules`

**Diff 算法：**
- 对每个模块 key，对比 `payload_json` 的每个字段。
- 数组类型字段（如 `precursors.items`, `furnace_program.zones`, `gas_program.segments`）按索引逐一对比。
- 标量字段直接对比。
- 标记：新增（蓝色）、修改（黄色）、删除（红色）、相同（灰色/折叠）。

### 8.3 UI 设计

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 参数差异对比                                      [折叠相同] [关闭]    │
├────────────────────────────────────────────────────────────────────────────┤
│ 前驱体                                                     ▼ 展开  │
│   种类 A    来源: MoO3         当前: WO3          [已修改]           │
│   品牌A     来源: (空)         当前: Aladdin       [新增]             │
│   ...                                                                       │
│ 温区                                                       ▼ 展开  │
│   Zone 1 最高温  来源: 750℃    当前: 800℃         [已修改]           │
│   ...                                                                       │
│ 基底                                                       ▲ 相同  │
│ 气体                                                       ▲ 相同  │
└────────────────────────────────────────────────────────────────────────────┘
```

- 默认折叠相同模块，展开有差异的模块。
- 提供全局"折叠所有相同"切换。
- 修改和新增的字段高亮显示。

---

## 9. 实现顺序

| 阶段 | 优化项 | 预估工作量 | 依赖 |
|---|---|---|---|
| Phase 1 | O1 Recipe 管理 | 5-6 天 | 需新建 recipes 表及完整 CRUD + 前端页面 |
| Phase 1 | O5 Dashboard 卡片 | 1-2 天 | 无新后端，纯前端 |
| Phase 2 | O2 智能默认值 | 1-2 天 | 依赖前端编辑器 hook 改造 |
| Phase 2 | O4 完成度指示 | 2-3 天 | 前端 stepper 改造 + 进度条 |
| Phase 3 | O3 快捷模板 | 2-3 天 | 内置模板定义 + 前端下拉组件 |
| Phase 3 | O6 列表快捷操作 | 1-2 天 | 前端表格改造 |
| Phase 4 | O7 Diff 视图 | 3-4 天 | 前端对比组件 + 数据获取 |
| **合计** | | **15-22 天** | |

---

## 10. 验收标准

### O1 Recipe 管理与"从 Recipe 创建"

- [ ] Admin 可以创建、编辑、停用 Recipe
- [ ] Recipe 列表支持按 material_system 筛选
- [ ] 新建实验页"从 Recipe 创建"卡片可选择活跃 Recipe
- [ ] 从 Recipe 创建的实验 status=draft，包含 Recipe 的工艺参数模块
- [ ] 从 Recipe 创建的实验不包含环境检查、过程观察和结果
- [ ] 详情页"保存为 Recipe"按钮可提取已有实验的工艺参数模块
- [ ] Recipe 创建和实验创建均有审计日志

### O2 智能默认值

- [ ] 新建空白实验时，environment 和 precheck 模块自动填入当前用户最近实验的值
- [ ] `abnormal_note` 和 `risk_note` 不被继承
- [ ] precheck 所有字段重置为 null（未检查）
- [ ] 继承提示条在用户修改后消失

### O3 温区/气体快捷模板

- [ ] 温区模块显示"快捷模板"下拉
- [ ] 气体模块显示"快捷模板"下拉
- [ ] 选择内置模板后对应模块被自动填充
- [ ] 选择 Recipe 模板后对应模块被自动填充
- [ ] 模板应用后显示确认提示条

### O4 渐进式完成度指示

- [ ] Stepper 每步显示完成度百分比或状态图标
- [ ] 有 errors 的模块显示红色标记
- [ ] 有 warnings 的模块显示黄色标记
- [ ] 总进度条显示百分比、完成模块数、阻塞错误数
- [ ] 点击进度条可跳转到对应模块
- [ ] 模块保存后完成度自动刷新

### O5 Dashboard 化

- [ ] 实验列表页顶部显示 3 张统计卡片
- [ ] 我的草稿卡片数字准确，点击跳转筛选后的列表
- [ ] 待提交卡片数字准确
- [ ] 最近编辑显示最近 3 条实验，点击跳转详情

### O6 列表页快捷操作

- [ ] Draft 行主操作为"继续填写"
- [ ] Submitted 行主操作为"查看"，下拉包含"锁定"和"派生"
- [ ] Locked 行主操作为"查看"，下拉包含"派生"
- [ ] 锁定和派生操作有确认弹窗

### O7 Diff 视图

- [ ] 编辑器顶部显示"查看差异"按钮（仅当有 derived_from_run_id 时）
- [ ] 点击打开 Diff Modal
- [ ] Diff Modal 按模块分组显示参数差异
- [ ] 修改的字段黄色高亮，新增的字段蓝色高亮
- [ ] 相同模块默认折叠
- [ ] 提供全局"折叠所有相同"切换

---

## 11. 不在本次优化范围内

1. 移动端优先的表单简化
2. 批量导出（JSONL/CSV/ZIP）
3. Excel 历史数据导入工具
4. 多实验任意对比（仅做 clone 来源 diff）
5. 用户管理后台 `/admin/users`
6. 字段字典动态 schema 引擎
7. Characterization session 与 Feature 数据模型
8. 文件内联预览和批量上传
9. 实验详情页参数 Tab 改造