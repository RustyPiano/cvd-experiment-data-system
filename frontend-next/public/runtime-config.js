// dev/兜底默认：相对 baseURL（"/"），请求走 Vite 代理（dev）或 nginx（prod 由 entrypoint 覆写）。
window.__APP_CONFIG__ = { VITE_API_BASE_URL: '/' }
