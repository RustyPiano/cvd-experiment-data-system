# CVD 实验 Setup 库前端实现设计

**日期**：2026-06-06
**状态**：待用户评审（已根据第一轮评审修订）
**文档类型**：Design Spec
**范围**：Setup 库管理页面、API 客户端、实验编辑器 Setup 模块重写、详情页展示、继承机制与测试适配
**前置文档**：`SETUP_LIBRARY_HANDOFF.md`、`docs/superpowers/specs/2026-06-05-setup-methods-data-foundation-design.md`

---

## 1. 文档目标

本设计文档旨在明确 CVD 实验数据采集系统中 **Setup 库前端重构与开发** 的具体实施细节。

后端已完整实现了 Setup 库底层数据模型、软删除、可见性控制、示意图上传/下载、以及实验快照级联引用接口（全绿，238 个测试通过）。前端需要重构现有的 "模板与大表单确认" 模式，彻底转向 "可复用的 Setup 库" 流程：
1. **新建 Setup 库管理页面**：用户能集中录入标准 Setup、按可见性区分权限，并内联级联上传装置示意图。
2. **重写实验编辑器 Setup 模块**：删去原有冗余的 6 大必填文本框与语义 JSON 裸框，改为下拉选择库条目一键套用，并以只读方式预览快照，同时提供偏差说明输入（在与库条目不一致时）。
3. **完善实验详情页渲染**：在参数 Tab 下以卡片形式完整展示当前实验关联的 Setup 快照及示意图。
4. **增强实验新建继承机制**：空白创建实验时，自动在后台检测并继承上一条实验的 Setup 引用。

---

## 2. 路由与外壳导航集成

1. **新路由注册 (`frontend/src/app/router.tsx`)**
   - 引入新页面组件 `SetupLibraryPage`。
   - 新增路由项：`/setup-library`。

2. **主导航项加入 (`frontend/src/shared/ui/app-shell.tsx`)**
   - 在侧边导航栏的普通栏目组中（**所有人可见，非 admin-only 分组**，因为普通 Member 需要编辑/维护自己的私有或组内 Setup），增加 “Setup 库” 菜单，配以相应的图标（如 `SettingOutlined`）。

---

## 3. API 与类型定义层设计

### 3.1 类型声明微调 (`frontend/src/shared/types/api.ts`)

```typescript
// 1. 在 SetupMethodsRead 中新增关联字段
export type SetupMethodsRead = {
  id: string;
  experiment_run_id: string;
  source_template_key: string | null;
  source_template_version: number | null;
  source_setup_library_id: string | null; // <-- 新增：指向库的 UUID（不加外键约束）
  setup_key_snapshot: string | null;
  setup_name_snapshot: string;
  setup_version_snapshot: number;
  institution_snapshot: string | null;
  apparatus_description_snapshot: string;
  methods_text_snapshot: string;
  sample_placement_description_snapshot: string;
  reaction_flow_description_snapshot: string;
  reference_paper_url_snapshot: string | null;
  unpublished_reason_snapshot: string | null;
  diagram_file_asset_id: string | null;
  is_same_as_template: boolean;
  deviation_note: string | null;
  confirmed_by_id: string | null;
  confirmed_at: string | null;
  snapshot_hash: string;
  semantic_context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

// 2. 新增可见性枚举类型
export type SetupVisibility = "private" | "group";

// 3. 新增 SetupLibraryEntry 相关类型定义
export type SetupLibraryRead = {
  id: string;
  owner_id: string;
  owner_name: string | null;
  visibility: SetupVisibility;
  is_active: boolean;
  name: string;
  institution: string | null;
  apparatus_description: string;
  methods_text: string;
  sample_placement_description: string;
  reaction_flow_description: string;
  reference_paper_url: string | null;
  unpublished_reason: string | null;
  has_diagram: boolean;
  diagram_original_name: string | null;
  diagram_download_url: string | null;
  content_hash: string;
  can_edit: boolean; // 后端根据权限（作者/Admin）动态返回，前端可用此字段控制编辑/删除按钮显隐
  semantic_context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SetupLibraryListResponse = {
  items: SetupLibraryRead[];
  total: number;
};

export type SetupLibraryCreateRequest = {
  name: string;
  institution?: string | null;
  visibility?: SetupVisibility;
  apparatus_description?: string;
  methods_text?: string;
  sample_placement_description?: string;
  reaction_flow_description?: string;
  reference_paper_url?: string | null;
  unpublished_reason?: string | null;
  semantic_context?: Record<string, unknown>;
};

export type SetupLibraryUpdateRequest = Partial<SetupLibraryCreateRequest>;
```

