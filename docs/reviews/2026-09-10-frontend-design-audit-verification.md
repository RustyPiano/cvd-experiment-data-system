# 前端设计审查复核

日期：2026-09-10。输入：`2026-09-10-frontend-design-audit.md`。本轮仅核查与记录，未执行输入报告里的整改指令。

范围：HEAD `304c96f` 加当前未提交的 alpha.44 工作区；生产公开 HTTP 响应仅用于核实静态资源部署行为，不能代替 alpha.44 页面验收。保留全部既有修改及原报告。未登录生产、未写入业务数据。

## 结论

原报告指出了真实维护债，但其“四个 P0”结论缺乏依据。当前默认测试正常；“两个大文件没有测试”“废弃表征组件仍接入路由”“生产完全没压缩”均与本轮证据不符。缓存失效遗漏确实存在，而且比原报告举出的废弃路径更值得优先处理。

本轮未确认 P0；建议优先修复当前可达路径的缓存一致性问题，其后处理大型文件、类型断言、双语缺口及静态资源优化。不能把文件行数、未使用 zod、未抽公共列表组件直接当作线上故障。

## 1. 实测与方法

| 检查 | 本轮结果 |
| --- | --- |
| `bun run test`，未改配置、默认并发 | exit 0；60/60 文件、438/438 用例；16.88 秒 |
| `bun run typecheck` | exit 0 |
| `bun run lint` | exit 0，`--max-warnings=0` |
| `bun run build` | exit 0 |
| 当前运行工具 | Bun 1.3.14；测试日志显示 Vitest 4.1.8 |
| QueryClient 探针 | 使用已安装的真实 QueryClient，预置缓存后执行现有失效键，检查 `isInvalidated`；见第 3 节 |
| 依赖扫描 | TypeScript AST 扫描本地静态 import/export，排除测试及整条 `import type`，核对循环链；不把特性目录互相引用直接等同于文件循环 |
| 生产响应头 | 首页、入口 JS、CSS 均返回 gzip；所抽查 JS/CSS 没有 Cache-Control/Expires，有 ETag/Last-Modified |

测试耗时不同不能证明原报告的历史日志造假；只能说明“当前套件不可用、必然超时”的结论无法复现，历史失败根因仍未定位。不能据此直接调整全局测试环境或延长超时。

## 2. 原报告逐项复核

### P0 / P1 项

