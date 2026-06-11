# Production image for frontend-next: build static assets with bun, serve with nginx.
# Self-contained — the server builds everything from source (git), no pre-built dist needed.
FROM oven/bun:1.3.14 AS build

WORKDIR /app/frontend-next

COPY frontend-next/package.json frontend-next/bun.lock ./
RUN bun install --frozen-lockfile --network-concurrency=1

COPY frontend-next ./
RUN bun run build

FROM nginx:1.29-alpine

COPY frontend-next/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY frontend-next/docker-entrypoint.d/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

COPY --from=build /app/frontend-next/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
