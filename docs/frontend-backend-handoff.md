# Frontend Backend Handoff

这份文档面向前端开发，目标是让 `React + TypeScript + Vite + Ant Design` 前端可以直接接当前后端，不需要先读一遍服务层代码。

## 0. 当前前端已实现范围

截至 2026-04-23，仓库里的前端第一阶段已接通：

- `/login`
- `/experiments`
- `/experiments/new`
- `/experiments/:id`
- `/experiments/:id/edit` 壳层

当前前端还没有接通的部分：

- 模块级表单编辑与自动保存
- 状态流按钮闭环
- 文件管理页
- 样品详情页
- 受控词表后台

因此，下面的接口说明包含“后端已经准备好但前端还未消费”的接口。继续开发前端时，应优先补齐编辑器、文件和样品链路，而不是重复搭基础骨架。

## 0.1 当前前端基线约定

- 当前实验查询已经按“当前用户 ID + 资源 ID”分组缓存；退出登录时会清空 query cache，避免跨账号残留旧数据。
- 统一 API client 现在同时兼容 `204`、JSON 响应和纯文本错误响应；后端即便返回非 JSON 错误体，前端也会归一化成 `HttpError` 处理。
- `/experiments/new`、`/experiments/:id`、`/experiments/:id/edit` 已补齐错误态展示；后续新页面也应保持“失败可见”，不要返回空白壳层。
- 当前前端还没有封装文件下载 `blob`、Excel 导出和 `multipart/form-data` 上传 UI；这部分应作为下一阶段能力单独补齐。

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

- `draft`：owner/admin 可编辑，可上传文件。
- `submitted`：只读；owner/admin 可退回草稿或锁定。
- `locked`：只读；只能 clone。
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

注意：

- 不传 `status` 时，`invalid` 默认不会返回。

### `/experiments/new`

- `POST /api/v1/experiments`

### `/experiments/:id`

- `GET /api/v1/experiments/{id}`
- `GET /api/v1/experiments/{id}/audit-events`
- `GET /api/v1/experiments/{id}/export`
- `GET /api/v1/experiments/{id}/export/excel`

### `/experiments/:id/edit`

- `PATCH /api/v1/experiments/{id}`
- `GET /api/v1/experiments/{id}/modules`
- `GET /api/v1/experiments/{id}/modules/{module_key}`
- `PUT /api/v1/experiments/{id}/modules/{module_key}`

### `/experiments/:id/files`

- `GET /api/v1/files?experiment_id={id}`
- `POST /api/v1/experiments/{id}/files`
- `GET /api/v1/files/{file_id}`
- `GET /api/v1/files/{file_id}/download`
- `DELETE /api/v1/files/{file_id}`

### `/samples/:id`

- `GET /api/v1/samples/{id}`
- `PATCH /api/v1/samples/{id}`

### `/admin/vocabularies`

- `GET /api/v1/vocabularies`
- `GET /api/v1/admin/vocabularies`
- `POST /api/v1/admin/vocabularies`
- `PATCH /api/v1/admin/vocabularies/{id}`

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
- `precursors.items` 至少一项，且每项必须是对象。
- `furnace_program.zones` 至少一项。
- 每个 `zone.temperature_program` 至少一项，且 `time_min` 严格递增。
- `gas_program.segments` 如果存在，则要求时间段合法且不能重叠。
- `precheck.seal_intact=false` 时必须填 `risk_note`。

基底模块还会触发样品同步：

- `substrates` 中 `top/bottom` 会生成或更新 `TOP/BOTTOM` 样品。
- 删除 `top/bottom` 前，如果样品已有文件或下游样品依赖，后端会拒绝删除并返回 `422`。
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
- `samples`
- `files`
- `features`
- `provenance`
- `audit_events`
- `counts`

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
