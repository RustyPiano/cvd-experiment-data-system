import { env } from "../config/env";
import { HttpError } from "./http-error";

export const API_UNAUTHORIZED_EVENT = "cvd.api.unauthorized";

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | null;
  token?: string | null;
};

type ApiDownloadOptions = Omit<RequestInit, "body"> & {
  token?: string | null;
};

export type ApiDownloadResult = {
  blob: Blob;
  contentType: string | null;
  filename: string | null;
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

function createRequestHeaders(headers: HeadersInit | undefined, token: string | null | undefined) {
  const requestHeaders = new Headers(headers);
  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }
  return requestHeaders;
}

function dispatchUnauthorizedIfNeeded(statusCode: number, token: string | null | undefined) {
  if (statusCode === 401 && token && typeof window !== "undefined") {
    window.dispatchEvent(new Event(API_UNAUTHORIZED_EVENT));
  }
}

async function throwHttpErrorFromResponse(response: Response, token: string | null | undefined) {
  const responseText = await response.text();
  const payload = parsePayload(responseText, response.headers.get("Content-Type"));
  dispatchUnauthorizedIfNeeded(response.status, token);
  throw new HttpError(response.status, resolveDetail(payload), payload);
}

function resolveFilename(contentDisposition: string | null) {
  if (!contentDisposition) {
    return null;
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  return plainMatch?.[1]?.trim() ?? null;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}) {
  const { body, headers, token, ...rest } = options;
  const normalizedBody = normalizeBody(body);
  const requestHeaders = createRequestHeaders(headers, token);

  requestHeaders.set("Accept", "application/json");
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

  if (!response.ok) {
    await throwHttpErrorFromResponse(response, token);
  }

  const responseText = await response.text();
  const payload = parsePayload(responseText, response.headers.get("Content-Type"));
  return payload as T;
}

export async function apiDownload(path: string, options: ApiDownloadOptions = {}) {
  const { headers, token, ...rest } = options;
  const requestHeaders = createRequestHeaders(headers, token);
  requestHeaders.set("Accept", "*/*");

  const response = await fetch(resolveUrl(path), {
    ...rest,
    headers: requestHeaders,
  });

  if (!response.ok) {
    await throwHttpErrorFromResponse(response, token);
  }

  return {
    blob: await response.blob(),
    contentType: response.headers.get("Content-Type"),
    filename: resolveFilename(response.headers.get("Content-Disposition")),
  } satisfies ApiDownloadResult;
}
