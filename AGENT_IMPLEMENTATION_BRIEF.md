# CVD 实验数据采集系统：Agent 实现补充说明

**用途**：本文件用于补齐 `cvd_experiment_data_system_design_v1.md` 与 `DESIGN.md` 中偏工程落地的空白，便于让代码 Agent 从空仓库开始实现第一版可用系统。

---

## 1. 实现结论

可以让 Agent 开始实现，但需要先锁定以下默认决策，避免 Agent 自行选择技术栈、接口风格和数据结构。

第一版目标不是完整 ELN/LIMS，而是一个能在课题组内真实使用的 CVD 实验数据采集 Web 应用。

---

## 2. 固定技术栈

### 2.1 前端

- React + TypeScript + Vite
- Ant Design 作为基础组件库
- React Router 管理路由
- TanStack Query 管理服务端数据请求和缓存
- React Hook Form + Zod 管理表单和前端校验
- 使用 `DESIGN.md` 中的 design tokens 覆盖 Ant Design 主题

### 2.2 后端

- FastAPI
- SQLAlchemy 2.x
- Alembic 数据库迁移
- PostgreSQL
- Pydantic v2
- python-jose 或 PyJWT 处理 JWT
- `pwdlib + Argon2id` 处理密码哈希
- openpyxl 处理 Excel 导出
- python-multipart 处理文件上传

### 2.3 文件存储

V1 使用本地文件系统：

```text
storage/
  experiments/
    CVD-2026-0001/
      raw/
      processed/
```

数据库中只保存文件 metadata、路径、hash，不把文件二进制直接存入数据库。

### 2.4 部署

- Docker Compose
- 服务包括：frontend、backend、postgres
- V1 可在实验室工作站或局域网服务器部署

---

## 3. V1 实现边界

### 3.1 必须实现

1. 登录/登出/当前用户。
2. 初始化管理员账号。
3. 实验列表。
4. 新建空白 CVD 实验。
5. 复制上一条实验。
6. 从历史实验复制。
7. CVD V1 表单：基本信息、环境检查、前驱体、基底、温区、气体、表征、结果总结。
8. 自动保存草稿。
9. 提交实验。
10. 锁定实验。
11. 作废实验。
12. 审计日志。
13. JSON 导出。
14. Excel 导出。
15. 基础文件上传：OM、Raman、PL、AFM、SEM 文件可上传并关联实验、样品、方法。
16. 样品自动编号。
17. 管理后台：受控词表的最小 CRUD。
18. Recipe 管理：创建、编辑、停用、从 Recipe 创建实验、从实验保存为 Recipe。
19. 实验填写易用性优化：空白实验智能继承、温区/气体快捷模板、完成度指示、列表 Dashboard 与快捷操作、clone 来源 Diff 视图。

### 3.2 第一版不实现

1. 自动图像识别。
2. Raman/PL 文件自动解析。
3. AI 工艺推荐。
4. 多机构权限。
5. 复杂审批流。
6. Parquet/RO-Crate 数据集导出。
7. QR code 打印。
8. 仪器自动采集。

---

## 4. 页面范围

### 4.1 必须页面

```text
/login
/experiments
/experiments/new
/experiments/:id/edit
/experiments/:id
/experiments/:id/files
/samples/:id
/admin/vocabularies
/admin/recipes
/admin/fields
```

### 4.2 暂缓页面

```text
/admin/templates
/admin/users
```

字段词典（`/admin/fields`）已实现，定义了每个实验模块字段的元数据：field_key、类型、单位、必填、可继承、关联词表。种子数据覆盖 9 个模块共 78 个字段。

---

## 5. 用户与权限默认规则

### 5.1 角色

```text
admin
member
viewer
```

### 5.2 权限

- admin：可查看和管理所有实验，可锁定/作废任意实验，可管理受控词表。
- member：可创建实验，可编辑自己的 draft，可提交/锁定自己的实验，可查看自己的实验。
- viewer：只能查看 submitted/locked 实验，不能编辑。

### 5.3 第一版可简化

- 默认所有 member 可以查看其他人的 submitted/locked 实验。
- member 不可编辑他人实验。
- locked 实验任何人不可直接编辑，只能 clone。

---

## 6. 实验状态规则

```text
draft -> submitted -> locked
draft -> invalid
submitted -> invalid
locked -> invalid
locked -> clone as draft
```

### 6.1 draft

- owner 和 admin 可编辑。
- 自动保存开启。
- 可上传文件。
- 可以修正 `experiment_date`，但 `run_code` 保持创建时的历史编号，不随日期变化。

### 6.2 submitted

