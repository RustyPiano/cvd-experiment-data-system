# CVD 实验数据采集系统下一步开发计划（MVP-0.2 / V1 Beta）

**文档版本**：v0.2  
**日期**：2026-04-23  
**适用对象**：继续开发本项目的代码 Agent / 工程实现负责人  
**依据文档**：
- `IMPLEMENTATION_GAP_REPORT_2026-04-23.md`（当前实现对照报告）
- `AGENT_IMPLEMENTATION_BRIEF.md`
- `cvd_experiment_data_system_design_v1.md`
- 原始 CVD Excel/Markdown 模板

---

## 1. 这份文档的作用

这不是重新写一版完整设计文档，而是把**当前代码现状**转化为**下一轮开发的明确目标**。

本轮目标不是做完整 ELN/LIMS，也不是一次性补齐 design 文档里的全部蓝图，而是把现有 MVP 从“可运行、可测试”推进到“**可部署、可试用、可持续收集真实实验数据**”的阶段。

本轮统一命名为：

```text
MVP-0.2 / V1 Beta
```

该版本完成后，应具备以下属性：

1. 可以通过 Docker Compose 启动完整前后端服务。
2. 可以让 1–2 名真实组员连续试用，而不需要再回退到 Excel 记录主流程。
3. 可以可靠保存 CVD 关键字段，而不是只记录高度裁剪后的最小字段。
4. 可以让“复制上一条实验 / 从历史实验复制 / 提交校验 / 锁定派生”形成完整闭环。
5. 不引入过大范围的架构重构，不破坏当前已通过测试的主干。

---

## 2. 文档优先级与冲突处理

为避免后续继续出现“代码按哪份文档实现”的歧义，本轮开发统一采用以下优先级：

```text
本文件 > AGENT_IMPLEMENTATION_BRIEF.md > 当前代码行为 > cvd_experiment_data_system_design_v1.md
```

解释：

- `cvd_experiment_data_system_design_v1.md` 仍然是长期产品蓝图。
- `AGENT_IMPLEMENTATION_BRIEF.md` 仍然是第一版 MVP 的工程边界参考。
- 当前代码行为只有在本文件没有改动时，才视为默认延续。
- 如果本文件与之前两份文档冲突，以本文件为准。

---

## 3. 当前版本的判断

现有代码已经实现了认证、实验 CRUD、模块化 payload、样品同步、文件上传、单实验导出、审计日志、最小词表 CRUD 等主干能力，因此本轮**不是从零开始重做**。

本轮要做的是四件事：

1. **补可部署性**：把项目从“开发态仓库”变成“实验室内可部署服务”。
2. **补关键字段**：把被过度裁剪的模块字段补回到可用水平。
3. **补关键工作流**：把复制、来源提示、提交校验、过滤检索做完整。
4. **冻结关键语义**：尤其是 clone 规则、API 风格、模块 schema、字段迁移。

---

## 4. 本轮开发目标

### 4.1 本轮必须完成（P0）

1. 完整三服务 Docker Compose：`frontend`、`backend`、`postgres`。
2. `.env.example`、初始化说明、管理员与用户创建说明。
3. 实验列表最小筛选与分页：`mine`、`status`、`material_system`、`q`、`page`、`page_size`。
4. 新建实验页补齐三种入口：
   - 新建空白实验
   - 复制我的最近一条实验
   - 从历史实验复制
5. 编辑页和详情页显示来源实验信息（`derived_from_run_id` / `run_code`）。
6. 明确并实现统一 clone 语义。
7. 补齐关键模块字段：
   - `environment`
   - `precheck`
   - `precursors`
   - `substrates`
   - `gas_program`
   - `characterization`
   - `result_summary`
8. 新增提交前验证接口，返回**逐项错误和警告**。
9. 前端提交前错误汇总与跳转定位。
10. 编辑页增加固定操作区和保存状态展示。
11. 保持并完善自动保存，不因新字段引入回归。
12. 补充 Alembic 迁移与历史 payload 向后兼容。
13. 增加用户命令行管理能力：至少支持 `create_user`、`reset_password`。
14. 扩充最小受控词表 seed。
15. 新增对应测试并保持现有测试全绿。

### 4.2 本轮可选完成（P1）

