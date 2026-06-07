# Frontend Foundation And Access Flow Execution Record

## 状态

- 计划编写日期：2026-04-23
- 执行状态：第一阶段已完成并通过验证
- 目标范围：前端工程骨架、鉴权、受保护路由、实验列表/新建/详情/编辑入口

## 实际交付

- 使用 Bun 初始化 `Vite + React 19 + TypeScript` 前端工程
- 接入 `React Router`、`TanStack Query`、`Ant Design`、`React Hook Form`、`Zod`、`Vitest`
- 完成 Bearer Token 登录、会话持久化、受保护路由与应用壳层
- 完成 `/login`、`/experiments`、`/experiments/new`、`/experiments/:id`、`/experiments/:id/edit`
- 建立统一 API client、错误模型、环境变量读取和共享 UI 组件
- 补齐基础测试，覆盖登录、路由守卫、实验列表、新建、详情、应用壳层和 API client

## 当前文件落点

- 应用入口：`frontend/src/main.tsx`、`frontend/src/app/App.tsx`
- 路由与 Provider：`frontend/src/app/providers.tsx`、`frontend/src/app/router.tsx`
- 鉴权：`frontend/src/features/auth/*`
- 实验页面：`frontend/src/features/experiments/*`
- 共享能力：`frontend/src/shared/api/*`、`frontend/src/shared/ui/*`
- 测试基线：`frontend/src/test/*` 与对应 `*.test.tsx`

## 审核后补修

本轮实现在提交前经过一次 subagent 审核，并已关闭以下问题：

- 登出时清空 TanStack Query 缓存，避免跨账号查询结果泄漏
- 实验详情页和编辑器页在加载失败时展示错误态，而不是空白页
- API client 对非 JSON 错误响应做兼容处理，避免 `SyntaxError`
- 移除 `Button` 内嵌 `Link` 的无效交互结构
- 新建实验失败时展示明确错误提示

## 验证结果

在 `frontend/` 下已通过：

- `bun run test`
- `bun run typecheck`
- `bun run lint`
- `bun run build`

当前仍有一个非阻塞的 Vite chunk size 警告，后续在编辑器阶段做路由级拆包时一并处理。

## 与原计划的差异

- 计划草稿里提到的 `error-boundary`、`download`、`experiment-create-cards` 并未在第一阶段落地，因为当前闭环还不需要这些抽象。
- 第一阶段比原计划额外补上了详情页、新建页和应用壳层的错误态处理。
- 后续计划应直接沿着现有代码继续推进，不再回到旧的待办 checklist。

## 下一阶段

- 核心模块编辑器：`basic_info`、`precheck`、`precursors`、`substrates`
- 程序段编辑器：`furnace_program`、`gas_program`
- 自动保存、状态流按钮和提交前校验提示
- 文件上传页、样品详情页、受控词表后台
