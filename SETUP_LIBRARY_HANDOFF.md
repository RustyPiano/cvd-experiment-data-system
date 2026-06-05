# Setup 库改造 — 交接文档

> 写给后续 Agent。目的：把"实验 Setup/Methods"从"每条实验重填的大表单 + 手动确认"重构为"可复用的 **Setup 库**：建一次、反复引用、引用即冻结快照"。
>
> **当前状态：后端已全部完成且全绿（ruff + 238 测试通过）；前端尚未开始（Task #4、#5）。**

## 1. 背景与动机

- 需求来源：与导师 2026-06-01 的讨论，记录在 `/Users/wangsiyuan/Documents/研究生/材料学 Agent/20260601讨论/20260601_讨论记录整理.md`（§6、§8 最关键）。
- 核心要求：每个实验必须记录 setup/methods，否则"同样 800℃"在不同 setup 下不可比；setup **至少**包含 ①装置/流程示意图 ②类似 methods 的文字 ③论文链接（未发表则至少图+文字）。重点是**降低门槛**、能**预填给外部用户（北航）**、组内**写法趋同**。
- 旧实现的问题（详见 `IMPLEMENTATION_GAP_REPORT_2026-04-23.md` 之后的对话分析）：每条实验要填 6 个必填长文本 + 跨页传图 + 手动"确认 Setup"，且改一下就要重新确认；语义 JSON 裸框；详情页根本不显示 setup。比导师说的"至少"重得多，方向相反。
- 新方向：**Setup = 可复用库实体**（owner + 可见性），实验里只"选一个 + 记本次偏差"，引用那一刻把内容冻结进 `ExperimentSetupSnapshot`（含把库的图复制成本实验的 `FileAsset`）。库后续怎么改都不影响已引用的历史实验。

## 2. 锁定的设计决策（不要再推翻，已和用户确认）

1. **共享模型**：每个库条目有 `owner_id` + `visibility`（`private` / `group`）。组内可见者人人可"引用"，仅作者/管理员可"改"；管理员可建"官方"组内 setup（例如预填北航）。viewer 不能建。
2. **版本**：就地编辑，不做显式版本号。引用时冻结的快照就是溯源记录。
3. **图的强制时机**：草稿可以没图；**提交/锁定时**才强制"图 + methods + 论文/未发表"。
4. **快照层保留**：`ExperimentSetupSnapshot` 继续作为"冻结层"。新增的 `source_setup_library_id` 是普通 `Uuid` 列、**故意不加 DB 外键**（与 `experiment_runs.project_id/recipe_id` 一致，因为 SQLite 测试库不能 `ALTER ADD CONSTRAINT`）。
5. **校验放宽到"至少"**：提交时必填 = 图 + `methods_text` + (`reference_paper_url` 或 `unpublished_reason`) + (若有来源且不一致则 `deviation_note`)。`apparatus/sample_placement/reaction_flow` **不再阻塞**。**不再要求手动确认**（confirm 接口仍在但不卡提交）。
6. **语义 JSON** 从用户表单移除（前端待办里删掉），后端字段保留给管理员高级区。

## 3. 已完成（后端，全绿）

### 3.1 数据模型 / 迁移
- 新表 `setup_library_entries`：`backend/app/models/setup_library.py`（`SetupLibraryEntry` + `SetupVisibility` 枚举）。字段：`owner_id`、`visibility`、`is_active`、`name`、`institution`、`apparatus_description`、`methods_text`、`sample_placement_description`、`reaction_flow_description`、`reference_paper_url`、`unpublished_reason`、独立的图 blob 列（`diagram_storage_path/sha256/content_type/size_bytes/original_name`）、`content_hash`、`semantic_context`、时间戳。有 `has_diagram` property。
- `ExperimentSetupSnapshot` 新增 `source_setup_library_id`（`backend/app/models/setup_methods.py`，普通 Uuid 无 FK）。
- 迁移 `backend/alembic/versions/20260606_0020_add_setup_library.py`（已在 SQLite + 升降级验证）。`__init__.py` 已导出。