### 3.2 客户端 API 接口封装 (`frontend/src/features/setup-library/api.ts`)

为了保持模块化，新建接口请求文件封装后端接口：

- `listSetupLibrary(token: string)`: `GET /api/v1/setup-library`
- `getSetupLibraryEntry(token: string, id: string)`: `GET /api/v1/setup-library/{id}`
- `createSetupLibraryEntry(token: string, payload: SetupLibraryCreateRequest)`: `POST /api/v1/setup-library`
- `updateSetupLibraryEntry(token: string, id: string, payload: SetupLibraryUpdateRequest)`: `PATCH /api/v1/setup-library/{id}`
- `deactivateSetupLibraryEntry(token: string, id: string)`: `DELETE /api/v1/setup-library/{id}`（软删除）
- `uploadSetupLibraryDiagram(token: string, id: string, file: File)`: `POST /api/v1/setup-library/{id}/diagram` （Multipart Form-data）
- `downloadSetupLibraryDiagram(token: string, id: string)`: `GET /api/v1/setup-library/{id}/diagram` （用于带 Token 下载示意图 Blob）

并在现有的 `frontend/src/features/experiments/api.ts` 中新增引用关联接口：

- `createSetupMethodsFromLibrary(token: string, experimentId: string, setupLibraryId: string)`: `POST /api/v1/experiments/{id}/setup-methods/from-library`（返回类型为 `SetupMethodsMutationResponse`）

---

## 4. 鉴权图片渲染组件 (`AuthenticatedImage`) 与 Setup 库管理页设计

### 4.1 鉴权图片加载方案
本项目所有文件与示意图下载均受 Bearer Token 保护。若在前端直接使用 `<img src={diagram_download_url}>`，由于浏览器默认的图片请求不会携带 `Authorization` 请求头，会直接触发 401 错误导致图片无法加载。

**实施方案**：在 `frontend/src/shared/ui/`（或 Setup 特征模块内）实现一个通用的 `AuthenticatedImage` 组件：
- 组件接收 `path`（如 `/api/v1/setup-library/{id}/diagram` 或 `/api/v1/files/{fileId}/download`）与 `token`。
- 在 `useEffect` 中，使用带 `Authorization: Bearer ${token}` 的 `fetch` 请求该地址。
- 获取响应 Blob 后，使用 `URL.createObjectURL(blob)` 生成临时 URL 并喂给 `<img>`。
- **重要**：在组件卸载（unmount）或 `path/token` 发生变化时，必须调用 `URL.revokeObjectURL(objectUrl)` 进行资源释放，避免内存泄漏。

该组件将应用于：
1. Setup 库管理页详情抽屉中的装置图预览。
2. 实验编辑器 Setup 快照的预览。
3. 实验详情页 Setup 卡片的图片预览。

### 4.2 库管理页整体布局 (`setup-library-page.tsx`)
1. **表格视图 (`Table`)**：
   - 列表包含列：名称（配有 `private/group` 可见性标签）、机构、作者、是否含有示意图、更新时间、操作。
   - 非 Viewer 用户顶部右侧显示 “新建 Setup” 按钮。
2. **操作逻辑**：
   - **查看**：任何可见条目均可点击 “查看详情”，在右侧抽屉 (`Drawer`) 中使用 `AuthenticatedImage` 预览示意图，并只读查看全部文本。
   - **编辑**：若 `entry.can_edit === true`，显示编辑按钮，点击打开编辑弹窗。
   - **停用**：若 `entry.can_edit === true`，显示停用按钮，配有 `Popconfirm`：“确认要停用该 Setup 吗？引用此 Setup 的历史实验不受影响。”

