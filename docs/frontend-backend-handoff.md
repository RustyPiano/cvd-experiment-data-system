# Frontend Backend Handoff

这份文档面向前端开发，目标是让 `React + TypeScript + Vite + Ant Design` 前端可以直接接当前后端，不需要先读一遍服务层代码。

## 0. 当前前端已实现范围

截至 2026-04-28，仓库里的前端当前已接通：

- `/login`
- `/experiments`
- `/experiments/new`
- `/experiments/:id`
- `/experiments/:id/files`
- `/samples/:id`
- `/admin/vocabularies`
- `/experiments/:id` 生命周期动作卡片
- `/experiments/:id/edit` 已接通全部 V1 模块 key 的首版编辑器
- `basic_info`
- `environment`
- `precheck`
- `precursors`
- `substrates`
- `furnace_program`
- `gas_program`
- `process_observation`
- `characterization`
- `result_summary`
- `return-to-draft / lock / invalidate / clone`
- draft 自动保存与 `submit` 提交
- 文件列表、筛选、上传、下载、软删除
- 详情页概览/参数/样品/文件/审计 Tabs、文件概览、审计轨迹、JSON/Excel 导出入口
- 详情页样品概览与样品详情跳转
- 样品详情读取、draft 编辑、关联文件查看与下载
- 受控词表后台的列表筛选、创建、编辑与启停用

当前前端还没有接通的部分主要只剩文件页增强与后续管理端增强；生产构建已配置 Vite/Rolldown vendor 拆包，当前不会触发 500 kB chunk size 警告。因此，下面的接口说明更适合用来补文件预览、批量上传和管理端增强，而不是重复改造现有编辑器骨架。

## 0.1 当前前端基线约定

- 当前实验查询已经按“当前用户 ID + 资源 ID”分组缓存；退出登录时会清空 query cache，避免跨账号残留旧数据。
- 统一 API client 现在同时兼容 `204`、JSON 响应和纯文本错误响应；后端即便返回非 JSON 错误体，前端也会归一化成 `HttpError` 处理。
- `/experiments/new`、`/experiments/:id`、`/experiments/:id/edit` 已补齐错误态展示；后续新页面也应保持“失败可见”，不要返回空白壳层。
- 编辑器当前采用“主表单 + 模块表单 + 区块级 debounced autosave”的结构；`basic_info` 会同时写主实验记录和模块 payload。
- `result_summary` 也会同时写主实验 `summary_result` 和模块 payload，保证详情页能直接读取结论。
- 当前编辑器按最小可用字段集建模；自动保存时会保留原模块 payload 中前端暂未暴露的字段。
- 当前 `PATCH /experiments/{id}` 支持 draft 下更新 `experiment_type`、`material_system`、`experiment_date`、`objective` 和 `summary_result`；修正 `experiment_date` 不会改写既有 `run_code`。
- 当前编辑器只在 `draft` 开启自动保存和提交；`submitted / locked / invalid` 一律只读。
- 详情页当前已根据“owner/admin vs. 其他 member/viewer”以及实验状态控制动作按钮显示；状态切换请求进行中会互斥禁用其他动作；`clone` 成功后会直接跳到新草稿的编辑页。
- 当前前端已经封装带 Bearer Token 的 blob 下载能力，用于文件下载和 Excel 导出。
- 详情页当前直接调用模块、文件列表、样品列表和审计接口，不依赖聚合导出接口做页面渲染。
- 当前 Vite 构建按 React、router/query、Ant Design 和 rc 依赖拆分 vendor chunk；新增重量级前端依赖时应先检查 `bun run build` 输出，避免重新合并到首屏共享 chunk。
- 文件页当前会额外读取 `GET /api/v1/samples?experiment_id=...` 和 `GET /api/v1/vocabularies?vocab_key=characterization_method`，分别用于样品关联和上传方法建议。
- 样品详情页当前会额外读取所属实验和 `GET /api/v1/files?experiment_id=...&sample_id=...`，形成单样品视角。
- 样品编辑当前只覆盖后端 `PATCH /samples/{id}` 已支持字段，不包含 `sample_code`、`role` 和 `parent_sample_id` 改写。
- `/admin/vocabularies` 当前只开放给 `admin`；侧栏入口会按角色隐藏，非 admin 直达时显示权限提示且不会发请求。
- 词表后台当前采用“筛选 + 列表 + Modal 表单”结构；创建走 `POST /api/v1/admin/vocabularies`，编辑走 `PATCH /api/v1/admin/vocabularies/{id}`。
- 词表编辑当前只发送脏字段，`vocab_key` 只允许在创建时填写，不提供前端改写。

