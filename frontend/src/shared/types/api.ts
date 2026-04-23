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
};

export type ExperimentCreateRequest = {
  experiment_type: string;
  material_system: string | null;
  experiment_date: string;
  objective: string | null;
};
