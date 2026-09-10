# 前端设计规范性审查报告

- 审查日期：2026-09-10
- 审查范围：`frontend-next/`（React 19 + TypeScript + Vite + TanStack Router/Query + Tailwind v4 + shadcn/ui）
- 审查方式：静态走查 + 门禁实测（typecheck / lint / test）+ 构建产物分析
- 结论：**工程质量底线是达标的，但架构层面已积累明显的设计债，且集中在 `experiments-v2` 一个模块里；更严重的是测试套件当前实际处于不可用状态。**

---

## 0. 一句话结论

代码风格高度统一（typecheck ✅、eslint `--max-warnings=0` ✅），**说明团队有纪律**；
但在这层"整洁的表皮"之下，存在 **4 个 P0 级问题**：测试套件实际跑不通、单组件超 2000 行、TanStack Query 缓存键无集中管理导致失效错位、中文字体产物 7.7M 且无任何压缩缓存。
这些问题不会让 lint 变红，却直接决定了后续半年还能不能改得动。

### 门禁实测结果

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `bun run typecheck` | ✅ 通过（0 error） |
| 代码规范 | `bun run lint`（`--max-warnings=0`） | ✅ 通过 |
| 单元测试（默认并发） | `bun run test` | ❌ **失败（exit 1）**，60 个文件仅 9 个跑完 |
| 单元测试（串行） | `vitest run --no-file-parallelism` | ✅ **60/60 文件、438/438 用例全部通过，耗时 43 分钟** |

> 注意：**门禁全绿 ≠ 设计健康**。本次发现的问题都不在 lint/tsc 的检查范围内。
> 而测试这条：用例本身是全好的（438 个全过），**坏的是把测试跑起来的基础设施**——这既是坏消息，也是最容易修好的一条。

### 代码体量分布

```
src 总计 70,935 行（含生成物与测试）
├─ features/experiments-v2            21,550 行  ← 占手写业务代码 ~52%
│  └─ features/experiments-v2/components 8,553 行
├─ features/entity-library             6,773 行
├─ shared/types（OpenAPI 生成）         6,550 行
├─ shared/generated（字段元数据生成）    9,314 行
├─ components/ui                       2,818 行
└─ features/characterizations          2,216 行

手写业务代码（排除测试与生成物）：41,216 行
```

**`experiments-v2` 一个模块占了整个前端的一半以上**，这是所有架构问题的根因。

---

## 1. P0 — 必须处理

### P0-0 测试套件实际不可用：60 个文件只有 9 个能跑完

这是本次审查**最意外也最优先**的发现。

`bun run test` 实测输出：

```
 Test Files  9 passed (9)
      Tests  30 passed (30)
     Errors  51 errors
   Duration  268.30s (transform 5.62s, setup 120.83s, import 41.26s, tests 24ms, environment 475.31s)

error: script "test" exited with code 1
```

全仓共 **60 个测试文件**，跑通的 9 个 + 失败的 51 个 = 60，**一个不差**。失败原因全部相同：

```
[vitest-pool]: Failed to start forks worker for test files .../entity-library/condition-cases.test.ts
Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond
```

**即：不是测试写错了，是 worker 根本没起来。** 跑通的 9 个文件里，测试执行时间加起来只有 24ms —— 真正的测试逻辑几乎不耗时，全部时间都花在环境初始化上。

#### 关键验证：串行模式 438/438 全通过

改用 `vitest run --no-file-parallelism` 完整复跑（耗时 43 分钟）：

```
 Test Files  60 passed (60)
      Tests  438 passed (438)
   Duration  2567.89s
     (transform 6.44s, setup 390.70s, import 408.38s, tests 39.10s, environment 1552.46s)
```

**这个结果推翻了"测试写坏了"的可能，也把问题定位得极其干净：**

| 阶段 | 耗时 | 占比 | 说明 |
| --- | --- | --- | --- |
| `environment`（jsdom 建立） | 1,552.46s | **60.5%** | 约 26 秒/文件 |
| `import`（模块图加载） | 408.38s | 15.9% | 约 6.8 秒/文件 |
| `setup`（setupFiles） | 390.70s | 15.2% | 约 6.5 秒/文件 |
| **`tests`（真正的断言）** | **39.10s** | **1.5%** | 438 个用例实际执行时间 |
| `transform` | 6.44s | 0.3% | |