### 3.2 服务 / 仓储 / API
- `backend/app/services/setup_library_service.py`（`SetupLibraryService`）：`list_entries`、`get_entry`、`get_visible_entry`(返回 ORM 模型给 from-library 用)、`create_entry`、`update_entry`、`deactivate_entry`、`upload_diagram`、`resolve_diagram_download`。可见性/权限：`_can_view`（admin|owner|group）、`_can_edit`（admin|owner）、`_require_author`（非 viewer）。审计 entity_type=`setup_library_entry`。
- `backend/app/repositories/setup_library_repository.py`：`list_visible`（已 `joinedload(owner)`）、`get_by_id`、`save`。
- `backend/app/schemas/setup_library.py`：`SetupLibraryCreate/Update/Read/ListResponse`。`Read` 含 `owner_name`、`has_diagram`、`diagram_download_url`、`can_edit`。
- `backend/app/api/v1/endpoints/setup_library.py`（已注册进 `api/v1/router.py`），前缀 `/api/v1/setup-library`：

| 方法 & 路径 | 作用 |
|---|---|
| `GET /api/v1/setup-library` | 列出我可见的（我的私有 + 组内），active only |
| `POST /api/v1/setup-library` | 创建（非 viewer） |
| `GET /api/v1/setup-library/{id}` | 详情（可见性校验） |
| `PATCH /api/v1/setup-library/{id}` | 改（owner/admin） |
| `DELETE /api/v1/setup-library/{id}` | 停用（软） |
| `POST /api/v1/setup-library/{id}/diagram` | 上传/替换装置图（multipart `file`） |
| `GET /api/v1/setup-library/{id}/diagram` | 下载装置图 |

### 3.3 实验接入库
- 新端点 `POST /api/v1/experiments/{id}/setup-methods/from-library`，body `{ "setup_library_id": "<uuid>" }`（`backend/app/api/v1/endpoints/experiments.py`）。
- 服务 `SetupMethodsService.create_from_library`（`backend/app/services/setup_methods_service.py`）：把库内容冻结进快照，把库图复制成本实验 `asset_role=setup_diagram` 的 `FileAsset`，置 `source_setup_library_id`、`is_same_as_template=True`。库无图时返回 warning（不报错）。响应是 `SetupMethodsMutationResponse { data: SetupMethodsRead, warnings: [] }`。
- `SetupMethodsRead` 已含 `source_setup_library_id`。
- 旧的 `from-template`、`upsert(PUT)`、`confirm` 端点**仍保留可用**（向后兼容），前端可以不再用 confirm/from-template。

### 3.4 校验简化（`backend/app/services/`）
- `setup_methods_content_validation.py`：必填收敛为 setup_key、setup_name、diagram、methods_text、reference/unpublished、deviation(若有来源且不一致)。新增 `setup_has_source(snapshot)` 辅助（`source_setup_library_id` 或 `source_template_key` 任一非空）。apparatus/sample_placement/reaction_flow **不再必填**。
- `experiment_validation_service.py`：`_validate_setup_methods` **删除了 confirmed_at 要求**；完成度评分 setup 检查项从 11 降到 7（去掉 apparatus/sample_placement/reaction_flow/confirmed），偏差检查改用 `setup_has_source`。注意：**完成度分数是 `通过项 / len(checks)`，改 checks 会改分数**——有几个测试硬编码了分数（见下）。

### 3.5 子代理审核后的修复（都已修 + 加回归测试）
- **HIGH**：`create_from_library` 二次引用会遗留旧 diagram 文件/blob → 已修：替换时软删旧 `setup_diagram` 文件 + 删 blob（`_soft_delete_diagram_file`）。测试 `test_from_library_twice_replaces_diagram_without_orphans`。
- **HIGH**：`clone_snapshot` 丢 `source_setup_library_id` → 已修。测试 `test_clone_snapshot_preserves_library_provenance`。
- MEDIUM：列表 N+1 → `joinedload(owner)`；图复制静默失败 → 库声明了图却复制失败时改抛 422（`_copy_library_diagram`）。NIT：可见性比较改用枚举。