## 1. 启动与基线

后端本地默认地址：

```text
http://127.0.0.1:8000
```

OpenAPI 文档：

```text
http://127.0.0.1:8000/docs
```

前端建议环境变量：

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

后端当前已为本地 Vite 开发环境放开 CORS：

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:4173`
- `http://127.0.0.1:4173`

如果前端开发端口变了，需要同步修改后端 `CORS_ALLOW_ORIGINS`。

## 2. 鉴权约定

登录：

```http
POST /api/v1/auth/login
Content-Type: application/json
```

请求体：

```json
{
  "email": "admin@example.com",
  "password": "Password123!"
}
```

响应体：

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "...",
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "admin",
    "is_active": true
  }
}
```

前端保存方式：

- 当前后端是 Bearer Token 模式，不使用 Cookie Session。
- 请求头统一带：

```http
Authorization: Bearer <access_token>
```

当前用户：

```http
GET /api/v1/auth/me
```

登出：

```http
POST /api/v1/auth/logout
```

`logout` 返回 `204`，语义是“结束前端本地会话”；前端应主动清除本地 token。

## 3. 实验状态机

后端状态值固定为：

```text
draft
submitted
locked
invalid
```

状态规则：

- `draft`：owner/admin 可编辑，可上传文件，也可直接作废。
- `submitted`：只读；owner/admin 可退回草稿、锁定或作废。
- `locked`：只读；非 `viewer` 可 clone；owner/admin 仍可作废自己的实验。
- `invalid`：默认列表隐藏。

前端不要自行推导状态流，直接按按钮接口驱动：

- `POST /api/v1/experiments/{id}/submit`
- `POST /api/v1/experiments/{id}/return-to-draft`
- `POST /api/v1/experiments/{id}/lock`
- `POST /api/v1/experiments/{id}/invalidate`
- `POST /api/v1/experiments/{id}/clone`

## 4. 页面到接口映射

### `/login`

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`

### `/experiments`

- `GET /api/v1/experiments`

常用查询参数：

- `mine=true`
- `status=draft|submitted|locked|invalid`
- `q=...`
- `material_system=...`
- `page=1`
- `page_size=10`
- `sort_by=run_code|material_system|experiment_date|status|updated_at`
- `sort_order=asc|desc`

注意：

- 不传 `status` 时，`invalid` 默认不会返回。

### `/experiments/new`

- `POST /api/v1/experiments`

### `/experiments/:id`

- `GET /api/v1/experiments/{id}`
- `GET /api/v1/experiments/{id}/modules`
- `GET /api/v1/samples?experiment_id={id}`
- `GET /api/v1/files?experiment_id={id}`
- `POST /api/v1/experiments/{id}/return-to-draft`
- `POST /api/v1/experiments/{id}/lock`
- `POST /api/v1/experiments/{id}/invalidate`
- `POST /api/v1/experiments/{id}/clone`
- `GET /api/v1/experiments/{id}/audit-events`
- `GET /api/v1/experiments/{id}/export`
- `GET /api/v1/experiments/{id}/export/excel`

当前详情页实际消费方式：