### 4.3 级联保存流程
在表单 Modal 中，图片选择后暂存在 React 状态中，点击“保存”时发起两阶段级联请求：
1. 调用文字接口（`create` 或 `update`）保存除图片外的基本数据，获取后端返回的条目 `id`。
2. 若用户选择/替换了本地图片，在文字保存成功后，立即使用该 `id` 在后台调用 `uploadSetupLibraryDiagram` 发送 Multipart 请求。图片级联上传成功后，提示保存成功，关闭 Modal 并刷新列表。若图片上传失败，保留 Modal 并回显报错，供用户重试或只保存文字。

---

## 5. 实验编辑器重构设计

### 5.1 字段数据简化与完成度指标重写

#### 5.1.1 保证 Upsert 不会清空必填字段
由于 `PUT /api/v1/experiments/{id}/setup-methods` 的后端 `SetupMethodsUpsertRequest` 是全量接收，且 `methods_text_snapshot` 等文本在提交时仍是后端必填项。
**强约束规则**：
- 前端 `SetupMethodsValues` 类型必须**全量承载**所有快照数据：
  ```typescript
  export type SetupMethodsValues = {
    sourceSetupLibraryId: string | null;
    sourceTemplateKey: string | null;
    sourceTemplateVersion: number | null;
    setupKeySnapshot: string | null;
    setupNameSnapshot: string;
    institutionSnapshot: string;
    apparatusDescriptionSnapshot: string;
    methodsTextSnapshot: string;
    samplePlacementDescriptionSnapshot: string;
    reactionFlowDescriptionSnapshot: string;
    referencePaperUrlSnapshot: string;
    unpublishedReasonSnapshot: string;
    diagramFileAssetId: string;
    isSameAsTemplate: boolean;
    deviationNote: string;
    // 字段可保留，但 UI 废弃
    semanticContextText: string;
    confirmedAt: string | null;
    confirmedById: string | null;
  };
  ```
- 尽管用户在编辑器中只能看到“快照预览”和“偏差说明”，但 `createSetupMethodsValues` 必须完整地将 `SetupMethodsRead` 中的所有字段灌入 `SetupMethodsValues`。
- 在用户勾选“一致性开关”或修改“偏差文本”触发自动保存时，`toSetupMethodsPayload` 在生成 payload 时必须**原样带上这些只读的快照字段**，避免 upsert 导致后端数据库必填字段被置空。

#### 5.1.2 彻底重写完成度环逻辑 (`completion-indicator.tsx`)
计算每个模块完成度圆环与状态的方法在 `src/features/experiments/components/completion-indicator.tsx` 内（`baseCompletion` 方法）。
需要彻底重构 `moduleKey === "setup_methods"` 的进度比例计算规则，使其与后端简化后的 7 项校验逻辑精确对齐，移除原本对 `apparatus`、`sample_placement`、`reaction_flow` 缺失与 `confirmed` 状态的阻塞限制。
计算规则调整为以下 7 项，每项占 $100 / 7 \approx 14.3\%$：
1. 存在快照 payload。
2. 快照 `setup_key_snapshot` 非空。
3. 快照 `setup_name_snapshot` 非空。
4. 快照关联了有效示意图 `diagram_file_asset_id`。
5. 快照 `methods_text_snapshot` 非空。
6. `reference_paper_url_snapshot` 非空 或 `unpublished_reason_snapshot` 非空。
7. 快照满足偏差规则：非库/模板来源、或 `is_same_as_template === true`、或 `deviation_note` 已经填写。

同时，在 `editor-types.ts` 的 `toSetupMethodsCompletionPayload` 转换方法中，同步修剪并补齐与上述 7 项属性一一对应的字段，确保指示器正常评估。

### 5.2 编辑器界面重写与 API 接线

#### 5.2.1 编辑器页接线修改 (`experiment-editor-page.tsx`)
在主页面组件 `ExperimentEditorPage` 中，做出以下替换和修剪：
- 将原本调用 `listSetupMethodTemplates(token)` 的 `setupTemplatesQuery` 替换为调用 `listSetupLibrary(token)`。
- 将 `SetupMethodsSection` 接收的 `templateOptions` 入参属性重命名/替换为 `libraryOptions`（传入 Setup 库条目列表）。
- 废弃 `onApplyTemplate` 和 `onConfirm` 属性的回调，替换为传入由 `useExperimentEditor` 提供的 `onApplyLibrary` (对应 `applySetupLibrary` 方法)。