**98.5% 的时间花在"把测试跑起来"，只有 1.5% 花在"跑测试"。** 单文件复测同样印证（13 个用例：environment 23.62s，tests 4ms）。

**根因（按嫌疑排序）**
1. **全局 `environment: 'jsdom'`** —— 26 秒/文件远超 jsdom 正常水平（通常 1–3 秒）。而 60 个文件里大量是纯逻辑测试（字段校验、公式、状态机），根本不需要 DOM；
2. `vite.config.ts:21` **无条件加载 `devtools()` 插件**（`@tanstack/devtools-vite`）——测试环境也走它的 transform 与注入，直接推高 `import` 阶段；
3. 未配置 `teardownTimeout` 与并发上限，默认并发 fork 在 26 秒/文件的环境开销下必然大面积超时。

**影响**
- **测试形同虚设**：CI 若跑 `bun run test` 直接 exit 1；本地只看"有几个 passed"会误判为没事；
- 43 分钟的反馈周期等于没有反馈，实际没人会跑；
- 每新增一个测试文件，超时就多一个；
- 直接解释了为什么 P0-1 里两个最大的文件（4561 / 1932 行）没有测试：**不是不想写，是写了也跑不起来**。

**好消息**：这是一条"配置改对就立刻回收 438 个用例保护网"的 P0，投入产出比全场最高。

**建议（几乎全是配置改动，风险极低）**

```ts
// vite.config.ts
const isTest = process.env.VITEST === 'true'

plugins: [
  ...(isTest ? [] : [devtools()]),          // ① 测试环境不加载 devtools
  tailwindcss(),
  tanstackRouter({ target: 'react', autoCodeSplitting: true }),
  viteReact(),
],
test: {
  globals: true,
  // ② 纯逻辑测试走 node 环境，只有组件测试才用 jsdom
  environment: 'jsdom',
  environmentMatchGlobs: [
    ['src/**/*.test.ts', 'node'],           // 非 tsx 视为纯逻辑
  ],
  setupFiles: ['./src/test/setup.ts'],
  css: false,
  passWithNoTests: true,
  // ③ 给慢环境留足余量
  teardownTimeout: 60_000,
  poolOptions: { forks: { singleFork: false } },
},
```

**预期收益（可量化）**

60 个测试文件中：**29 个是 `.test.ts`（纯逻辑）、31 个是 `.test.tsx`（需要 DOM）**。

| 措施 | 影响面 | 预计节省 |
| --- | --- | --- |
| `.test.ts` 降级为 node 环境 | 29/60 文件 | environment 段约 **750s**（26s → <1s） |
| 测试环境去掉 `devtools()` | 全部 60 文件 | import 段 408s 中可观的一部分 |
| 放宽 `teardownTimeout` | 并发模式 | 从"51 个超时"变为可并发执行 |

目标：从 **43 分钟（且默认模式直接失败）** 降到 **5 分钟以内、默认并发可用**。

补充建议：
- 把 `bun run test` 退出码纳入 CI 强制门禁（当前若只看日志极易漏判）；
- 配置修好后**立即全量复跑一次**并存档基线，确认 438 个用例仍然全绿；
- 中期引入 `vitest --coverage` 建立覆盖率基线。

> 这一条应排在所有重构之前：**在测试跑不动的状态下做 4561 行文件的拆分，等于蒙眼走钢丝。**
> 反过来，它也是全场投入产出比最高的一条——438 个用例已经写好了，只差把跑道修好。

---

### P0-1 单文件/单组件体积失控，已到不可维护量级

| 文件 | 行数 | 备注 |
| --- | --- | --- |
| `features/experiments-v2/simple-preparation-editors.tsx` | **4,561** | 无对应测试文件 |
| `features/experiments-v2/scientific-experiment-form.tsx` | **4,378** | 文件内自标 `@deprecated` 却仍在生产路径 |
| `features/experiments-v2/components/process-detail-editors.tsx` | 2,187 | |
| `features/experiments-v2/simple-characterization-workspace.tsx` | 1,932 | 无对应测试文件 |
| `features/experiments-v2/components/treatment-steps-editor.tsx` | 1,484 | |
| `features/entity-library/entity-form.tsx` | 1,404 | |
| `features/characterizations/measurement-details.tsx` | 1,044 | |