1. 编辑页增加简易模块导航（锚点/stepper 二选一）。
2. 列表页增加日期范围筛选。
3. 在新建页增加“来源实验摘要卡片”。
4. 样品页增加只读的来源实验信息。
5. 文件上传页增加拖拽上传和多文件选择。
6. `/admin/users` 最小管理页面（如果时间允许）。

### 4.3 本轮明确不做（P2 / 延后）

1. `projects` 实体与页面。
2. `experiment_template_versions` 实体与页面。
3. `recipes` 实体与页面。
4. `characterization_sessions` 实体。
5. `features` 实体与页面。
6. 批量 JSONL / CSV / ZIP 导出。
7. 历史 Excel 导入。
8. 字段字典后台。
9. 完整 diff API 与字段级来源对比。
10. API 全量 envelope 化重构。
11. 完整左侧 stepper / tabs / features 区等重 UI 重构。
12. 自动特征提取、AI 推荐、仪器自动接入。

---

## 5. 本轮冻结的关键决策

### 5.1 保持当前技术栈，不做替换

继续使用：

- Frontend: React + TypeScript + Vite + Ant Design + TanStack Query
- Backend: FastAPI + SQLAlchemy 2.x + Alembic + PostgreSQL
- File storage: 本地文件系统

本轮**不要**替换为：

- Vue
- Django
- MongoDB
- Supabase
- Firebase
- 纯 JSON 文件存储

### 5.2 API 风格保持当前资源风格，不做全量重构

当前 API 已经稳定可用，本轮不要求把全部接口改为 `{data, message}` 风格。

本轮约束：

1. **现有接口保持兼容**，不要大规模破坏前端。
2. 新增接口也沿用当前简洁资源风格。
3. 仅对“提交校验失败”这类场景补充结构化错误详情。

也就是说：

- 不做全项目 envelope 改造。
- 不做全项目错误码体系重构。
- 但要让前端能拿到足够细的 validation details。

### 5.3 `process_observation` 模块保留

尽管最早的 brief 没有把它列为模块 key，但当前代码已经实现，且它符合真实实验记录需求。

因此从本轮开始，模块集合固定为：

```text
basic_info
environment
precheck
precursors
substrates
furnace_program
gas_program
process_observation
characterization
result_summary
```

### 5.4 本轮不实现完整 Recipe，但要把 clone 入口做好

Recipe 管理和 Recipe 实体延后。

本轮不做：

- `/recipes`
- 从 Recipe 创建
- Recipe CRUD

本轮要做的是：

- 复制我的最近一条实验
- 从历史实验复制
- 来源实验提示
- clone 语义冻结

### 5.5 编辑器继续用当前卡片式结构，不强制重写成完整 stepper

当前编辑器虽然不如设计文档中的正式版精细，但已经可用。

因此本轮原则是：

- 保留当前“按模块的连续卡片”编辑器结构。
- 补充固定操作区、保存状态、来源 banner、模块导航。
- 不要求整页重构为完整左侧 stepper + 右侧工作区。

---

## 6. 本轮核心语义：clone 规则

这一部分必须严格执行，并补充测试固化。

### 6.1 clone 来源范围

允许的来源：

1. **复制我的最近一条实验**：默认从当前用户最近一条 `submitted` 或 `locked` 实验复制。
2. **从历史实验复制**：允许从以下实验复制：
   - 当前用户的 `submitted` / `locked` 实验
   - 其他用户的 `locked` 实验

不允许从以下状态复制：

- `draft`
- `invalid`

### 6.2 clone 后新实验基本规则

clone 生成的新实验必须：

- 生成新的 `id`
- 生成新的 `run_code`
- `status = draft`
- `owner_id = 当前登录用户`
- `derived_from_run_id = 来源实验 id`
- 写入审计日志

### 6.3 clone 时各模块复制规则

#### `basic_info`

复制以下字段：

- `experiment_type`
- `material_system`
- `objective`

重置以下字段：

- `operator_id = 当前登录用户`
- `experiment_date = 今天`
- `project_id = null`（本轮无实体，统一清空）

#### `environment`

复制：

- `sample_env`

清空：

- `indoor_temperature_C`
- `indoor_humidity_percent`
- `abnormal_note`