#### 5.2.2 界面交互细化 (`setup-methods-section.tsx`)
1. **选择下拉区**（在草稿状态下显示）：
   - 展示来自 `libraryOptions` 的 Select 下拉框，Option label 显示格式：`${entry.name} (${entry.institution || "未知机构"})`。
   - 下拉框右侧配备 “套用” 按钮以及 “预览” 链接（点击后通过 `AuthenticatedImage` 只读 Drawer 预览库条目文本与大图）。
   - 提供新标签页外链 `+ 新建/管理我的 Setup`。
2. **快照预览卡片**：
   - 渲染只读的快照字段信息。
   - 使用 `AuthenticatedImage` 读取 `/api/v1/files/{diagramFileAssetId}/download` 进行示意图的内联预览展示，并提供带 Token 的直接下载链接。
3. **偏差说明录入**：
   - 渲染 Checkbox：“与该 Setup 一致”（在 UI 文案中**全面停用“模板 / Template”**等容易混淆的词汇，统一表述为 "Setup" 库）。
   - 勾选与 `isSameAsTemplate` 绑定，未勾选时展开 `deviationNote` 输入框，失焦时自动 Upsert 触发全量保存。

---

## 6. 实验详情页与继承逻辑设计

### 6.1 详情页 Setup 卡片展示 (`experiment-detail-page.tsx`)

1. **数据整合**：
   - 在详情页新增拉取快照详情 `getSetupMethods(accessToken, experimentId)`，发生 404 时作为“无 Setup”默默忽略。
2. **参数卡片追加**：
   - 在 "参数" 选项卡中追加 `<Card title="Setup / Methods">`。
   - 展示快照名称、机构、关联文献超链接（新窗口打开）/未发表声明、Methods 说明文本。
   - 使用 `AuthenticatedImage` 读取对应 `/api/v1/files/{diagram_file_asset_id}/download` 进行示意图直接预览，并附带下载超链接。
   - 展示 `is_same_as_template` 状态。若有偏差，以警告底框显式展出 `deviation_note`。

### 6.2 空白创建继承逻辑 (`experiment-new-page.tsx`)

1. **级联克隆引用**：
   - 在 `createMutation` 过程中，在查询上次实验 `sourceExperiment` 后，尝试拉取其 Setup 详情 `getSetupMethods`。
   - **核心约束（吞掉异常）**：若拉取发生错误（如该实验未设置 Setup），或引用的原始库条目已被停用/删除（导致后端 `from-library` 报错），必须**吞掉并忽略失败**，正常退回到空白实验创建，不阻断正常实验草稿的新建。
   - **只继承库条目来源**：只在上次实验 setup 的 `source_setup_library_id` 非空时，才会在后台级联调用 `createSetupMethodsFromLibrary(token, newExperiment.id, lastSetupLibraryId)`。若是手填的 Setup（没有 `source_setup_library_id`），不进行继承操作，直接创建新空白草稿。

---

## 7. 门禁与测试验证计划

### 7.1 前端门禁要求

在提交并集成代码前，必须确保前端通过以下门禁指令：
```bash
cd frontend
bun run lint
bun run typecheck
bun run test
bun run build
```

### 7.2 测试适配范围

由于重构涉及交互变化、前端停用原有 confirm/from-template 交互，必须对下列测试文件进行同步更新：
1. **`setup-methods-section.test.tsx`**：
   - 彻底重写。移除对 6 个大表单输入、确认按钮和语义 JSON 解析报错的断言。
   - 编写新的断言：验证库条目 Select 的渲染、预览抽屉的触发、以及偏差多选框与文本框显示隐退的行为。
2. **`use-experiment-editor.test.tsx`**：
   - 将套用模板测试、确认 Setup 测试替换为 `applySetupLibrary` 测试，验证其正确分发状态。
3. **`experiment-editor-page.test.tsx`**：
   - 移除测试中对旧“确认 Setup”卡片交互的依赖，替换为选用 Setup 库并查看卡片只读预览。
4. **`experiment-new-page.test.tsx` / `experiment-detail-page.test.tsx`**：
   - 适配 Setup 快照渲染和新建时自动触发 `from-library` 接口 mock。
5. **新增 `setup-library-page.test.tsx`**：
   - 编写对管理页面的集成测试，覆盖：获取列表、新建/编辑 Modal 展开、以及文字保存 + 图片自动上传的级联交互。