更严重的是**单个 React 组件的跨度**（`simple-preparation-editors.tsx`）：

| 组件 | 起止行 | 跨度 |
| --- | --- | --- |
| `SimpleSourceLoadsEditor` | 517 – 1435 | **919 行** |
| `SimpleSubstratesEditor` | 1529 – 2435 | **907 行** |
| `SimpleGrowthEditor` | 2436 – 4561 | **≈2,126 行** |

具体症状（`simple-preparation-editors.tsx:560-600`）：组件的 `render` 里内联堆砌了 `loadingInvalid` / `zoneInvalid` / `positionInvalid` / `substrateInvalid` 等一串校验表达式，**视图渲染、业务校验、数据转换三层逻辑完全耦合**在一个 900+ 行的函数里，还夹带硬编码中文（`title="前驱体装载"`）。

**影响**
- 任何人改一处前驱体校验，都要在 2000 行里定位，且无法单独测试；
- 多人协作时这个文件是必然的合并冲突源；
- 两个最大的文件（4561 + 1932 行）**恰好都没有测试文件**，而同目录其他文件基本都有——说明不是"不需要测"，而是"大到来不及测"。

**建议（按可实施性排序）**
1. **先补测试再拆**：为 `simple-preparation-editors.tsx` 补一层"行为级"测试（渲染 → 填值 → 校验失败提示），锁定现状；
2. **抽校验层**：把 render 内的 `xxxInvalid` 表达式抽成 `validateSourceLoad(load, ctx): FieldError[]` 纯函数——这部分是纯逻辑，可 100% 单测，也是最容易先摘出来的果实；
3. **按领域拆文件**：`source-loads-editor.tsx` / `substrates-editor.tsx` / `growth-editor.tsx` 各自独立，`simple-preparation-editors.tsx` 退化为 re-export 壳，保证调用方零改动；
4. 设一条硬规则：**单个 `.tsx` 超过 600 行、单个组件超过 200 行，CI 告警**（可用 `eslint max-lines` + `max-lines-per-function` 灰度开启，先 warn 后 error）。

---

### P0-2 TanStack Query 缓存键无集中管理，失效已发生错位

全仓约 **50 处 `queryKey`**，散落在 **20 个文件**中，全部为内联数组字面量，**不存在 `query-keys.ts` 之类的集中定义**。

**同一个"样品"概念，存在三种互不兼容的键结构：**

| 位置 | 键结构 |
| --- | --- |
| `samples/sample-list-page.tsx:60` | `['samples', 'list', userId]` |
| `samples/sample-detail-page.tsx:121` | `['samples', 'detail', viewerKey, sampleId]` |
| `experiments-v2/scientific-experiment-form.tsx:3653` | `['samples', runId]` |

**已经可以确认的失效错位（真实 bug，非理论风险）：**

- `scientific-experiment-form.tsx:3854-3857` 提交测量后失效 `['measurements', runId]` 与 `['samples', runId]`；
- 但样品详情页用的是 `['measurements', 'sample', viewerKey, sampleId]`（`sample-detail-page.tsx:132`）与 `['samples', 'detail', viewerKey, sampleId]`；
- 二者第二位一个是 `runId`、一个是 `'sample'` / `'detail'`，**前缀不匹配 → 详情页数据不会刷新**。

反方向同样存在：`simple-characterization-workspace.tsx:1066` 用 `['samples']` 宽前缀兜底（能覆盖，但会误伤列表页缓存），而 `measurement-details.tsx:259` 用 `['measurements']` 兜底——**靠宽前缀硬凑，是掩盖问题不是解决问题**。

叠加 `main.tsx:23` 的全局 `staleTime: 30_000`，最坏情况下用户提交数据后 30 秒内看到的仍是旧值，且若键不匹配则**永不刷新**。

**影响**：对科研数据采集系统而言，"我明明存了但页面上没有"是最伤信任的一类缺陷，且难以复现。

**建议**
1. 新建 `src/shared/api/query-keys.ts`，导出键工厂：
   ```ts
   export const qk = {
     samples: {
       all: ['samples'] as const,
       list: (userId: string) => [...qk.samples.all, 'list', userId] as const,
       detail: (viewer: string, id: string) => [...qk.samples.all, 'detail', viewer, id] as const,
       byRun: (runId: string) => [...qk.samples.all, 'by-run', runId] as const,
     },
     measurements: { /* 同上 */ },
   }
   ```