原因：温湿度和非常规操作备注属于本次实验现场记录，不应直接继承。

#### `precheck`

全部重置为空/未填写状态，不复制。

原因：实验前检查是本次实验必须重新确认的现场检查。

#### `precursors`

完整复制。

#### `substrates`

完整复制，并继续触发 top/bottom 样品同步逻辑。

#### `furnace_program`

完整复制。

#### `gas_program`

完整复制。

#### `process_observation`

不复制。

#### `characterization`

**复制为计划，不复制结果内容。**

具体规则：

- 保留 `method`
- 保留 `enabled`
- 保留 `excitation_nm`
- 保留 `note`
- 清空 `result`

#### `result_summary`

重置为：

- `quality_label = unknown`
- `summary_result = ""`
- `next_step = ""`

#### 文件与审计

- 不复制任何文件
- 不复制任何审计记录

### 6.4 前端来源提示要求

在编辑页与详情页显示：

```text
本实验派生自 CVD-2026-0012
```

并补一句说明：

```text
已复制工艺参数；环境检查、异常备注、过程观察与结果总结已重置，请重新确认。
```

本轮**不要求**做字段级 diff 视图。

---

## 7. 本轮模块 schema 目标

以下 schema 不是理论愿景，而是本轮要真正保存、读取、编辑、验证的结构。

### 7.1 `basic_info`

```json
{
  "operator_id": "uuid",
  "experiment_type": "cvd_2zone",
  "material_system": "MoS2",
  "experiment_date": "2026-04-23",
  "objective": "探索温度对形貌的影响"
}
```

说明：

- 本轮不引入真实 `project_id` / `recipe_id` 编辑。
- `experiment_type`、`material_system` 保持可编辑。

### 7.2 `environment`

```json
{
  "indoor_temperature_C": 25,
  "indoor_humidity_percent": 45,
  "sample_env": "clean",
  "abnormal_note": ""
}
```

要求：

- `indoor_humidity_percent` 必须在前端可见、可编辑、可保存。
- draft 阶段允许空值。

### 7.3 `precheck`

```json
{
  "hood_clean": true,
  "flange_blocked": false,
  "boat_contamination_level": 0,
  "tube_contamination_level": 0,
  "seal_intact": true,
  "risk_note": ""
}
```

约束：

- `boat_contamination_level` / `tube_contamination_level` 采用整数枚举 `0, 1, 2, 3`。
- `seal_intact = false` 时，`risk_note` 必填。

### 7.4 `precursors`

```json
{
  "items": [
    {
      "role": "A",
      "type": "MoO3",
      "brand": "",
      "concentration": null,
      "concentration_unit": "",
      "method": "melting",
      "melting_temperature_C": null,
      "spin_speed_rpm": null,
      "pre_spin_speed_rpm": null,
      "preparation_time_min": null,
      "mass_mg": null,
      "batch_no": ""
    }
  ]
}
```

要求：

- 前端至少支持新增/删除 precursor item。
- 保留 `role = A/B` 的默认选项，但底层不要写死只能 2 个。
- 根据 `method` 显示条件字段：
  - `melting` -> `melting_temperature_C`
  - `spin_coating` -> `spin_speed_rpm`, `pre_spin_speed_rpm`, `preparation_time_min`

### 7.5 `substrates`

```json
{
  "items": [
    {
      "role": "top",
      "type": "硅片单抛N<100>",
      "brand": "华赫硅材料",
      "size_mm": "5x10",
      "treatment_method": "plasma_cleaning",
      "treatment_params": {
        "temperature_C": null,
        "duration_min": null,
        "power_W": null,
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
      "treatment_params": {
        "temperature_C": null,
        "duration_min": null,
        "power_W": null,
        "gas": ""
      },
      "position_mm": -1
    }
  ]
}
```

要求：

- 本轮 UI 保持以 `top` / `bottom` 为主，不扩展复杂角色。
- 保存时继续同步 top/bottom 样品。
- `treatment_params` 必须真正持久化。

### 7.6 `furnace_program`

沿用当前结构：

```json
{
  "zones": [
    {
      "zone_index": 1,
      "precursor_placed": true,
      "note": "",
      "temperature_program": [
        {"time_min": 0, "temperature_C": 25},
        {"time_min": 30, "temperature_C": 750}
      ]
    }
  ]
}
```

