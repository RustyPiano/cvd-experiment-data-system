type RuntimeConfig = {
  VITE_API_BASE_URL?: string | null;
};

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeConfig;
  }
}

const fallbackApiBaseUrl = "http://127.0.0.1:8000";

function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function resolveApiBaseUrl(options?: {
  runtimeApiBaseUrl?: string | null;
  buildTimeApiBaseUrl?: string | null;
  fallbackApiBaseUrl?: string;
}) {
  const runtimeApiBaseUrl = options?.runtimeApiBaseUrl?.trim();
  if (runtimeApiBaseUrl) {
    return normalizeBaseUrl(runtimeApiBaseUrl);
  }

  const buildTimeApiBaseUrl = options?.buildTimeApiBaseUrl?.trim();
  if (buildTimeApiBaseUrl) {
    return normalizeBaseUrl(buildTimeApiBaseUrl);
  }

  return normalizeBaseUrl(options?.fallbackApiBaseUrl ?? fallbackApiBaseUrl);
}

export const env = {
  apiBaseUrl: resolveApiBaseUrl(
    {
      runtimeApiBaseUrl: window.__APP_CONFIG__?.VITE_API_BASE_URL,
      buildTimeApiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    },
  ),
};
