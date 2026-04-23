# Frontend Editor And Submit Flow Execution Record

## 状态

- 计划编写日期：2026-04-23
- 执行状态：第二阶段已完成并通过验证
- 目标范围：核心模块编辑器、draft 自动保存、提交闭环

## 实际交付

- `/experiments/:id/edit` 已从壳层升级为可用编辑器
- 接入主实验记录编辑与 `basic_info` 同步保存
- 接入 `precheck`、`precursors`、`substrates`、`furnace_program`、`gas_program`
- 实现区块级 debounced autosave 和保存状态提示
- 实现 `POST /api/v1/experiments/{id}/submit` 提交流程
- 非 `draft` 实验自动切换为只读视图
- 补齐编辑器测试，覆盖模块渲染、自动保存、提交状态更新

## 当前文件落点

- 页面装配：`frontend/src/features/experiments/experiment-editor-page.tsx`
- 编辑器状态与持久化：`frontend/src/features/experiments/use-experiment-editor.ts`
- 类型与 payload 转换：`frontend/src/features/experiments/editor-types.ts`
- 模块卡片组件：`frontend/src/features/experiments/components/*`
- 相关测试：`frontend/src/features/experiments/experiment-editor-page.test.tsx`

## 实现说明

- 编辑器当前采用“主记录 + 六个模块卡片”的结构，不做万能表单引擎。
- `basic_info` 会同时写主实验记录和模块 payload，避免列表/详情与模块数据分裂。
- 自动保存只在 `draft` 启用；每段独立保存，一个模块失败不会阻塞其他模块。
- 提交动作会先 flush 待保存改动，再调用后端提交接口。

## 验证结果

在 `frontend/` 下已通过：

- `bun run test`
- `bun run typecheck`
- `bun run lint`
- `bun run build`

当前仍有一个非阻塞的 Vite chunk size 警告，后续在文件页和路由拆包阶段统一处理。

## 下一阶段

- 剩余状态流：`return-to-draft`、`lock`、`invalidate`、`clone`
- 文件管理页与上传/下载闭环
- 样品详情页
- 受控词表后台