本轮不增加文本快捷输入解析。

### 7.7 `gas_program`

```json
{
  "pre_washing_gas": "Ar+H2",
  "segments": [
    {
      "stage": "pre_washing",
      "gas": "Ar+H2",
      "start_min": -10,
      "end_min": 0,
      "flow_sccm": 100,
      "components": [
        {"name": "Ar", "flow_sccm": null},
        {"name": "H2", "flow_sccm": null}
      ],
      "note": ""
    }
  ]
}
```

要求：

- 保留当前 `segments` 结构。
- 新增 `components` 和 `note`。
- `components` 在 UI 中可以简化编辑；对常见混合气标签可自动填充默认组件名。
- `flow_sccm` 为用户输入流量（sccm），`fraction` 由系统根据各组件流量之和自动计算并显示为占比。

### 7.8 `process_observation`

沿用当前结构：

```json
{
  "color_change": "",
  "abnormal_events": [],
  "note": ""
}
```

本轮不增加复杂字段。

### 7.9 `characterization`

```json
{
  "methods": [
    {
      "method": "OM",
      "enabled": true,
      "excitation_nm": null,
      "note": "",
      "result": ""
    },
    {
      "method": "Raman",
      "enabled": true,
      "excitation_nm": 532,
      "note": "",
      "result": ""
    }
  ]
}
```

说明：

- 保留现有 `result` 字段，避免丢掉当前实现。
- 新增 `enabled`、`excitation_nm`、`note`。
- `OM` / `AFM` / `SEM` 的 `excitation_nm` 可为 `null`。

### 7.10 `result_summary`

```json
{
  "quality_label": "unknown",
  "summary_result": "",
  "next_step": ""
}
```

说明：

- 延续现有 `summary_result` key，避免迁移复杂度。
- `quality_label` 同步写入 `experiment_runs.quality_label` 列，作为查询字段。

---

## 8. 数据迁移与向后兼容

本轮不得假设数据库是全新空库，必须考虑已有测试数据和试用数据。

### 8.1 Alembic 迁移要求

需要新增迁移，确保以下字段结构可持久化：

1. `experiment_runs.quality_label` 继续保留并可同步。
2. 现有 payload 不会因新 schema 而无法读取。
3. 新增的 payload 字段在旧数据中允许缺失。

### 8.2 payload 向后兼容策略

旧记录读出时，后端或前端应进行默认值补齐，例如：

- `environment.indoor_humidity_percent` 缺失 -> `null`
- `precheck.hood_clean` 缺失 -> `null`
- `precursors.items[].brand` 缺失 -> `""`
- `substrates.items[].treatment_params` 缺失 -> 默认空对象
- `gas_program.segments[].components` 缺失 -> `[]`
- `characterization.methods[].enabled` 缺失 -> `true`
- `result_summary.quality_label` 缺失 -> `unknown`
- `result_summary.next_step` 缺失 -> `""`

### 8.3 clone 对旧数据的兼容

如果来源实验是旧 payload：

- clone 逻辑也必须能正常运行。
- 缺失字段先按默认值补齐，再应用 clone 规则。

---

## 9. 提交校验与错误返回

### 9.1 新增验证接口

新增接口：

```text
POST /api/v1/experiments/{id}/validate
```

返回示例：

```json
{
  "ok": false,
  "errors": [
    {
      "module_key": "precheck",
      "field_path": "risk_note",
      "message": "密封圈不完好时必须填写风险说明"
    }
  ],
  "warnings": [
    {
      "module_key": "precursors",
      "field_path": "items[0].batch_no",
      "message": "前驱体未填写批号，后续追溯能力会受影响"
    }
  ]
}
```

### 9.2 `submit` 行为要求

`POST /api/v1/experiments/{id}/submit` 的要求：

- 如果校验通过：提交成功。
- 如果存在阻塞错误：返回 `422`，body 与 `validate` 相同。
- 前端不得只显示一句笼统的 `Submit validation failed`。

### 9.3 本轮阻塞错误

提交时必须阻止：

