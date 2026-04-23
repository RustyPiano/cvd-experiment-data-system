# Frontend Workspace

前端当前已经完成第一阶段基础开发，重点是把“登录 -> 实验列表 -> 新建 -> 详情 -> 编辑入口”这条链路接通，并为后续模块编辑器留出稳定骨架。

## 当前已交付

- Bun + Vite + React + TypeScript 工程初始化
- Ant Design 主题、全局样式与应用壳层
- 本地 token 会话持久化与受保护路由
- `/login`
- `/experiments`
- `/experiments/new`
- `/experiments/:id`
- `/experiments/:id/edit` 壳层
- 统一 API client、错误对象与测试基线

## 当前目录结构

- `src/app`：应用入口、路由、Provider、主题
- `src/features/auth`：登录、会话状态、鉴权 API
- `src/features/experiments`：实验列表、新建、详情、编辑器壳层
- `src/shared`：API client、环境变量、通用 UI、类型定义
- `src/test`：Vitest 与 Testing Library 渲染辅助

## 当前交互约定

- 登录状态保存在本地存储；登出时同时清空 query cache 和本地 session。
- API client 会把非 `2xx` 响应统一转成 `HttpError`，兼容 JSON 与纯文本错误体。
- 新建实验页、实验详情页、编辑器壳层都已经补齐错误态，不再出现空白页。
- 当前列表、详情和编辑入口查询都按当前用户隔离缓存，避免跨账号串数据。

## 本地启动

```bash
bun install
bun run dev --host 0.0.0.0 --port 5173
```

默认联调地址：

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## 质量命令

```bash
bun run test
bun run typecheck
bun run lint
bun run build
```

截至 2026-04-23，上述命令均已通过；构建仅有一个非阻塞的 chunk size 警告。

## 已知边界

- 编辑器还只有壳层，模块表单与自动保存尚未实现
- 提交 / 退回草稿 / 锁定 / 作废 / clone 的前端交互还未接通
- 文件管理、样品详情、词表后台尚未开始
- 首屏仍未做路由级拆包，后续需要顺手压缩包体积

## 下一阶段

- 核心模块编辑器：`basic_info`、`precheck`、`precursors`、`substrates`
- 程序段编辑器：`furnace_program`、`gas_program`
- 自动保存、保存状态提示和状态流按钮
- 文件上传页、样品详情页、词表后台