2. 全局替换内联键；**`viewerKey` 的位置必须在同一层级**（当前有的在第 2 位、有的在第 3 位，这是错位的直接原因）；
3. 失效时用精确键，`invalidateQueries({ queryKey: ['samples'] })` 这类宽前缀逐步清零；
4. 加一条 lint 规则或 codemod 检查：禁止在组件里出现 `queryKey: ['` 字面量。

---

### P0-3 中文字体产物 7.7M，且服务端无任何压缩与缓存

`main.tsx:5-7` 引入三个中文字重：

```ts
import '@fontsource/noto-sans-sc/chinese-simplified-400.css'
import '@fontsource/noto-sans-sc/chinese-simplified-500.css'
import '@fontsource/noto-sans-sc/chinese-simplified-700.css'
```

构建产物实测：

| 文件 | 大小 |
| --- | --- |
| `noto-sans-sc-...-400-normal.woff` | 1.5M |
| `noto-sans-sc-...-500-normal.woff` | 1.5M |
| `noto-sans-sc-...-700-normal.woff` | 1.5M |
| `noto-sans-sc-...-400-normal.woff2` | 1.0M |
| `noto-sans-sc-...-500-normal.woff2` | 1.1M |
| `noto-sans-sc-...-700-normal.woff2` | 1.1M |
| **中文字体小计** | **≈7.7M** |
| `dist/` 总计 | **9.9M** |

三个问题叠加：

1. **`.woff` 是多余的**：现代浏览器全部支持 `woff2`，`@fontsource` 的 CSS 同时声明了两种格式，构建时 4.5M 的 `.woff` 被无条件打包，**纯浪费**；
2. **未做字体子集化**：`chinese-simplified` 只是按语种切分，不是按实际用到的字形切分，完整 CJK 字集三个字重全量下发；
3. **`nginx/default.conf` 全文无 `gzip` / `brotli` / `expires` / `Cache-Control`**（仅 `runtime-config.js` 设了 `no-store`）——9.9M 的静态资源**每次加载都可能全量回源**，且不带压缩。

对部署在香港服务器、主要服务内地课题组的系统，这是首屏体验的致命项。

**建议（按性价比排序，第 1 条当天就能做完）**
1. **nginx 开启压缩与缓存**（改动极小、收益最大）：
   ```nginx
   gzip on;
   gzip_vary on;
   gzip_min_length 1024;
   gzip_types text/css application/javascript application/json font/woff2 image/svg+xml;
   # 有模块时优先 brotli

   location /assets/ {
     expires 1y;
     add_header Cache-Control "public, immutable";
     try_files $uri =404;
   }
   ```
   Vite 产物带 content hash，可以安全长缓存。
2. **去掉 `.woff`**：在 `vite.config.ts` 里过滤，或改用自写 `@font-face` 只声明 `woff2`；预计直接减 4.5M；
3. **字体子集化**：用 `fonttools pyftsubset` 按项目实际用字（locale 文件 + 代码中的中文常量可提取）生成子集，中文字体通常能压到 100–200KB/字重；
4. 退一步也可用 `font-display: swap` + `preload` 首屏关键字重，避免阻塞渲染。

---

## 2. P1 — 应当排期处理

### P1-1 i18n 硬编码守卫被大范围豁免，双语形同虚设

项目有 `src/i18n-hardcoded.test.ts` 用 AST 扫描 CJK 字面量，设计得很好。但其 `EXCLUDED_FILES`（`:7-34`）豁免了 **20 个文件**，且**豁免的恰好是最大的几个业务文件**：

```
features/experiments-v2/scientific-experiment-form.tsx   (4,378 行)
features/experiments-v2/simple-preparation-editors.tsx   (4,561 行)
features/experiments-v2/simple-characterization-workspace.tsx (1,932 行)
features/samples/sample-detail-page.tsx / sample-list-page.tsx
...共 20 个
```

被豁免的三巨头合计 **10,871 行，占手写业务代码的 26%**，且是用户实际使用最频繁的表单与详情页。豁免注释写着"v4 scientific trial screens are Chinese-first; move these strings into both locale trees when the group starts an English-language trial"。