| 原编号 | 结论 | 证据与修正 |
| --- | --- | --- |
| P0-0 测试不可用 | **当前未复现；根因推断不足** | 默认执行 438/438 通过，16.88 秒。`.github/workflows/ci.yml:143` 已执行 `bun run test`，没有忽略该步骤失败；“把退出码纳入 CI”已经落实。 |
| P0-1 超大文件、无测试 | **体积属实，无测试错误；建议 P2 维护债** | 4,561 / 4,378 / 2,187 / 1,932 行均吻合。`simple-target-editor.test.tsx:11–27` 直接导入前驱体、衬底、生长编辑器，279 行起有真实交互/校验测试；`scientific-measurement-workspace.test.tsx:15` 导入新版表征工作区。没有同名测试文件不等于没有覆盖；也不能由行数推断“不可单测”。 |
| P0-2 缓存失效错位 | **真实问题，但原例用了废弃路径；建议 P1** | 旧组件 3854 行的路径不可达；当前新版 `simple-characterization-workspace.tsx:1063–1067` 同样只失效 `['measurements', runId]`，漏掉样品详情的测量查询。新版对 `['samples']` 的宽前缀失效有效。见第 3 节。 |
| P0-3 字体及部署性能 | **部分属实，影响被夸大；建议 P2** | 当前六个中文字体合计 8,308,952 bytes（约 7.92 MiB），其中三份 woff2 约 3.31 MiB。磁盘产物总量不等于首屏下载量：CSS 将 woff2/woff 声明为替代格式，支持 woff2 的浏览器无需两份都下。生产首页、JS、CSS 实测 gzip；缺显式长缓存成立，“无任何缓存”不成立，有 ETag/Last-Modified。 |
| P1-1 双语豁免 | **核心事实成立，措辞过度；P2** | `i18n-hardcoded.test.ts:7` 当前列出 19 个豁免文件，而非 20 个；既含界面中文也含领域别名。核心录入/详情仍有中文硬编码，切英文不完整，但不能称全部双语基建无效。按用户英文使用需求逐步补齐；不应机械删除领域值豁免。 |
| P1-2 特性循环依赖 | **目录耦合成立，举例不足以证明文件循环；P2** | `entity-form → formula` 与 `entity-reference-select → entity-form` 不自动构成文件循环，formula 没有因此回指表单。实际确认的静态循环在 `simple-preparation-editors ↔ simple-target-editor`，见新增项。当前 ESLint 已有 `import/no-cycle`，只是明确设为 off（`eslint.config.js:9`），无需先新增依赖。 |
| P1-3 类型逃逸/绕过 zod | **断言事实成立，“未用 zod=无校验”错误；P2** | 非测试源码共 5 处双重断言，旧组件 3 处、新工作区 2 处，不是 6 处。`entity-form.tsx:252` 起的 resolver 实际执行必填、条件、公式、传感器等校验；RHF 自定义 resolver 并不等于绕过校验。双重断言削弱编译期检查，但不绕过后端验证，也不能只加一个未与单一源同步的 zod schema 就宣称契约闭环。 |
| P1-4 localStorage 令牌 | **事实成立，属于安全设计风险** | `auth-store.tsx` / `session.ts` 确实存取 bearer token，存在脚本读取面；本轮未发现可利用 XSS，不能据此宣称令牌已泄露。`use-session-refresh.ts`、API 401 事件及 `app-shell.tsx:195–211` 已处理刷新/失效退出，不能说完全没有过期处理。Cookie 迁移是跨端认证方案变更，需要单独评估，不是本轮必做修复。 |
| P1-5 废弃组件仍在路由 | **误报** | `characterization-list-page.tsx:36–40` 变量虽名为 ScientificMeasurementWorkspace，实际导入 `simple-characterization-workspace` 并取 `module.SimpleCharacterizationWorkspace`。旧导出没有业务调用方；编辑页面 chunk 不能证明旧表征工作区被打包，该源文件同时承载仍在使用的制备代码。残留旧代码和误导性局部变量名可清理。 |
| P1-6 latest 导致不可复现 | **浮动声明属实，当前构建不可复现不成立；P2** | 5 个 latest、devtools 在 dependencies 均属实；Dockerfile 和 CI 都用 frozen lockfile。风险出现在重新解析/升级锁文件时。移动到 devDependencies 本身不能保证浏览器不打包，打包取决于导入及依赖自身生产导出。 |

### P2 项

| 原编号 | 结论 | 证据与处理尺度 |
| --- | --- | --- |
| 1 Toaster 固定亮色 | **成立** | `sonner.tsx:15` 固定 light；`main.tsx:55` 有 ThemeProvider，登录、注册、AppShell 都有 ThemeToggle。注释已失真。应修主题一致性，但本轮未进行视觉验收，不能声称所有 toast 背景都显示亮色——其 CSS 变量仍有主题作用。 |
| 2 缺 noUncheckedIndexedAccess | **配置事实成立，不是独立 bug** | tsconfig 未开启。需要结合实际索引读取发现错误；单一开关缺失不足以判故障。 |
| 3 关闭 no-unnecessary-condition | **事实成立，有明确理由** | ESLint 注释说明 API 非空类型与运行时边界差异。启用前需校准类型/边界，不能把删除防御守卫作为整改成果。 |
| 4 列表页模板重复 | **布局相似，不构成必须修复项** | 已复用 PageHeader/Card/Table；业务差异仍大。暂无证据需要再抽 ListPage/DataTable 框架。 |
| 5 登录/注册重复 | **少量重复成立，低优先级** | 品牌区近似，可在共同变更时顺手提取；不为少量布局重复单独启动重构。 |
| 6 组件库零测试 | **没有独立原语测试，但不等于未被测** | 业务测试已渲染真实 Dialog/AlertDialog 等组件。尚未见移动侧栏等专门行为测试；应按修改风险补，而非为全部上游原语追数量。 |
| 7 无覆盖率门禁 | **成立，属于保障策略** | test 脚本仅 vitest run。任意 50% 阈值不能保证跨页缓存一致性；优先补能暴露实际缺陷的测试。 |
| 8 staleTime Infinity / gcTime 0 矛盾 | **误报** | `entity-image-preview.tsx:77–78` 表示有观察者期间不因陈旧重取，最后观察者卸载后立即回收 Blob 缓存；生命周期与新鲜度是不同维度。该文件还在 effect 清理 object URL。对大文件内存有合理意义。 |
| 9 静默吞错误 | **注册页误报，上传回滚问题属实** | `register-form.tsx:70` catch 后由 `registerMutation.error` 构造页面 Alert（约 80/96 行）；注册失败没有被 UI 吞掉。旧回滚的吞错在新版也存在，见第 3 节。 |
| 10 pnpm 字段 | **成立，清理项** | package.json 残留 pnpm.onlyBuiltDependencies，与当前 Bun 安装流程不一致；未据此发现原生依赖实际构建失败。 |
| 11 裸黑遮罩/圆角 | **事实成立，风格债** | Dialog/Sheet 用 bg-black/10，Badge 用 rounded-4xl，与当前 radius 收敛方向不一致。黑色遮罩本身是常见表达，不是功能错误。 |
| 12 aria-label 与 sr-only 重复 | **结构冗余成立，不是可访问性故障** | 同文案名称冗余可删一个，不应当作重复朗读已经发生；aria-label 通常覆盖子内容计算名称。 |
| 13 dataset-query-page 死页面 | **成立** | datasets 路由直接重定向 experiments；页面只被自身测试引用。可以清理页面及专用测试，勿连带删除被其他业务复用的查询 API/类型。 |

