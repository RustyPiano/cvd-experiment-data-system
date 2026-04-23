# Frontend Workspace

前端当前已经完成第二个可用阶段，重点是把“登录 -> 实验列表 -> 新建 -> 编辑核心模块 -> 提交”这条链路接通。

## 当前已交付

- Bun + Vite + React + TypeScript 工程初始化
- Ant Design 主题、全局样式与应用壳层
- 本地 token 会话持久化与受保护路由
- `/login`
- `/experiments`
- `/experiments/new`
- `/experiments/:id`
- `/experiments/:id/edit` 核心模块编辑器
- `basic_info / precheck / precursors / substrates / furnace_program / gas_program`
- draft 自动保存、区块级保存状态、`submit` 提交闭环
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
- 新建实验页、实验详情页、编辑器都已经补齐错误态，不再出现空白页。
- 当前列表、详情和编辑入口查询都按当前用户隔离缓存，避免跨账号串数据。
- 编辑器当前采用“主记录 + 模块卡片”结构，每段独立自动保存，提交前会先 flush 待保存改动。
- 非 draft 实验会自动切换成只读视图，不再允许继续修改。
- 当前 `experiment_type` 和 `experiment_date` 在编辑器中按只读展示，因为后端主记录 `PATCH` 还不支持修改这两个字段。

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

- `return-to-draft / lock / invalidate / clone` 的前端交互还未接通
- 文件管理、样品详情、词表后台尚未开始
- 首屏仍未做路由级拆包，后续需要顺手压缩包体积

## 下一阶段

- 剩余状态流：`return-to-draft`、`lock`、`invalidate`、`clone`
- 文件上传页、样品详情页、词表后台