**影响**：`shared/i18n/locales/{zh,en}/common.ts`（1,733 / 1,820 行）维护了两套完整文案，但核心界面切到英文仍会露出中文——i18n 基建投入了，收益没兑现。同时这层豁免也让硬编码中文在代码里合法化，进一步加剧了 P0-1 的耦合。

**建议**：不要一次性搬迁（成本过高且易冲突）。改为 **按文件逐个摘豁免**：每完成一个文件的拆分重构（P0-1），顺带把文案搬进 locale 并从 `EXCLUDED_FILES` 移除该文件，让豁免列表**单调递减**。可在测试里加断言：`EXCLUDED_FILES.size` 不得增加。

### P1-2 特性模块之间存在循环依赖

- `entity-library/entity-form.tsx:104-105` → `experiments-v2/formula`
- `entity-library/entity-detail-page.tsx:52` → `experiments-v2/reference-snapshot`
- `experiments-v2/components/entity-reference-select.tsx:16` → `entity-library/entity-form`

构成 `experiments-v2 → entity-library → experiments-v2` 的环。
另有 `characterizations ↔ samples ↔ experiments-v2`、`datasets → experiments-v2` 的交叉引用。

**影响**：模块边界名存实亡，改动一个特性可能牵动三个；也为将来按特性做代码分割/懒加载制造障碍。

**建议**：把 `formula`、`reference-snapshot`、`field-logic` 这类**被多方引用的领域原语**下沉到 `src/shared/domain/`（注意：`entity-library/field-logic.ts` 与 `experiments-v2/field-logic.ts` 同名，需先厘清职责）。用 `eslint-plugin-import` 的 `no-cycle`（或 `dependency-cruiser`）在 CI 里卡住新增环。

### P1-3 类型逃逸：提交载荷用 `as unknown as` 绕过 zod

6 处 `as unknown as`，全集中在提交路径上：

- `scientific-experiment-form.tsx:3758 / 3785 / 3830`
- `simple-characterization-workspace.tsx:987 / 1045`

典型（`:3830`）：`as unknown as MeasurementBundleCreate`。
同时 `entity-form.tsx:249-251` 使用**手写 resolver 显式绕过 zod**（注释自认"等价于旧 `z.object`"），而 `login-form.tsx:47` / `register-form.tsx:62` 是正确用法——**同一项目内三种校验写法并存**。

**影响**：`openapi.d.ts`（6,528 行生成类型）的价值被抵消——后端契约变更时，前端编译期绿灯、运行时才发现字段不对。对"最小可复现元数据标准（R0）"这类强契约场景，风险不可接受。

**建议**：提交前用 zod schema `.parse()`（或 `.safeParse()`）产出 payload，把 `as unknown as` 全部消灭；动态字段用 `z.object(shape)` 动态拼装 + `zodResolver`，去掉手写 resolver。

### P1-4 认证令牌存 localStorage

`session.ts:14` 从 `localStorage` 读 `accessToken`，`client.ts:100` 以 `Bearer ${token}` 发送，`storage.ts:24` 明文 JSON 写入。

**影响**：任何 XSS 都能直接窃取令牌，且无法设置 `httpOnly` / `Secure` / `SameSite`。

**建议**：中期改为后端 `httpOnly` + `Secure` + `SameSite=Strict` Cookie，前端不再接触令牌（`client.ts` 用 `credentials: 'include'`）。这需要后端配合设置 CORS 与 CSRF 防护，作为独立改造项排期。短期缓解：确保全站无 `dangerouslySetInnerHTML`（本轮未发现）、并为令牌设置过期清理。

### P1-5 废弃组件仍在生产路径上

`scientific-experiment-form.tsx:3639` 标注：

> `@deprecated 当前路由仅使用 SimpleCharacterizationWorkspace；保留此组件只为旧代码追溯，不得重新接入`

但 `characterizations/characterization-list-page.tsx:36,143` 仍在 `lazy()` 加载并渲染 `ScientificMeasurementWorkspace`。

**影响**：4,378 行的"已废弃"组件仍被打包进生产（对应 `edit-*.js` 173KB chunk），注释与事实矛盾会误导维护者；两套表征工作区并存，用户可能遇到不一致行为。

**建议**：确认 `SimpleCharacterizationWorkspace` 已完全覆盖后删除旧组件；若确实仍需并存，修正注释并说明差异。

### P1-6 依赖版本浮动，构建不可复现