### 3.6 受影响的后端测试（已更新，全绿）
- `tests/api/test_setup_library.py`（新，8 个）、`tests/api/test_setup_methods.py`（新增 from-library / 二次引用 / clone 溯源测试；`confirm_rejects_missing_apparatus` 改为 `allows`）。
- `tests/services/test_experiment_validation_service.py`：apparatus 改为"不阻塞"；confirm 评分测试改名；硬编码分数更新（owner_id 9→11，confirmation 41→36）。
- `tests/api/test_experiments.py`：completion_score 硬编码 31→36、69→64。
- ⚠️ **如果再改 checks/校验，这些硬编码分数会变**，跑测试看实际值更新即可。

### 3.7 跑后端门禁
```bash
cd backend
uv run ruff check . && uv run ruff format --check . && uv run pytest -q
```
当前：ruff 全过，**238 passed**。

## 4. 待完成（前端 Task #4）：API 客户端 + 库管理页 + 编辑器 Setup 区重写

按"绿色增量"推进：先做纯新增（不破坏现有测试），再做要改测试的编辑器重写。

### 4.1 先做纯新增（安全）
1. **类型** `frontend/src/shared/types/api.ts`：
   - `SetupMethodsRead` 加 `source_setup_library_id: string | null`。
   - 新增 `SetupLibraryRead`（对齐后端 `SetupLibraryRead`：`id, owner_id, owner_name, visibility:"private"|"group", is_active, name, institution, apparatus_description, methods_text, sample_placement_description, reaction_flow_description, reference_paper_url, unpublished_reason, has_diagram, diagram_original_name, diagram_download_url, content_hash, can_edit, semantic_context, created_at, updated_at`）、`SetupLibraryListResponse {items,total}`、`SetupLibraryCreateRequest`、`SetupLibraryUpdateRequest`。
2. **API 客户端** `frontend/src/features/experiments/api.ts`（或新建 `features/setup-library/api.ts`）：
   - `listSetupLibrary(token)` → `GET /api/v1/setup-library`
   - `getSetupLibraryEntry`、`createSetupLibraryEntry`、`updateSetupLibraryEntry`、`deactivateSetupLibraryEntry`
   - `uploadSetupLibraryDiagram(token,id,file)`（multipart，参考 `uploadExperimentFile` 的 FormData 写法）
   - `createSetupMethodsFromLibrary(token, experimentId, setupLibraryId)` → `POST .../setup-methods/from-library`，返回 `SetupMethodsMutationResponse`
3. **库管理页**（新建 `frontend/src/features/setup-library/setup-library-page.tsx`）+ 路由 `frontend/src/app/router.tsx` 加 `/setup-library`，并在 `frontend/src/shared/ui/app-shell.tsx` nav 加入口（**注意：放在所有人可见处，不是 admin-only 分组**，因为成员要管理自己的 setup）。页面：列出我的+组内（`can_edit` 决定能否改）、创建/编辑表单（名称、机构、可见性 private/group、methods、装置说明/样品放置/反应流程选填、论文链接/未发表二选一）、**内联上传装置图**（调 `uploadSetupLibraryDiagram`，显示 `has_diagram`/缩略/下载链接）。

### 4.2 再做编辑器 Setup 区重写（会动测试）
4. **`frontend/src/features/experiments/components/setup-methods-section.tsx` 重写**为：
   - 一个"选择 Setup 库条目"的 `Select`（来自 `listSetupLibrary`，默认上次用的），选中后调用 `onApplyLibrary(id)`（即 `createSetupMethodsFromLibrary`）。
   - 选中后展示**只读预览卡**（名称、机构、装置图缩略/下载、methods、论文/未发表）。
   - 一个"本次与该 Setup 一致"开关 + 不一致时出现"本次偏差"`deviationNote` 文本框（仍走 `PUT setup-methods` upsert，带 `is_same_as_template`/`deviation_note`）。
   - "+ 新建/管理我的 Setup" 链接到 `/setup-library`（建议新标签或返回后刷新）。
   - **删除**：6 个必填长文本框、"确认 Setup" 按钮、"语义上下文 JSON" 文本框、`onApplyTemplate`/`onConfirm` 相关 UI。