- 默认只读。
- owner/admin 可以执行“退回草稿”或“锁定”。
- 任何修改必须写 audit log。

### 6.3 locked

- 只读。
- 只能复制为新实验。
- 可以标记 invalid，但不能物理删除。

### 6.4 invalid

- 默认列表隐藏。
- 详情页显示明显作废提示。
- 需要填写作废原因。

---

## 7. 编号规则

### 7.1 实验编号

格式：

```text
CVD-YYYY-NNNN
```

示例：

```text
CVD-2026-0001
```

规则：

- 按年份递增。
- 由后端生成，前端不生成。
- 数据库需要唯一约束。

### 7.2 样品编号

格式：

```text
S-YYYY-NNNN-ROLE
```

示例：

```text
S-2026-0001-TOP
S-2026-0001-BOTTOM
S-2026-0001-PRODUCT
```

V1 默认每个实验至少生成：

- TOP：上基底
- BOTTOM：下基底

如果没有实际下基底，可允许禁用或标记 unused。

---

## 8. 数据库实现要求

基于设计文档中的 DDL，但 Agent 需要补充：

1. 所有 UUID 默认由数据库或后端生成。
2. 所有主表增加 `updated_at`。
3. 对常用查询字段建立索引。
4. `experiment_module_payloads` 对 `(experiment_run_id, module_key)` 建唯一索引。
5. `file_assets.sha256` 不强制全局唯一，但同一实验内重复文件要提示。
6. 不做物理删除实验。
7. 文件删除应标记 `deleted_at`，不要立即删除磁盘文件。
8. 样品删除也应保留数据库行；基底同步移除 `TOP/BOTTOM` 样品时标记 `deleted_at/deleted_by_id`，默认查询隐藏，后续重新出现同一角色时恢复原行，避免 `sample_code` 唯一约束冲突。
9. 所有状态变化写入 `audit_events`。

### 8.1 必须索引

```sql
CREATE INDEX idx_experiment_runs_owner ON experiment_runs(owner_id);
CREATE INDEX idx_experiment_runs_status ON experiment_runs(status);
CREATE INDEX idx_experiment_runs_date ON experiment_runs(experiment_date);
CREATE INDEX idx_experiment_runs_material ON experiment_runs(material_system);
CREATE INDEX idx_module_payloads_run ON experiment_module_payloads(experiment_run_id);
CREATE INDEX idx_samples_run ON samples(experiment_run_id);
CREATE INDEX ix_samples_deleted_by_id ON samples(deleted_by_id);
CREATE INDEX idx_files_run ON file_assets(experiment_run_id);
CREATE INDEX idx_files_sample ON file_assets(sample_id);
CREATE INDEX idx_audit_entity ON audit_events(entity_type, entity_id);
```

---

## 9. CVD V1 模块 schema

V1 不要求做动态表单引擎，但所有模块保存为 JSON payload。

### 9.1 module keys

```text
basic_info
environment
precheck
precursors
substrates
furnace_program
gas_program
characterization
result_summary
```

### 9.2 basic_info

```json
{
  "operator_id": "uuid",
  "experiment_date": "2026-04-22",
  "project_id": "uuid or null",
  "material_system": "MoS2",
  "experiment_type": "cvd_2zone",
  "objective": "探索温度对形貌的影响"
}
```

### 9.3 environment

```json
{
  "indoor_temperature_C": 25,
  "indoor_humidity_percent": 45,
  "sample_env": "clean",
  "abnormal_note": ""
}
```

### 9.4 precheck

```json
{
  "seal_intact": null,
  "hood_clean": null,
  "flange_blocked": null,
  "boat_contamination_level": null,
  "tube_contamination_level": null,
  "risk_note": ""
}
```

预检查项统一为三态：`null` 表示“未检查”，`true` 表示“是”，`false` 表示“否”。新建空白实验、无 payload 草稿和 clone 后的预检查默认都应为 `null`；`risk_note` 在 UI 中常显并放在预检查区块最后。

### 9.5 precursors