- 实验主信息：`GET /api/v1/experiments/{id}`
- 参数 Tab：`GET /api/v1/experiments/{id}/modules`
- 样品概览：`GET /api/v1/samples?experiment_id={id}`
- 文件概览：`GET /api/v1/files?experiment_id={id}`
- 审计轨迹：`GET /api/v1/experiments/{id}/audit-events`
- 导出按钮：
  - JSON：`GET /api/v1/experiments/{id}/export/json`
  - Excel：`GET /api/v1/experiments/{id}/export/excel`

### `/experiments/:id/edit`

- `PATCH /api/v1/experiments/{id}`
- `POST /api/v1/experiments/{id}/submit`
- `GET /api/v1/experiments/{id}/modules`
- `GET /api/v1/experiments/{id}/modules/{module_key}`
- `PUT /api/v1/experiments/{id}/modules/{module_key}`

当前编辑器实际写入策略：

- 主记录 `PATCH` 更新 `experiment_type`、`material_system`、`experiment_date`、`objective` 和 `summary_result`
- `basic_info` 模块会额外保存 `operator_id`、`experiment_type`、`material_system`、`experiment_date`、`objective`
- `result_summary` 会同步写主记录 `summary_result` 与模块里的 `summary_result`

### `/experiments/:id/files`

- `GET /api/v1/files?experiment_id={id}`
- `POST /api/v1/experiments/{id}/files`
- `GET /api/v1/files/{file_id}`
- `GET /api/v1/files/{file_id}/download`
- `DELETE /api/v1/files/{file_id}`
- `GET /api/v1/samples?experiment_id={id}`
- `GET /api/v1/vocabularies?vocab_key=characterization_method`

当前文件页实际行为：

- 允许按 `method`、`file_category` 走后端筛选
- 上传表单提交 `multipart/form-data`
- `sample_id` 可选
- 样品列会直接跳到 `/samples/{sample_id}`

### `/samples/:id`

- `GET /api/v1/samples/{id}`
- `PATCH /api/v1/samples/{id}`
- `GET /api/v1/experiments/{experiment_run_id}`
- `GET /api/v1/files?experiment_id={experiment_run_id}&sample_id={id}`

当前样品页实际行为：

- `sample_code`、`role`、`parent_sample_id` 当前只读展示
- 仅 owner/admin 且实验为 `draft` 时允许保存
- 当前可编辑字段：
  - `substrate_type`
  - `brand`
  - `size_mm`
  - `treatment`
  - `position_mm`
  - `storage_location`
  - `metadata_json`
- 前端会先校验：
  - `position_mm` 必须可解析为数字
  - `metadata_json` 必须是 JSON 对象

### `/admin/vocabularies`

- `GET /api/v1/vocabularies`
- `GET /api/v1/admin/vocabularies`
- `POST /api/v1/admin/vocabularies`
- `PATCH /api/v1/admin/vocabularies/{id}`

当前词表后台实际行为：

- 只对 `admin` 开放；`member/viewer` 只会看到权限提示
- 支持按 `vocab_key` 筛选后台全量词条
- 创建时可填写：
  - `vocab_key`
  - `value`
  - `label_zh`
  - `label_en`
  - `sort_order`
  - `is_active`
  - `metadata_json`
- 编辑时只允许修改后端 `PATCH` 已支持字段，不提供 `vocab_key` 改写
- 前端会先校验：
  - `sort_order` 必须是整数
  - `metadata_json` 必须是 JSON 对象

## 5. 模块键

模块接口的 `module_key` 目前固定为：

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

前端可以把它们映射为 tab 或分步表单，但不要改 key。

## 6. 目前最重要的模块约束

提交前至少满足：

- 主表字段里 `experiment_type`、`material_system`、`experiment_date` 有值。
- 已知模块 payload 必须通过后端 typed schema 校验；历史脏数据里的数字字段字符串会作为阻塞错误返回。
- `precursors.items` 至少一项，且每项必须是对象。
- `furnace_program.zones` 至少一项。
- 每个 `zone.temperature_program` 至少一项，且 `time_min` 严格递增。
- `gas_program.segments` 如果存在，则要求时间段合法且不能重叠。
- `substrates.items` 如果存在，则要求 `role` 为 `top/bottom` 且 `type` 非空。
- `characterization.methods` 如果存在启用项，则要求 `method` 非空。
- `precheck.seal_intact=false` 时必须填 `risk_note`。
- `POST /api/v1/experiments/{id}/validate` 返回 `ok/errors/warnings/completion_score/blocking_count/warning_count`；前端提交前汇总应展示完整度分数、阻塞/提示计数，并按 `module_key` 提供跳转按钮。