`package.json` 中 5 处使用 `latest`：`:27` `@tanstack/react-devtools`、`:29` `@tanstack/react-router`、`:30` `@tanstack/react-router-devtools`、`:51` `@tanstack/devtools-vite`、`:52` `@tanstack/eslint-config`。

**其中 `@tanstack/react-router` 是路由框架核心**——`latest` 意味着任何一次 lockfile 重新生成都可能引入破坏性变更，而项目已发布香港生产。Dockerfile 用了 `--frozen-lockfile` 只能锁住当前这一次构建。

另有两个 devtools 被放在 `dependencies`（生产依赖）而非 `devDependencies`，虽然 `__root.tsx:27` 用 `VITE_TANSTACK_DEVTOOLS !== 'true'` 做了条件渲染，但仍会被打进依赖树。

**建议**：把 5 个 `latest` 全部改为精确版本或 `~` 范围；devtools 移入 `devDependencies`。

---

## 3. P2 — 优化项

| # | 问题 | 证据 | 建议 |
| --- | --- | --- | --- |
| 1 | Toaster 硬编码亮色且注释与事实矛盾 | `components/ui/sonner.tsx:11,15` 注释称"无主题切换，固定 light"，但 `theme-toggle.tsx:2` 已用 `next-themes`、`styles.css:94` 仍有 `.dark` 块 | 用 `useTheme().resolvedTheme` |
| 2 | `tsconfig` 缺 `noUncheckedIndexedAccess` | `tsconfig.json:11-34` 仅 `strict: true`；而 `eslint.config.js:15-19` 注释自承"在索引处保留防御性守卫"，说明已有运行时 undefined 隐患 | 开启后修复报错，或至少对 `Record` 访问加守卫 |
| 3 | 全局关闭 `no-unnecessary-condition` | `eslint.config.js:19` | 该规则是发现"类型与实际不符"的利器，建议按目录灰度开启 |
| 4 | 列表页模板重复 | `sample-list-page.tsx:82-118`、`entity-library-page.tsx:126-158` 及 experiments-v2 列表页，重复"PageHeader + 错误 Alert + Card + 搜索 + Table" | 抽 `<ListPage>` / `<DataTable>` 壳组件 |
| 5 | 登录/注册页重复 | `login.tsx:39-52` 与 `register.tsx:31-44` 品牌区与卡片结构近乎复制 | 抽 `<AuthShell>` |
| 6 | 组件库零测试 | `components/ui/` 22 个 shadcn 原语、`lib/utils.ts`、`hooks/use-mobile.ts` 无测试 | 至少覆盖被魔改过的部分（i18n 关闭键、sidebar 移动端修复） |
| 7 | 无覆盖率门禁 | `package.json` `test` 仅为 `vitest run` | 加 `vitest run --coverage`，对 `features/` 设阈值（先 50%，逐步提） |
| 8 | `staleTime` 与 `gcTime` 矛盾 | `entity-image-preview.tsx:77-78` `staleTime: Infinity, gcTime: 0` | 明确意图：要么持久缓存，要么每次重取 |
| 9 | 错误被静默吞掉 | `register-form.tsx:70` `.catch(() => null)`；`scientific-experiment-form.tsx:3835,3839` 回滚逻辑 `.catch(() => null)` | 至少 `console.warn` 或上报，便于排查"文件删不掉"类问题 |
| 10 | `package.json` 残留 `pnpm` 字段 | `:70` `pnpm.onlyBuiltDependencies`（esbuild/lightningcss） | 项目规定用 bun，该字段无效；原生依赖构建配置需确认 |
| 11 | 遮罩用裸黑、badge 突破 radius token | `dialog.tsx:41` / `sheet.tsx:41` `bg-black/10`；`badge.tsx:9` `rounded-4xl` 违反 `styles.css:186-191` 自述的 token 规则 | 改用 token 表达，保持规则自洽 |
| 12 | 关闭按钮冗余 `sr-only` | `dialog.tsx:76-80`、`sheet.tsx:79-83` 已有 `aria-label` 又渲染 `sr-only` span | 删除冗余节点 |
| 13 | 死代码 | `datasets/dataset-query-page.tsx` 仅被自身测试引用，`datasets/index.tsx:3-7` 重定向到 `/experiments`，页面不可达 | 确认后删除 |

---

## 4. 值得肯定的地方（请勿在重构中破坏）