1. 没有 `experiment_date`。
2. 没有 `operator_id`。
3. `precursors.items` 为空。
4. `furnace_program.zones` 为空。
5. 某温区 `temperature_program` 为空。
6. 温区时间点不严格递增。
7. `gas_program.segments` 中 `end_min <= start_min`。
8. `gas_program.segments` 时间区间重叠。
9. `seal_intact = false` 且 `risk_note` 为空。
10. 文件记录缺少 `method`。
11. 文件记录缺少 `experiment_id`。

### 9.4 本轮警告项

提交时显示警告但不阻止：

1. 室内温度不在 `15–35℃`。
2. 室内湿度为空或不在 `0–100%`。
3. `boat_contamination_level > 2`。
4. `tube_contamination_level > 2`。
5. 任一 precursor 的 `batch_no` 为空。
6. 文件未关联 sample。
7. `result_summary.quality_label = unknown`。

---

## 10. 前端交互要求（本轮版）

### 10.1 新建实验页

必须提供三个真实可用入口：

#### 入口 A：新建空白实验

行为：

- 直接创建 `draft`
- 跳转编辑页

#### 入口 B：复制我的最近一条实验

行为：

- 查询当前用户最近一条 `submitted` / `locked` 实验
- 若存在，调用 clone
- 若不存在，提示“暂无可复制的历史实验”

#### 入口 C：从历史实验复制

行为：

- 打开对话框或侧边抽屉
- 支持最小搜索与筛选：`q`、`mine`、`status`、`material_system`
- 选择来源实验后调用 clone

### 10.2 编辑页

继续使用当前卡片式模块布局，但必须补上：

1. 顶部来源实验 banner（如果有来源）。
2. 顶部或底部固定操作区，至少包含：
   - 保存状态
   - 提交
   - 返回详情
3. 模块导航：锚点导航或简化 stepper 二选一。
4. 提交前错误汇总面板，点击可跳转到模块。
5. locked / submitted 状态下显式只读提示。

### 10.3 保存状态

保存状态至少显示以下四种：

```text
未保存修改
保存中…
已保存 14:32
保存失败
```

### 10.4 页面离开保护

本轮至少实现：

- 如果仍有保存中的请求，阻止无提示离开页面。
- 如果保存失败且存在未持久化修改，提示用户。

---

## 11. 列表与检索要求

### 11.1 后端查询参数

扩展：

```text
GET /api/v1/experiments?mine=true&status=draft,submitted&material_system=MoS2&q=750&page=1&page_size=20
```

### 11.2 列表返回结构

保持当前风格，扩展为：

```json
{
  "items": [],
  "total": 120,
  "page": 1,
  "page_size": 20
}
```

### 11.3 前端列表页最低要求

1. 搜索框 `q`
2. 状态筛选
3. 我的实验开关
4. 材料体系筛选
5. 分页
6. 操作列至少包含：查看 / 继续填写 / 导出 JSON / 导出 Excel

本轮不做批量导出。

---

## 12. 部署与运维要求

### 12.1 Docker 化要求

仓库中必须新增：

- `backend/Dockerfile`
- `frontend/Dockerfile`
- 可工作的 `docker-compose.yml`

### 12.2 Compose 服务要求

服务至少包括：

- `postgres`
- `backend`
- `frontend`

建议增加：

- 持久化 volume
- `storage` volume

### 12.3 启动要求

以下命令应能跑通：

```bash
docker compose up --build
```

可接受的行为：

- frontend 可访问
- backend 可访问
- backend 连接数据库成功
- Alembic 迁移可运行

### 12.4 用户初始化要求

本轮不要求内置硬编码管理员账号。

改为以下方式：

1. 保留 `create_admin` 命令。
2. 新增 `create_user` 命令。
3. 新增 `reset_password` 命令。
4. 在 README 中明确写出命令用法。

---

## 13. 受控词表与 seed 要求

至少确保以下 vocab key 在系统中有初始数据：

```text
material_system
sample_env
precursor_method
substrate_type
substrate_treatment_method
gas_label
characterization_method
quality_label
```

推荐最小 seed 值：

### `material_system`

- MoS2
- WS2
- MoSe2
- WSe2
- hBN
- graphene
- other

### `sample_env`

- clean
- normal
- contaminated
- unknown

### `precursor_method`

