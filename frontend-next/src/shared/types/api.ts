// API 类型薄别名层。
// 真值来源：后端 OpenAPI（bun run gen:api → ./openapi.d.ts，含 components["schemas"]）。
// 本文件把生成 schema 以旧调用点使用的名字重新导出，保持业务代码导入名不变。
// 注意：后端对 role / status / quality_label 未发枚举约束（OpenAPI 里是裸 string），
// 故这三个领域枚举在此显式声明字面量联合，并窄化承载它们的读模型字段。
import type { components } from './openapi'

type Schemas = components['schemas']

/* ---------- 领域枚举（后端为裸 string，显式声明联合） ---------- */
export type UserRole = 'admin' | 'member' | 'viewer'
export type ExperimentStatus = 'draft' | 'submitted' | 'locked' | 'invalid'
export type QualityLabel = 'success' | 'partial' | 'failed' | 'unknown'

/* ---------- 具名枚举（后端已发约束，直接取生成联合） ---------- */
export type ExperimentModuleKey = Schemas['ExperimentModuleKey']
export type FieldType = Schemas['FieldType']
export type SetupVisibility = Schemas['SetupVisibility']
export type SampleRole = Schemas['SampleRole']

/* ---------- 叶子读模型：窄化裸 string 枚举字段 ---------- */
export type UserRead = Omit<Schemas['UserRead'], 'role'> & { role: UserRole }
export type ExperimentRead = Omit<
  Schemas['ExperimentRead'],
  'status' | 'quality_label'
> & { status: ExperimentStatus; quality_label: QualityLabel }
export type DashboardMemberStat = Omit<
  Schemas['DashboardMemberStat'],
  'role'
> & {
  role: UserRole
}

/* ---------- 容器类型：用窄化后的叶子类型重建嵌套 ---------- */
export type TokenResponse = Omit<Schemas['TokenResponse'], 'user'> & {
  user: UserRead
}
export type ExperimentListResponse = Omit<
  Schemas['ExperimentListResponse'],
  'items'
> & { items: ExperimentRead[] }
export type DashboardOverview = Omit<
  Schemas['DashboardOverview'],
  'members'
> & {
  members: DashboardMemberStat[]
}
export type ExperimentExportRead = Omit<
  Schemas['ExperimentExportRead'],
  'experiment'
> & { experiment: ExperimentRead }

/* ---------- 直接别名（名称一致） ---------- */
export type AuditEventListResponse = Schemas['AuditEventListResponse']
export type AuditEventRead = Schemas['AuditEventRead']
export type ControlledVocabularyListResponse =
  Schemas['ControlledVocabularyListResponse']
export type ControlledVocabularyRead = Schemas['ControlledVocabularyRead']
export type DashboardTotals = Schemas['DashboardTotals']
export type DashboardTrendPoint = Schemas['DashboardTrendPoint']
export type ExperimentInvalidateRequest = Schemas['ExperimentInvalidateRequest']
export type ExperimentModulePayloadListResponse =
  Schemas['ExperimentModulePayloadListResponse']
export type ExperimentModulePayloadRead = Schemas['ExperimentModulePayloadRead']
export type ExperimentValidationIssue = Schemas['ExperimentValidationIssue']
// 后端 OpenAPI 仅把 `ok` 标为 required，但 errors/warnings 始终随响应返回（FastAPI
// default_factory=list）。编辑器逻辑按「恒为数组」编写，故在别名层窄化为必有数组。
export type ExperimentValidationResponse = Omit<
  Schemas['ExperimentValidationResponse'],
  'errors' | 'warnings'
> & {
  errors: ExperimentValidationIssue[]
  warnings: ExperimentValidationIssue[]
}
export type FieldDefinitionListResponse = Schemas['FieldDefinitionListResponse']
export type FieldDefinitionRead = Schemas['FieldDefinitionRead']
export type FileAssetListResponse = Schemas['FileAssetListResponse']
export type FileAssetRead = Schemas['FileAssetRead']
export type LoginRequest = Schemas['LoginRequest']
export type RecipeListResponse = Schemas['RecipeListResponse']
export type RecipeRead = Schemas['RecipeRead']
export type RegisterRequest = Schemas['RegisterRequest']
export type SampleListResponse = Schemas['SampleListResponse']
export type SampleRead = Schemas['SampleRead']
export type SetupLibraryListResponse = Schemas['SetupLibraryListResponse']
export type SetupLibraryRead = Schemas['SetupLibraryRead']
// warnings 始终随响应返回（后端 default_factory=list），编辑器按恒为数组处理。
export type SetupMethodsMutationResponse = Omit<
  Schemas['SetupMethodsMutationResponse'],
  'warnings'
> & { warnings: ExperimentValidationIssue[] }
export type SetupMethodsRead = Schemas['SetupMethodsRead']

/* ---------- 写模型（旧 *Request → 生成 *Create/Update/Upsert） ---------- */
export type ControlledVocabularyCreateRequest =
  Schemas['ControlledVocabularyCreate']
export type ControlledVocabularyUpdateRequest =
  Schemas['ControlledVocabularyUpdate']
export type VocabularyReorderRequest = Schemas['VocabularyReorderRequest']
export type VocabularyGroupUpsertRequest =
  Schemas['VocabularyGroupUpsertRequest']
export type ExperimentCreateRequest = Schemas['ExperimentCreate']
export type ExperimentUpdateRequest = Schemas['ExperimentUpdate']
// schema_version 后端有默认值 'cvd_v1'，openapi-typescript 将其生成为 required；
// 但前端按旧契约省略该字段（交由后端默认），故在别名层放宽为可选。
export type ExperimentModulePayloadUpsertRequest = Omit<
  Schemas['ExperimentModulePayloadUpsert'],
  'schema_version'
> & { schema_version?: string }
export type FieldDefinitionCreateRequest = Schemas['FieldDefinitionCreate']
export type FieldDefinitionUpdateRequest = Schemas['FieldDefinitionUpdate']
export type RecipeCreateRequest = Schemas['RecipeCreate']
export type RecipeUpdateRequest = Schemas['RecipeUpdate']
export type SampleUpdateRequest = Schemas['SampleUpdate']
export type SetupLibraryCreateRequest = Schemas['SetupLibraryCreate']
export type SetupLibraryUpdateRequest = Schemas['SetupLibraryUpdate']
// 旧契约的 upsert 载荷含 setup_key_snapshot（编辑器在 toSetupMethodsPayload 中写入），
// 但后端生成的 SetupMethodsUpsert 未列出该字段；保留为可选以维持原载荷形状不变。
export type SetupMethodsUpsertRequest = Schemas['SetupMethodsUpsert'] & {
  setup_key_snapshot?: string | null
}

/* ---------- 新增写/读模型（旧 api.ts 未导出，新代码会用到） ---------- */
export type ExperimentFromRecipeCreate = Schemas['ExperimentFromRecipeCreate']
export type ExperimentSaveAsRecipeRequest =
  Schemas['ExperimentSaveAsRecipeRequest']
export type SampleCreate = Schemas['SampleCreate']
export type SetupMethodsFromLibraryRequest =
  Schemas['SetupMethodsFromLibraryRequest']
export type ExperimentAnalysisExportRead =
  Schemas['ExperimentAnalysisExportRead']

/* 逃生舱：需要未别名的 schema 时直接用 components["schemas"][...] */
export type { components, paths } from './openapi'
