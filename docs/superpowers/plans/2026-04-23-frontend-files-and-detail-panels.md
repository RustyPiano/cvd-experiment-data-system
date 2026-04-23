# Frontend Files And Detail Panels

## 本轮目标

把前端从“主实验流程可用”推进到“实验详情和文件资产可独立工作”，也就是让用户能在前端完成文件上传、下载、删除，并在详情页直接看到文件和审计概览。

## 已交付

- 新增 `/experiments/:id/files`
- 文件页已接通：
  - 文件列表
  - `method / file_category` 服务端筛选
  - `multipart/form-data` 上传
  - 带 Bearer Token 的下载
  - draft 下的软删除
- 文件上传表单会同时读取：
  - `GET /api/v1/samples?experiment_id=...`
  - `GET /api/v1/vocabularies?vocab_key=characterization_method`
- 实验详情页新增：
  - 文件概览卡片
  - 审计轨迹卡片
  - JSON / Excel 导出按钮
  - 跳转文件页入口

## 关键实现

- 前端 API 层新增了文件、样品、词表、审计和导出相关 client。
- `frontend/src/shared/api/client.ts` 新增 `apiDownload`，专门处理带鉴权的 blob 下载与错误归一化。
- `frontend/src/shared/lib/download.ts` 负责把 blob 触发为浏览器下载。
- 文件页当前按权限和状态做前端收口：
  - owner/admin 且实验为 `draft` 才显示上传和删除
  - 其他可见用户只读浏览和下载
- 上传、删除完成后会主动刷新文件列表和实验审计查询，保证详情页返回后看到的是最新状态。

## 测试与验证

- 新增测试：`frontend/src/features/experiments/experiment-files-page.test.tsx`
- 扩展测试：`frontend/src/features/experiments/experiment-detail-page.test.tsx`
- 本轮本地验证：
  - `bun run test`
  - `bun run typecheck`
  - `bun run lint`

## 仍未完成

- 样品详情页与样品编辑
- 词表后台
- 文件预览、批量上传、进度条和更细的元数据编辑
- 路由级拆包与首屏包体积优化
