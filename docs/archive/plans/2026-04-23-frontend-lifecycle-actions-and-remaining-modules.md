# Frontend Lifecycle Actions And Remaining Modules

## 本轮目标

把实验前端从“能编辑核心模块并提交”推进到“接通全部 V1 模块 key 的首版编辑入口，并接通主要状态流”。

## 已交付

- `/experiments/:id/edit` 现在已接通全部 V1 模块 key：
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
- 编辑器仍保持“区块级自动保存”结构，并新增了：
  - `environment / process_observation / characterization / result_summary` 的 typed 表单与 payload 序列化
  - `result_summary` 同步回写主实验 `summary_result`
  - 当前全部模块在 autosave 时都会保留后端 payload 中前端暂未建模的字段
  - 非 `draft` 统一只读
- `/experiments/:id` 详情页已接通实验生命周期动作：
  - `return-to-draft`
  - `lock`
  - `invalidate`
  - `clone`
- 权限显示规则已前端化：
  - owner/admin 才能对自己的实验做 `return-to-draft / lock / invalidate`
  - 非 `viewer` 用户可以对可见的 `locked` 实验执行 `clone`
- `clone` 成功后会直接跳到新草稿的编辑页。

## 关键实现

- 新增状态流组件 `frontend/src/features/experiments/experiment-state-actions.tsx`，统一处理按钮显示、作废原因弹窗、错误反馈、缓存更新和 clone 跳转。
- 编辑器数据层继续沿用 typed module registry，没有引入 schema-driven 表单引擎。
- `useExperimentEditor` 的值更新改为“先更新 `valuesRef`，再 `setState`”，修复了连续编辑下 autosave 可能读到旧快照、遗漏后改动的问题。
- 审核回合又补了两处收口：
  - `invalidate` 不再被错误限制在 `draft`，owner/admin 可对自己的任意非 `invalid` 实验执行作废。
  - `basic_info / result_summary` 在 `PATCH` 成功后立即更新主实验 cache/state，避免模块写入失败时重开编辑器看到旧主记录。
  - 生命周期按钮在状态切换请求进行中互斥禁用，避免用户连续点击触发冲突动作。

## 测试与验证

- 新增状态流测试：`frontend/src/features/experiments/experiment-state-actions.test.tsx`
- 扩展编辑器测试：`frontend/src/features/experiments/experiment-editor-page.test.tsx`
- 本轮完成后的本地验证：
  - `bun run test`
  - `bun run typecheck`
  - `bun run lint`
  - `bun run build`

## 仍未完成

- 文件管理页与 `multipart/form-data` 上传 UI
- 样品详情页与样品编辑
- 词表后台
- 导出下载 UI、审计面板
- 路由级拆包与首屏包体积优化
