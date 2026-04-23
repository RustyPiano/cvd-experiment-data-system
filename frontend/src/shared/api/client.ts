import { env } from "../config/env";
import { HttpError } from "./http-error";

export const API_UNAUTHORIZED_EVENT = "cvd.api.unauthorized";

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | null;
  token?: string | null;
};

function resolveUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return `${env.apiBaseUrl}${path}`;
}

function normalizeBody(body: ApiRequestOptions["body"]) {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof ArrayBuffer
  ) {
    return body;
  }

  return JSON.stringify(body);
}

function resolveDetail(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }

  return null;
}

function parsePayload(responseText: string, contentType: string | null) {
  if (!responseText) {
    return null;
  }

  const shouldParseJson =
    contentType?.includes("application/json") ||
    contentType?.includes("+json") ||
    responseText.startsWith("{") ||
    responseText.startsWith("[");

  if (!shouldParseJson) {
    return responseText;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return responseText;
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}) {
  const { body, headers, token, ...rest } = options;
  const normalizedBody = normalizeBody(body);
  const requestHeaders = new Headers(headers);

  requestHeaders.set("Accept", "application/json");
  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }
  if (normalizedBody && !(body instanceof FormData) && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(resolveUrl(path), {
    ...rest,
    body: normalizedBody,
    headers: requestHeaders,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const responseText = await response.text();
  const payload = parsePayload(responseText, response.headers.get("Content-Type"));

  if (!response.ok) {
    if (response.status === 401 && token && typeof window !== "undefined") {
      window.dispatchEvent(new Event(API_UNAUTHORIZED_EVENT));
    }

    throw new HttpError(response.status, resolveDetail(payload), payload);
  }

  return payload as T;
}