- melting
- spin_coating
- powder
- solution
- other

### `substrate_treatment_method`

- none
- plasma_cleaning
- annealing
- solvent_cleaning
- other

### `gas_label`

- Ar
- CO2
- O2
- Ar+H2
- Ar+O2
- H2+CO2
- CO+Ar

### `characterization_method`

- OM
- Raman
- PL
- AFM
- SEM
- Other

### `quality_label`

- success
- partial
- failed
- unknown

---

## 14. 测试要求

本轮提交前必须满足：

### 14.1 后端新增测试

至少覆盖：

1. clone 新语义
2. validate 接口
3. submit 失败返回详细错误
4. payload 默认值补齐
5. `quality_label` 同步行为
6. 查询筛选与分页
7. 新字段持久化与迁移兼容

### 14.2 前端新增测试

至少覆盖：

1. 新建页三种入口
2. 来源 banner 显示
3. 提交错误面板展示
4. 关键新字段编辑与自动保存
5. 结果总结中的 `quality_label` 编辑
6. 列表筛选与分页

### 14.3 质量门禁

保留并继续满足：

- backend: `pytest`
- backend: `ruff check`
- backend: `ruff format --check`
- frontend: `test`
- frontend: `lint`
- frontend: `typecheck`

---

## 15. 交付物要求

本轮结束时，Agent 必须提交：

1. 更新后的代码。
2. Alembic 迁移。
3. `docker-compose.yml` 与 Dockerfile。
4. `.env.example`。
5. README 中的本地启动说明。
6. README 中的 Docker 启动说明。
7. 用户初始化命令说明。
8. 一份新的对照报告，说明：
   - 本轮完成了哪些 P0
   - 哪些 P1 暂未完成
   - 哪些决定被固化
   - 仍然未做的后续项

---

## 16. 推荐实现顺序

Agent 请按以下顺序开发，避免大范围返工：

### 阶段 1：部署与命令行能力

1. Dockerfile
2. docker-compose
3. `.env.example`
4. `create_user` / `reset_password`

### 阶段 2：后端 schema 扩展与迁移

1. payload schema 扩展
2. validate 接口
3. submit 错误详情
4. 列表筛选与分页
5. clone 语义改造

### 阶段 3：前端新建与编辑工作流

1. 新建页三入口
2. 来源 banner
3. 新字段表单
4. 提交错误汇总
5. 固定操作区与保存状态

### 阶段 4：词表与文档

1. 补 seed
2. 更新 README
3. 补测试
4. 输出新对照报告

---

## 17. 本轮完成后的验收标准

以下条件全部满足，才可视为 MVP-0.2 完成：

1. `docker compose up --build` 可启动完整系统。
2. 管理员可以通过命令创建 1–2 个普通用户。
3. 普通用户可以登录并新建实验。
4. 新建页三种入口都真实可用。
5. clone 后来源信息可见，且 clone 行为符合本文件第 6 节。
6. 关键新增字段可以保存、刷新后不丢失。
7. 提交失败时，前端能看到逐项错误和警告。
8. `quality_label` 可以在 UI 中编辑，并反映到列表查询字段。
9. 现有与新增测试全部通过。
10. README 足够让非开发者在实验室机器上部署并试用。

---

## 18. 本轮之后的下一阶段候选项（不要在本轮提前做）

只有在 MVP-0.2 试用稳定后，才进入下一阶段。

候选项包括：

1. `recipes` 与从 Recipe 创建
2. `projects`
3. `characterization_sessions`
4. `features`
5. 批量导出
6. Excel 导入
7. `/admin/users`
8. `/admin/fields`
9. 简易 diff 视图
10. 更完整的页面布局升级

---

## 19. 给 Agent 的执行要求

请严格按本文件推进，不要自行扩大范围。

### 必须遵守

1. 不要重写技术栈。
2. 不要全量重构 API 风格。
3. 不要提前实现 Recipe / Projects / Features / Import。
4. 不要为了追求“更优雅”而推翻当前已通过测试的主干。
5. 每完成一个阶段，都保证测试可运行。

### 输出格式要求

每次阶段性提交，请说明：

1. 完成内容
2. 修改的关键文件
3. 如何运行
4. 如何验证
5. 当前仍未解决的问题
