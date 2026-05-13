export type UserRole = "admin" | "member" | "viewer";

export type UserRead = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  email: string;
  name: string;
  password: string;
  password_confirmation: string;
  invite_code: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserRead;
};

export type ExperimentStatus = "draft" | "submitted" | "locked" | "invalid";
export type QualityLabel = "success" | "partial" | "failed" | "unknown";

export type ExperimentRead = {
  id: string;
  run_code: string;
  owner_id: string;
  derived_from_run_id: string | null;
  derived_from_run_code: string | null;
  recipe_id: string | null;
  experiment_type: string;
  material_system: string | null;
  experiment_date: string;
  objective: string | null;
  status: ExperimentStatus;
  quality_label: QualityLabel;
  summary_result: string | null;
  invalid_reason: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  locked_at: string | null;
};

export type ExperimentListResponse = {
  items: ExperimentRead[];
  total: number;
  page: number;
  page_size: number;
};

export type ExperimentCreateRequest = {
  experiment_type: string;
  material_system: string | null;
  experiment_date: string;
  objective: string | null;
};

export type ExperimentUpdateRequest = {
  experiment_type?: string;
  material_system?: string | null;
  experiment_date?: string;
  objective?: string | null;
  summary_result?: string | null;
};

export type ExperimentInvalidateRequest = {
  reason: string;
};

export type ExperimentModuleKey =
  | "basic_info"
  | "environment"
  | "precheck"
  | "precursors"
  | "substrates"
  | "furnace_program"
  | "gas_program"
  | "process_observation"
  | "characterization"
  | "result_summary";

export type ExperimentModulePayloadRead = {
  id: string;
  experiment_run_id: string;
  module_key: ExperimentModuleKey;
  schema_version: string;
  payload_json: Record<string, unknown>;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ExperimentModulePayloadListResponse = {
  items: ExperimentModulePayloadRead[];
  total: number;
};

export type ExperimentModulePayloadUpsertRequest = {
  payload_json: Record<string, unknown>;
  schema_version?: string;
};

export type ExperimentValidationIssue = {
  module_key: string;
  field_path: string;
  message: string;
};

export type ExperimentValidationResponse = {
  ok: boolean;
  errors: ExperimentValidationIssue[];
  warnings: ExperimentValidationIssue[];
  completion_score?: number;
  blocking_count?: number;
  warning_count?: number;
};

export type FileAssetRead = {
  id: string;
  experiment_run_id: string;
  sample_id: string | null;
  uploaded_by_id: string;
  deleted_by_id: string | null;
  original_name: string;
  storage_path: string;
  download_url: string;
  content_type: string | null;
  size_bytes: number;
  sha256: string;
  method: string;
  file_category: string;
  note: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  is_deleted: boolean;
};

export type FileAssetListResponse = {
  items: FileAssetRead[];
  total: number;
};

export type AuditEventRead = {
  id: string;
  actor_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
};

export type AuditEventListResponse = {
  items: AuditEventRead[];
  total: number;
};

export type SampleRead = {
  id: string;
  sample_code: string;
  experiment_run_id: string;
  parent_sample_id: string | null;
  role: string;
  substrate_type: string | null;
  brand: string | null;
  size_mm: string | null;
  treatment: string | null;
  position_mm: number | null;
  storage_location: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by_id: string | null;
  is_deleted: boolean;
};

export type SampleUpdateRequest = {
  substrate_type?: string | null;
  brand?: string | null;
  size_mm?: string | null;
  treatment?: string | null;
  position_mm?: number | null;
  storage_location?: string | null;
  metadata_json?: Record<string, unknown>;
};

export type SampleListResponse = {
  items: SampleRead[];
  total: number;
};

export type ControlledVocabularyRead = {
  id: string;
  vocab_key: string;
  value: string;
  label_zh: string;
  label_en: string | null;
  sort_order: number;
  is_active: boolean;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ControlledVocabularyListResponse = {
  items: ControlledVocabularyRead[];
  total: number;
};

export type ControlledVocabularyCreateRequest = {
  vocab_key: string;
  value: string;
  label_zh: string;
  label_en?: string | null;
  sort_order?: number;
  is_active?: boolean;
  metadata_json?: Record<string, unknown>;
};

export type ControlledVocabularyUpdateRequest = {
  value?: string | null;
  label_zh?: string | null;
  label_en?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
  metadata_json?: Record<string, unknown> | null;
};

export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "textarea"
  | "date"
  | "multi_select"
  | "array";

export type FieldDefinitionRead = {
  id: string;
  field_key: string;
  module_key: string;
  label_zh: string;
  label_en: string | null;
  field_type: FieldType;
  unit: string | null;
  required: boolean;
  default_strategy: string | null;
  inheritable: boolean;
  vocab_key: string | null;
  sort_order: number;
  is_active: boolean;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FieldDefinitionListResponse = {
  items: FieldDefinitionRead[];
  total: number;
};

export type FieldDefinitionCreateRequest = {
  field_key: string;
  module_key: string;
  label_zh: string;
  label_en?: string | null;
  field_type?: FieldType;
  unit?: string | null;
  required?: boolean;
  default_strategy?: string | null;
  inheritable?: boolean;
  vocab_key?: string | null;
  sort_order?: number;
  is_active?: boolean;
  metadata_json?: Record<string, unknown>;
};

export type FieldDefinitionUpdateRequest = {
  field_key?: string;
  module_key?: string;
  label_zh?: string;
  label_en?: string | null;
  field_type?: FieldType;
  unit?: string | null;
  required?: boolean;
  default_strategy?: string | null;
  inheritable?: boolean;
  vocab_key?: string | null;
  sort_order?: number;
  is_active?: boolean;
  metadata_json?: Record<string, unknown> | null;
};

export type RecipeRead = {
  id: string;
  name: string;
  template_version_id: string | null;
  project_id: string | null;
  material_system: string | null;
  default_payload_json: Record<string, unknown>;
  description: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RecipeListResponse = {
  items: RecipeRead[];
  total: number;
};

export type RecipeCreateRequest = {
  name: string;
  material_system?: string;
  default_payload_json?: Record<string, unknown>;
  description?: string;
};

export type RecipeUpdateRequest = {
  name?: string;
  material_system?: string | null;
  default_payload_json?: Record<string, unknown>;
  description?: string | null;
  is_active?: boolean;
};

export type ExperimentExportRead = {
  export_version: string;
  exported_at: string;
  experiment: ExperimentRead;
  modules: ExperimentModulePayloadRead[];
  samples: SampleRead[];
  files: FileAssetRead[];
  features: Array<Record<string, unknown>>;
  provenance: {
    derived_from_run_id: string | null;
    derived_from_run_code: string | null;
  };
  audit_events: AuditEventRead[];
  counts: {
    modules: number;
    samples: number;
    files: number;
    audit_events: number;
  };
};