```json
{
  "items": [
    {
      "species": "MoO3",
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

前驱体不再保存 `role` 字段；原 `type` 字段已更名为 `species`，界面标签为“前驱体种类”。空白实验或无前驱体 payload 的草稿，编辑器默认显示 2 条空前驱体记录。

### 9.6 substrates

保存 `substrates` 模块时，后端同步 `top/bottom` 角色到样品表：

- 新角色创建样品，样品编号由实验 `run_code` 和角色生成。
- 现有角色更新样品字段，并保留用户补充的 `metadata_json`。
- 从 payload 中移除的 `top/bottom` 样品默认软删除；如果已有文件或子样品依赖，保留现有阻止逻辑并返回错误。
- 重新添加已软删除的角色时恢复原样品行并清空删除标记。

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

### 9.7 furnace_program

```json
{
  "furnace_info": {
    "zones_count": 2,
    "model": "OTF-1200X",
    "initial_temperatures_C": {"zone_1": 25, "zone_2": 25}
  },
  "placements": [
    {
      "precursor_index": 0,
      "zone_key": "zone_1",
      "position_cm": -15,
      "note": "上游温区"
    }
  ],
  "steps": [
    {
      "step_index": 1,
      "step_name": "升温",
      "duration_min": 30,
      "is_hold": false,
      "temperatures_C": {"zone_1": 750, "zone_2": 200},
      "note": ""
    }
  ]
}
```

`placements[].precursor_index` 引用 `precursors.items[index]`。前驱体种类、质量、批号等主信息只在 `precursors` 模块维护；旧 `furnace_program.precursors[]` 仅用于历史 payload 读取兼容。

### 9.8 gas_program

```json
{
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
      "flow_sccm": 100
    },
    {
      "stage": "growth",
      "start_min": 0,
      "end_min": 45,
      "gas": "Ar",
      "components": [
        {"name": "Ar", "flow_sccm": 80}
      ],
      "flow_sccm": 80
    }
  ]
}
```

### 9.9 characterization

```json
{
  "methods": [
    {"method": "OM", "enabled": true, "note": ""},
    {"method": "Raman", "enabled": true, "excitation_nm": 532, "note": ""},
    {"method": "PL", "enabled": false, "excitation_nm": 633, "note": ""},
    {"method": "AFM", "enabled": false, "note": ""},
    {"method": "SEM", "enabled": false, "note": ""}
  ]
}
```

### 9.10 result_summary

```json
{
  "quality_label": "unknown",
  "summary": "",
  "next_step": ""
}
```

---

## 10. 校验规则

### 10.1 阻塞错误

提交时必须阻止：

1. 没有实验日期。
2. 没有实验人员。
3. 没有前驱体。
4. 任一前驱体缺少 `species` 或 `method`。
5. 没有温区程序。
6. 温区时间点不是递增。
7. 气体 segment 的 `end_min <= start_min`。
8. 气体 segment 时间重叠。
9. `seal_intact=false` 且没有 `risk_note`；`seal_intact=null` 不阻止提交。
10. 上传文件没有 method。
11. 上传文件没有关联 experiment。

### 10.2 警告但不阻止

1. 室内温度不在 15–35 ℃。
2. 湿度不在 0–100%。
3. `boat_contamination_level=true` 或 `tube_contamination_level=true`。
4. 继承的高风险字段未确认。
5. 前驱体没有 batch_no。
6. 文件没有关联 sample。

### 10.3 完整度汇总

`POST /api/v1/experiments/{id}/validate` 和提交失败的 `422` 响应除 `ok/errors/warnings` 外，还返回：

- `completion_score`：0–100 的确定性完整度分数，基于主字段、前驱体、基底、炉温、气体和环境的固定检查项；提交前校验还会复用 typed module payload schema，阻止历史脏数据中的非法数字字段进入 submitted/locked 流程。
- `blocking_count`：阻塞错误数量，默认等于 `errors.length`。
- `warning_count`：提示项数量，默认等于 `warnings.length`。

前端提交前汇总应展示分数、阻塞/提示计数，并按 `module_key` 提供跳转入口。

---

## 11. API 契约补充

### 11.1 响应格式

成功：

```json
{
  "data": {},
  "message": "ok"
}
```

失败：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "温区时间必须递增",
    "details": []
  }
}
```