5. **`frontend/src/features/experiments/editor-types.ts`**：
   - `SetupMethodsValues` 加 `sourceSetupLibraryId: string | null`，移除对 `semanticContextText`/`confirmedAt` 的 UI 依赖（字段可留但不在 UI 用）。
   - `validateSectionValues` 里**删掉**对 setup 的"语义 JSON 解析"校验（`semanticContextText` 那段，避免 JSON 报错卡保存）。
   - `createSetupMethodsValues` / `toSetupMethodsPayload` / `toSetupMethodsCompletionPayload` 相应调整（completion 不再要求 apparatus/placement/flow/confirmed）。
6. **`frontend/src/features/experiments/use-experiment-editor.ts`**：把 `confirmSetupMethods`、`createSetupMethodsFromTemplate` 处理函数替换/新增为 `applySetupLibrary`（调 from-library，成功后 `replaceSetupMethodsSnapshot`）。`experiment-editor-page.tsx` 把 `templateOptions` 改成传 `libraryOptions`，去掉 `onConfirm`。

## 5. 待完成（前端 Task #5）：详情页 Setup 卡 + 继承 + 门禁

7. **详情页 Setup 卡** `frontend/src/features/experiments/experiment-detail-page.tsx`：在"参数"Tab 加一个 `renderSetupMethods` 卡（目前完全没有 setup 展示）。需要拉 `getSetupMethods(experimentId)`（404 当作空），展示：装置图缩略/下载、setup 名称、methods、本次偏差、来源库（`source_setup_library_id`）。
8. **空白创建继承上次 Setup** `frontend/src/features/experiments/experiment-new-page.tsx`：当前"立即创建"只继承 environment+precheck（sessionStorage）。增加：创建后若上次实验有 setup，自动对新实验调一次 `createSetupMethodsFromLibrary`（用上次的 `source_setup_library_id`，若有）。clone(派生草稿) 已经在后端复制 setup，无需动。
9. **跑前端门禁并修**：
   ```bash
   cd frontend
   bun run lint && bun run typecheck && bun run test && bun run build
   ```
   （`test` 实际跑 `node scripts/run-tests.mjs`；注意 `scripts/run-tests.mjs` 在本次会话前已有未提交改动。）

### 5.1 必然要改写的前端测试（编码了旧 confirm/template 流程）
- `src/features/experiments/components/setup-methods-section.test.tsx`（整段重写——旧的 6 字段/确认/JSON 都没了）
- `src/features/experiments/experiment-editor-page.test.tsx`（断言了 setup 区行为/确认）
- `src/features/experiments/use-experiment-editor.test.tsx`（confirm/template 处理函数）
- 可能：`experiment-detail-page.test.tsx`（加了 setup 卡后）、`experiment-new-page.test.tsx`（继承 setup 后）
- 新增：库管理页测试。

## 6. 关键陷阱 / 注意事项
- **完成度分数硬编码**：后端若再动 setup checks，`tests/services/test_experiment_validation_service.py` 与 `tests/api/test_experiments.py` 里的整数断言会变，跑一次取实际值更新。
- **图归属**：库的图是**独立 blob**（不是 FileAsset）；引用时才复制成本实验的 FileAsset。库管理页上传走 `/setup-library/{id}/diagram`，**不要**走实验文件页那套。
- **`source_setup_library_id` 无 DB 外键**（SQLite 限制），是有意的，别加。
- **from-library 幂等**：二次调用会软删旧图，前端重复选不同 setup 是安全的。
- **可见性**：列表只返回 active 且可见的；库管理页用 `can_edit` 控制"编辑/停用"按钮的显隐。
- **viewer**：不能建库、不能 from-library（后端会 403）。

## 7. 当前 git 状态（截至交接）
- 后端新增/改动均未提交；前端未动。
- 本次会话新增文件：`backend/app/{models,schemas,repositories,services}/setup_library*.py`、`backend/app/api/v1/endpoints/setup_library.py`、`backend/alembic/versions/20260606_0020_add_setup_library.py`、`backend/tests/api/test_setup_library.py`、本交接文档。
- 建议下一个 Agent：先读本文档 → `git status`/`git diff` 看后端改动 → 跑后端门禁确认 238 绿 → 从 §4.1 纯新增开始做前端。任务清单见 TaskList（#4、#5 pending）。