基底模块还会触发样品同步：

- `substrates` 中 `top/bottom` 会生成或更新 `TOP/BOTTOM` 样品。
- 移除 `top/bottom` 时，如果样品已有文件或下游样品依赖，后端会拒绝并返回 `422`。
- 没有依赖的 `TOP/BOTTOM` 样品会标记 `deleted_at/deleted_by_id`，默认样品列表不再返回该行。
- 后续重新添加同一角色时，后端会恢复保留的样品行并清空删除标记。
- `substrates.items` 中重复 `top` 或重复 `bottom` 会返回 `422`。

## 7. 样品约定

样品角色：

```text
top
bottom
product
control
```

样品编号由后端生成，前端不要生成：

- `S-2026-0001-TOP`
- `S-2026-0001-BOTTOM`
- `S-2026-0001-PRODUCT-A`
- `S-2026-0001-PRODUCT-AA`

手工创建样品：

```http
POST /api/v1/experiments/{id}/samples
```

如果传 `parent_sample_id`，它必须属于同一实验。

样品响应字段包含 `deleted_at`、`deleted_by_id` 和 `is_deleted`。普通列表默认只返回未删除样品；导出会包含软删除保留行用于审计和数据追溯。

## 8. 文件上传约定

上传接口：

```http
POST /api/v1/experiments/{id}/files
Content-Type: multipart/form-data
```

表单字段：

- `file`: 必填
- `method`: 必填，当前应来自 `characterization_method` 词表
- `file_category`: 可选，`raw` 或 `processed`
- `note`: 可选
- `sample_id`: 可选

兼容字段：

- `file_kind` 仍可作为旧字段传入，但新前端不要再使用。

注意：

- 上传大小默认上限是 `50 MiB`。
- 跨实验 `sample_id` 会返回 `422`。
- 只有 `draft` 实验允许上传和删除文件。
- 下载响应会带 `Content-Disposition`，浏览器端可以读取文件名。

## 9. 导出约定

结构化导出：

```http
GET /api/v1/experiments/{id}/export
GET /api/v1/experiments/{id}/export/json
```

字段包含：

- `experiment`
- `modules`
- `samples`，包含软删除保留行及其删除标记
- `files`
- `features`
- `provenance`
- `audit_events`
- `counts`

analysis-ready 导出：

```http
GET /api/v1/experiments/{id}/export/analysis
```

返回扁平行集合，便于后续转换为 CSV/Parquet。`sample_rows` 同样包含软删除保留行及 `deleted_at/deleted_by_id/is_deleted`。

Excel 导出：

```http
GET /api/v1/experiments/{id}/export/excel
```

当前 sheet：

- `Basic Info`
- `Environment & Precheck`
- `Precursors`
- `Substrates`
- `Furnace Program`
- `Gas Program`
- `Characterization`
- `Files`
- `Audit`

## 10. 常见错误码

- `401`：未登录、token 无效、用户被禁用
- `403`：角色不足
- `404`：资源不可见或不存在
- `409`：状态冲突、唯一约束类业务冲突
- `413`：上传文件超出大小上限
- `422`：业务校验失败或 payload 形状错误

前端处理建议：

- `401`：跳回登录页并清 token
- `403`：展示无权限页或禁用操作
- `409`：提示“状态已变化，请刷新”
- `422`：优先展示后端返回的 `detail`

## 11. 当前明确不做的前端假设

- 没有 refresh token
- 没有服务端分页
- 没有实验物理删除
- 没有用户管理后台
- 没有 recipe/template UI

这几项前端不要预埋依赖。