### 11.2 分页格式

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 120
  }
}
```

### 11.3 实验列表过滤参数

```text
GET /api/experiments?mine=true&status=draft&material_system=MoS2&q=CVD-2026&page=1&page_size=20
```

### 11.4 自动保存

```text
PUT /api/experiments/{id}/modules/{module_key}
```

请求：

```json
{
  "payload_json": {},
  "client_updated_at": "2026-04-22T14:30:00Z"
}
```

响应：

```json
{
  "data": {
    "module_key": "gas_program",
    "validation_status": "valid",
    "updated_at": "2026-04-22T14:30:03Z"
  }
}
```

---

## 12. 前端实现要求

### 12.1 表单编辑器

- 采用左侧 stepper + 右侧模块表单。
- 每个模块独立保存。
- 顶部显示实验编号、状态、保存状态、来源实验。
- 下方固定操作栏：保存草稿、上一步、下一步、提交。

### 12.2 自动保存

- 简单字段 blur 保存。
- 大文本和重复表格 debounce 1000ms 保存。
- 保存失败时显示重试。
- 离开页面前如有未保存修改，需要确认。

### 12.3 继承字段显示

复制实验后，继承字段显示提示：

```text
继承自 CVD-2026-0012
```

用户修改后显示：

```text
已修改，原值：80 sccm
```

### 12.4 locked 状态

- locked 实验跳转到详情页。
- 不显示内联编辑控件。
- 提供“派生新实验”按钮。

---

## 13. 文件上传要求

### 13.1 上传字段

上传文件时前端必须提供：

```json
{
  "experiment_run_id": "uuid",
  "sample_id": "uuid or null",
  "method": "OM|Raman|PL|AFM|SEM|Other",
  "file_category": "raw|processed",
  "note": ""
}
```

### 13.2 后端处理

1. 保存原始文件。
2. 计算 sha256。
3. 写入 file_assets。
4. 返回 file id、filename、size、sha256、download url。

---

## 14. Excel 导出要求

V1 导出一个 `.xlsx` 文件，包含：

1. Basic Info
2. Environment & Precheck
3. Precursors
4. Substrates
5. Furnace Program
6. Gas Program
7. Characterization
8. Files
9. Audit

JSON payload 中的数组展开为表格行。

---

## 15. 种子数据

系统初始化时插入：

### 15.1 默认用户

```text
admin@example.com / ChangeMe123!
```

首次登录后提示修改密码。

### 15.2 受控词表

- material_system: MoS2, WS2, WSe2, MoSe2, hBN, graphene, other
- sample_env: clean, normal, contaminated, unknown
- precursor_method: melting, spin_coating, powder, solution, other
- substrate_role: top, bottom, control, product
- substrate_treatment: none, plasma_cleaning, solvent_cleaning, annealing, uv_ozone, other
- gas: Ar, H2, O2, CO2, CO, Ar+H2, Ar+O2, H2+CO2, Ar+CO, other
- characterization_method: OM, Raman, PL, AFM, SEM, Other
- quality_label: success, partial, failed, unknown

---

## 16. 测试要求

### 16.1 后端测试

至少覆盖：

1. 登录成功/失败。
2. 创建实验。
3. 保存模块。
4. 提交校验失败。
5. 提交成功。
6. locked 实验不可编辑。
7. clone 实验不复制文件和结果。
8. 文件上传写入 metadata。
9. JSON 导出结构正确。
10. Excel 导出文件可打开。

### 16.2 前端测试

至少覆盖：

1. 登录后进入实验列表。
2. 新建实验成功。
3. 表单自动保存状态变化。
4. 必填错误展示。
5. 复制实验后出现继承提示。
6. locked 实验只读。

---

## 17. Agent 开发顺序

推荐让 Agent 按以下顺序实现，不要跳跃：

1. 初始化 monorepo。
2. Docker Compose：postgres、backend、frontend。
3. 后端基础：配置、数据库、迁移、用户、登录。
4. 实验主表 CRUD。
5. 模块 payload 保存和读取。
6. CVD V1 schema 和校验。
7. 前端登录和实验列表。
8. 前端实验编辑器。
9. clone/submit/lock/invalid。
10. 审计日志。
11. 文件上传。
12. 样品生成。
13. JSON/Excel 导出。
14. 管理词表。
15. 测试和 README。

---

## 18. Agent 不应自行决定的事项

除非用户明确要求，Agent 不应：

1. 改用 MongoDB。
2. 改用 Firebase/Supabase 托管方案。
3. 改用纯 JSON 文件存储。
4. 把文件二进制存入 PostgreSQL。
5. 删除模块化 JSONB 设计。
6. 跳过审计日志。
7. 跳过实验状态流。
8. 把 CVD 表单实现成一个不可扩展的大宽表。
9. 使用英文界面替代中文界面。
10. 实现自动 AI 分析作为第一版核心功能。

---

## 19. 最小验收标准

第一版可交付系统必须满足：

1. 组员能登录。
2. 组员能新建并填写一条 CVD 实验。
3. 组员能从上一条实验复制参数。
4. 组员能看到继承来源和修改状态。
5. 表单能自动保存。
6. 提交前能发现关键错误。
7. 提交后能只读查看。
8. 锁定后不能编辑，只能派生。
9. 文件能上传并关联实验。
10. 每次关键修改有审计记录。
11. 能导出单实验 JSON。
12. 能导出人类可读 Excel。
13. 管理员能维护基础受控词表。
14. 系统可通过 Docker Compose 在本地启动。