这些问题容易被"顺手改坏"，特别列出：

1. **设计 token 执行得非常彻底**——`shared/ui` 与 `features` 全量检索**零硬编码颜色**（无 `bg-[#xxx]`、`bg-slate-800` 之类），全部走 CSS 变量。这在同类项目里少见，是最大的资产。
2. **没有用 `div` 当按钮**（`<div onClick>` 零命中），icon-only 按钮均有 `aria-label`，键盘可达性良好。
3. **通用状态组件已收敛**——`EmptyState` / `LoadingState` / `Skeleton` / `AlertDialog` 被统一复用，没有各写各的。
4. **HTTP 层规范**——`shared/api/client.ts` 统一封装、抛 `HttpError`、集中分发 401 事件；`http-error.ts` 统一处理网络/401/403/5xx；业务代码**无裸 `fetch`**。
5. **类型生成链路完整**——`openapi.d.ts` 由后端 OpenAPI 生成，`field-metadata.ts` 由 `field-source.yaml` 生成，业务代码复用 `Schemas['X']`，符合项目"单一源"约定。
6. **路由层干净**——`__root.tsx`(41 行)、`_authed.tsx`(24 行) 均为薄壳，业务逻辑下沉到 `features/*-page`，组织方式正确。
7. **无调试残留**——全仓无 TODO/FIXME/HACK，无 `console.log`（仅 `field-logic.ts:323` 一处合理的 `console.error`），v1 前端残留已清理干净。
8. **测试用例本身是健康的、且写得认真**——60 个测试文件、**438 个用例在串行模式下 100% 通过**（见 P0-0 验证），无 snapshot 堆量，多数是带断言的交互测试（如 `simple-target-editor.test.tsx` 1,656 行、`scientific-measurement-workspace.test.tsx` 1,354 行）。这是一笔**已经攒下但暂时取不出来**的资产——修好配置即可一次性回收。

---

## 5. 建议的整改顺序

按"风险收益比 × 不打断现有业务"排序：

**第零批（本周，前置条件，必须先做）**
0. **修复测试基础设施**（P0-0）：测试环境去掉 `devtools()` 插件、29 个 `.test.ts` 降级为 node 环境、放宽 teardown 超时 → 目标：`bun run test` **默认并发下 60/60 通过、438 用例全绿、退出码 0**，耗时降到 5 分钟内，并把退出码纳入 CI。
   *没有这一步，后面所有重构都没有安全网；而这一步几乎是纯配置改动，收益是立刻回收 438 个已写好的用例。*

**第一批（1–2 周，低风险高收益）**
1. nginx 开 gzip + `/assets/` 长缓存 —— 改动 10 行，首屏立竿见影
2. 消除 `.woff` 产物（-4.5M）
3. 5 个 `latest` 依赖锁版本；devtools 挪到 devDependencies
4. 修 Toaster 暗色（`useTheme`）
5. 确认并删除死代码 `dataset-query-page`

**第二批（2–4 周，需谨慎）**
6. 建 `query-keys.ts`，按模块替换并修正失效错位 —— **这个直接修线上 bug，优先级其实最高，可与第一批并行**
7. 中文字体子集化
8. `experiments-v2` 领域原语下沉到 `shared/domain/`，切断循环依赖

**第三批（1–2 月，配合重构节奏）**
9. `simple-preparation-editors.tsx` 先补测试 → 抽校验层 → 拆三个文件
10. 提交路径引入 zod `.parse()`，消灭 `as unknown as`
11. i18n 豁免列表随重构**单调递减**
12. 补 `components/ui` 与覆盖率门禁（此时才有意义）

**独立排期（需后端配合）**
13. 令牌从 localStorage 迁移到 httpOnly Cookie

---

## 6. 一条元建议

本次所有 P0 问题有一个共同特征：**它们都不会让 CI 变红**。
项目目前的质量门禁管住了"格式与类型"，但没有管住"结构与体积"。建议在 CI 中补充三条结构性护栏：

- `eslint max-lines`（先 warn）：单文件 > 600 行告警
- 自定义规则：`queryKey` 禁止内联字面量
- 自定义规则：`i18n-hardcoded.test.ts` 的 `EXCLUDED_FILES` 只允许减少

这三条加上之后，同类设计债就不会再以"门禁全绿"的方式悄悄累积了。