## 3. 当前可达问题及同类扩查

### V-01 / P1：新版表征保存漏刷样品详情的测量缓存

- 写入：`simple-characterization-workspace.tsx:1063–1067`。
- 读取：`sample-detail-page.tsx:132`，键为 `['measurements', 'sample', viewerKey, sampleId]`。
- 场景：先打开样品详情，进入表征添加记录，在缓存仍新鲜时返回详情。样品对象被刷新，但测量列表仍可能是旧值。
- QueryClient 探针：保存回调中三个失效前缀执行后，按炉次的 measurements 和样品 detail 均失效，按样品的 measurements 的 `isInvalidated=false`。
- 建议：最小修复可以沿用现有 `['measurements']` 失效前缀；全局 QueryKey 工厂不是修好此 bug 的前置条件。

30 秒 staleTime 不是定时刷新器，也不代表“永久不刷新”。过期后在重新挂载/聚焦等默认触发条件下会重取；已经挂载的页面没有触发时则可能继续显示旧值。宽前缀失效是库支持的正常方式，不能把全部宽前缀清零当作质量目标。参见 [TanStack Query 查询失效](https://tanstack.dev/query/latest/docs/framework/react/guides/query-invalidation) 与 [缓存生命周期](https://tanstack.dev/query/latest/docs/framework/react/guides/caching)。

### V-02 / P1：状态切换仍使用废弃样品键，也漏刷表征状态

- 定义：`status-logic.ts:55–62` 返回 `['v2-experiment-list']`、`['v2-samples', runId, token]`、`['v2-run-audit', runId]`。
- 调用：`experiment-v2-edit-page.tsx:168–170` 在锁定、解锁、作废成功后使用该函数。
- 实际页面：样品列表使用 `['samples','list',userId]`；表征样品使用 `['samples',runId]`；表征状态使用 `['v2-experiment-status',runId,...]`。这些键均未覆盖。
- 场景：已有样品列表缓存后提交炉次，短时间返回列表可能看不到新生成样品；访问过的表征页面可能保留旧的“需要先提交”或可编辑状态。后端仍执行状态权限检查，本轮未发现因此绕过服务端只读权限。
- 探针调用真实 `statusTransitionInvalidationKeys` 后，上述三类预置缓存均为 `isInvalidated=false`。
- **相关测试也有缺陷**：`status-logic.test.ts:52–58` 名称声称刷新样品，实际只断言函数返回同一废弃键，无法发现此问题。应改为验证真实页面查询键会失效。

### V-03 / P1：表征增删改变炉次结果标记，炉次缓存没有同步失效

- 写端：`scientific_measurement_service.py:407–409` 保存有效结果时清除 not_characterized 标记并刷新 result_missing_todo。
- UI：`experiment-v2-list-page.tsx:350–357` 直接根据这两个字段展示“结果待补/未做表征”。
- 漏项：新版表征保存回调没有失效 v2-experiment-list、v2-experiment、v2-run-audit；`measurement-details.tsx:255–262` 的作废回调也没有覆盖炉次相关缓存。
- 场景：先浏览带“未做表征/结果待补”的炉次列表，补充有效结果后快速返回，仍可能显示旧标记；作废最后有效结果也需同步核对相反方向。保存探针确认列表、编辑页与审计缓存均未失效。
- 建议：把服务端改变的炉次摘要/审计一并纳入写入后的失效集合；审核动作也应使用一致的策略（`experiment-v2-edit-page.tsx:218–227` 审核成功未刷新炉次列表）。

### V-04 / P2：目标编辑器抽取后留下真实文件循环

静态导入/导出链：

```text
simple-preparation-editors.tsx:405
  export { SimpleTargetEditor } from './simple-target-editor'
simple-target-editor.tsx:40
  import { changeTargetKind, targetKind } from './simple-preparation-editors'
```

这条循环经 AST 扫描确认；它是结构问题，本轮构建/测试正常，未发现初始化时序异常。最小方案是让调用方直接导入独立的 target editor，移除回指它的 re-export，或只移动必要的共享值；无需把所有领域逻辑都迁入新 shared/domain 框架。

### V-05 / P2：新版上传补偿也静默失败，原报告漏查实际路径

`simple-characterization-workspace.tsx:1048–1058` 在保存失败后逐个查询上传文件；查询失败转 null，删除失败转 undefined，最后只抛出原保存错误。用户无法知道此次已上传的文件有没有清理完成；后续重试可能留下重复的未绑定文件。这个分支位于当前可达新版，不只是废弃代码。

已有“只有明确未绑定表征记录才删除”的保护是必要的，尤其用于保存响应丢失等情况；不能改为盲删所有上传 ID。最小改善是保留失败 ID 并给出可行动的清理/重试反馈，本轮未注入网络故障或制造生产孤儿附件。

### V-06 / P2：静态资源没有独立 404 边界

`nginx/default.conf:52–54` 用 SPA fallback 处理全部未命中路径，缺少单独的 `/assets/` location。

生产只读探针请求 `/assets/cvd-audit-missing-20260910.js`，得到 **HTTP 200、Content-Type: text/html、Content-Length: 1071**，即 SPA HTML。丢失 chunk 或滚动发布时的旧 hash 请求会被伪装成成功 HTML，掩盖真实缺失并产生模块 MIME 错误。应在 assets 范围内返回真实 404，并为存在的哈希资源设置缓存。不是为所有客户端路由关闭 SPA fallback。

## 4. 原报告的建议中不能照抄的部分

1. **测试配置示例版本不匹配**：当前 Vitest 4 已移除 `poolOptions`、`environmentMatchGlobs`；安装源码有明确弃用提示，官方 [Vitest 迁移指南](https://vitest.dev/guide/migration.html) 也列出变化。不能直接复制原配置。
2. **`.test.ts` 不等于 node 环境**：`shared/api/client.test.ts:21` 等使用 window 事件；公共 `test/setup.ts:6` 也直接调用 window。按后缀切换环境会引入 ReferenceError，需先拆 setup 并核对依赖。
3. **启动超时不由 teardownTimeout 直接修复**：前者是 worker 启动/响应，后者是收尾等待。没有根因证据就延长 teardown 不构成修复。
4. **字体已有 font-display: swap**：已安装 `@fontsource/noto-sans-sc/chinese-simplified-400.css:5` 已声明，500/700 同类。无需重复建议开启。去 woff 能减构建/部署体积，但不能承诺等量减少现代浏览器首屏下载。
5. **按界面字面量做中文子集不能覆盖用户数据**：系统显示用户姓名、供应商、样品备注等动态中文；子集方案须保留可用字体 fallback，不能把界面词表当全部字形需求。
6. **移动依赖分组不等于消除生产执行**：`__root.tsx:23` 无条件渲染 TanStackDevtools；环境变量只切换 trigger。当前普通生产构建搜索未发现 devtools 标记，不能据源码静态 import 就断言生产包实际携带整套调试实现。若要做显式环境门控，应核对库的生产导出行为。
7. **不建议先新增抽象或门禁框架**：当前业务较小，先补失效前缀与真实行为测试即可；公共 ListPage、新 zod 契约副本、新循环检测依赖、全局 queryKey 禁止内联规则都不是必要前置条件。

## 5. 建议处理顺序及边界

1. 修 V-01～V-03 的缓存一致性；测试用真实 QueryClient 检查消费页面的键，不再只断言自产生的字面量。
2. 修新版上传补偿反馈、静态资源 404/长缓存及 Toaster 主题。
3. 顺手消除真实循环、旧不可达页面与旧表征代码，再按实际变更频率逐块拆大型编辑器。
4. 双语补齐、类型契约增强、字体优化、认证存储调整分别按用户使用需求与测量证据排期。

本轮为源码核查、局部运行探针、完整前端测试/编译及公开 HTTP 检查；没有进行登录后的浏览器全主线 E2E，也未实测弱网首屏或注入回滚失败。上述缓存问题已有键匹配与调用链证据，但不将其表述为已在生产登录态逐项复现。
