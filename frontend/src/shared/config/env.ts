const fallbackApiBaseUrl = "http://127.0.0.1:8000";

function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export const env = {
  apiBaseUrl: normalizeBaseUrl(
    import.meta.env.VITE_API_BASE_URL?.trim() || fallbackApiBaseUrl,
  ),
};
