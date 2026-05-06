import { apiRequest } from "../../shared/api/client";
import type {
  FieldDefinitionCreateRequest,
  FieldDefinitionListResponse,
  FieldDefinitionRead,
  FieldDefinitionUpdateRequest,
} from "../../shared/types/api";

function buildQueryString(params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
}

export function listActiveFieldDefinitions(
  accessToken: string,
  moduleKey?: string,
): Promise<FieldDefinitionListResponse> {
  return apiRequest<FieldDefinitionListResponse>(
    `/api/v1/field-definitions${buildQueryString({ module_key: moduleKey })}`,
    {
      token: accessToken,
    },
  );
}

export function getFieldDefinition(
  accessToken: string,
  fieldId: string,
): Promise<FieldDefinitionRead> {
  return apiRequest<FieldDefinitionRead>(`/api/v1/field-definitions/${fieldId}`, {
    token: accessToken,
  });
}

export function listAdminFieldDefinitions(
  accessToken: string,
  moduleKey?: string,
): Promise<FieldDefinitionListResponse> {
  return apiRequest<FieldDefinitionListResponse>(
    `/api/v1/admin/field-definitions${buildQueryString({ module_key: moduleKey })}`,
    {
      token: accessToken,
    },
  );
}

export function createFieldDefinition(
  accessToken: string,
  data: FieldDefinitionCreateRequest,
): Promise<FieldDefinitionRead> {
  return apiRequest<FieldDefinitionRead>("/api/v1/admin/field-definitions", {
    method: "POST",
    body: data,
    token: accessToken,
  });
}

export function updateFieldDefinition(
  accessToken: string,
  fieldId: string,
  data: FieldDefinitionUpdateRequest,
): Promise<FieldDefinitionRead> {
  return apiRequest<FieldDefinitionRead>(`/api/v1/admin/field-definitions/${fieldId}`, {
    method: "PATCH",
    body: data,
    token: accessToken,
  });
}

export function deactivateFieldDefinition(
  accessToken: string,
  fieldId: string,
): Promise<void> {
  return apiRequest<void>(`/api/v1/admin/field-definitions/${fieldId}/deactivate`, {
    method: "POST",
    token: accessToken,
  });
}

export function reactivateFieldDefinition(
  accessToken: string,
  fieldId: string,
): Promise<void> {
  return apiRequest<void>(`/api/v1/admin/field-definitions/${fieldId}/reactivate`, {
    method: "POST",
    token: accessToken,
  });
}