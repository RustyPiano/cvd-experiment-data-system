import { apiRequest } from "../../shared/api/client";
import type {
  RecipeCreateRequest,
  RecipeListResponse,
  RecipeRead,
  RecipeUpdateRequest,
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

export function listActiveRecipes(
  accessToken: string,
  materialSystem?: string,
): Promise<RecipeListResponse> {
  return apiRequest<RecipeListResponse>(
    `/api/v1/recipes${buildQueryString({ material_system: materialSystem })}`,
    {
      token: accessToken,
    },
  );
}

export function listAdminRecipes(
  accessToken: string,
  materialSystem?: string,
): Promise<RecipeListResponse> {
  return apiRequest<RecipeListResponse>(
    `/api/v1/admin/recipes${buildQueryString({ material_system: materialSystem })}`,
    {
      token: accessToken,
    },
  );
}

export function getRecipe(accessToken: string, recipeId: string): Promise<RecipeRead> {
  return apiRequest<RecipeRead>(`/api/v1/recipes/${recipeId}`, {
    token: accessToken,
  });
}

export function createRecipe(
  accessToken: string,
  data: RecipeCreateRequest,
): Promise<RecipeRead> {
  return apiRequest<RecipeRead>("/api/v1/admin/recipes", {
    method: "POST",
    body: data,
    token: accessToken,
  });
}

export function updateRecipe(
  accessToken: string,
  recipeId: string,
  data: RecipeUpdateRequest,
): Promise<RecipeRead> {
  return apiRequest<RecipeRead>(`/api/v1/admin/recipes/${recipeId}`, {
    method: "PATCH",
    body: data,
    token: accessToken,
  });
}

export function deactivateRecipe(accessToken: string, recipeId: string): Promise<void> {
  return apiRequest<void>(`/api/v1/admin/recipes/${recipeId}`, {
    method: "DELETE",
    token: accessToken,
  });
}
