# Frontend Vocabulary Admin

## 本轮目标

补齐 V1 前端最后一个明确缺口 `/admin/vocabularies`，让管理员可以直接维护受控词表，而不是继续停留在占位页。

## 已交付

- 新增 `/admin/vocabularies` 实际页面
- 管理后台当前支持：
  - 列表读取
  - 按 `vocab_key` 筛选
  - 新建词条
  - 编辑已有词条
  - 启用 / 停用
- 词条编辑当前覆盖字段：
  - `value`
  - `label_zh`
  - `label_en`
  - `sort_order`
  - `is_active`
  - `metadata_json`
- `vocab_key` 只允许创建时填写；编辑时按只读展示，保持与后端 `PATCH` 边界一致

## 关键实现

- 新增 `frontend/src/features/vocabularies/api.ts`，收口 admin 词表的 `list/create/update` 请求。
- 新增 `frontend/src/features/vocabularies/vocabulary-admin-page.tsx`，统一处理筛选、创建、编辑和成功/失败提示。
- 新增共享类型：
  - `ControlledVocabularyCreateRequest`
  - `ControlledVocabularyUpdateRequest`
- 侧栏导航现在按角色动态显示：
  - `admin` 显示“受控词表”
  - `member/viewer` 隐藏入口
- 非 admin 直接访问 `/admin/vocabularies` 时不会发请求，而是显示权限提示。
- 编辑提交当前只发送脏字段，避免无关字段被整包回写。
- `metadata_json` 会在前端先校验为 JSON 对象，避免非法文本直接打到后端。

## 测试与验证

- 新增测试：`frontend/src/features/vocabularies/vocabulary-admin-page.test.tsx`
- 扩展测试：`frontend/src/shared/ui/app-shell.test.tsx`
- 本轮本地验证：
  - `bun run test`
  - `bun run typecheck`
  - `bun run lint`
  - `bun run build`

## 仍未完成

- 文件预览、批量上传、上传进度与更细的元数据编辑仍未实现
- 路由级拆包和包体优化仍未处理
