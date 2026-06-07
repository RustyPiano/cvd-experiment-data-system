# Frontend Samples And Sample Links

## 本轮目标

把前端从“实验和文件主流程可用”推进到“样品也能独立查看和维护”，让用户能从实验详情、文件页直接进入样品详情，并在 `draft` 实验下修改样品字段。

## 已交付

- 新增 `/samples/:id`
- 实验详情页新增样品概览卡片，并支持跳转样品详情
- 文件页的样品列改成可点击入口，能直接跳转样品详情
- 样品详情页已接通：
  - `GET /api/v1/samples/{id}`
  - `PATCH /api/v1/samples/{id}`
  - `GET /api/v1/experiments/{experiment_run_id}`
  - `GET /api/v1/files?experiment_id=...&sample_id=...`
- 样品详情页当前支持读取和编辑：
  - `substrate_type`
  - `brand`
  - `size_mm`
  - `treatment`
  - `position_mm`
  - `storage_location`
  - `metadata_json`
- 样品详情页会展示关联文件列表，并支持带 Bearer Token 的文件下载

## 关键实现

- 新增 `frontend/src/features/samples/api.ts`，收口样品详情读取和更新请求。
- `frontend/src/features/experiments/api.ts` 的文件查询补上了 `sample_id` 过滤，样品页可以直接复用现有文件列表接口。
- 样品页编辑权限严格跟随后端边界：
  - 只有 owner/admin
  - 且实验状态为 `draft`
  - 才显示保存入口
- 编辑时会先在前端校验：
  - `position_mm` 必须是数字
  - `metadata_json` 必须是合法 JSON 对象

## 测试与验证

- 新增测试：`frontend/src/features/samples/sample-detail-page.test.tsx`
- 扩展测试：
  - `frontend/src/features/experiments/experiment-detail-page.test.tsx`
  - `frontend/src/features/experiments/experiment-files-page.test.tsx`
- 本轮本地验证：
  - `bun run test`
  - `bun run typecheck`
  - `bun run lint`
  - `bun run build`

## 仍未完成

- `/admin/vocabularies` 仍是占位页
- 文件预览、批量上传、进度反馈和元数据细粒度编辑仍未实现
- 路由级拆包和包体优化仍未处理
