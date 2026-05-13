import { apiRequest } from "../../shared/api/client";
import type { LoginRequest, RegisterRequest, TokenResponse, UserRead } from "../../shared/types/api";

export function login(payload: LoginRequest) {
  return apiRequest<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    body: payload,
  });
}

export function register(payload: RegisterRequest) {
  return apiRequest<TokenResponse>("/api/v1/auth/register", {
    method: "POST",
    body: payload,
  });
}

export function getCurrentUser(token: string) {
  return apiRequest<UserRead>("/api/v1/auth/me", {
    token,
  });
}

export function logout(token: string | null) {
  return apiRequest<void>("/api/v1/auth/logout", {
    method: "POST",
    token,
  });
}
