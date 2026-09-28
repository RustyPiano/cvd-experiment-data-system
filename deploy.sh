#!/usr/bin/env bash
# 生产部署脚本（hongkong 服务器 / cvd.rustypiano.com）
# 用法: ./deploy.sh   —— 自动备份 → 拉取最新代码 → 构建 → 迁移(后端启动时自动) → 健康检查
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE="docker compose -f $COMPOSE_FILE"

HEADER="============================================================"
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}${HEADER}${NC}"
echo -e "${GREEN}  CVD 实验数据采集系统 — 生产部署${NC}"
echo -e "${GREEN}${HEADER}${NC}"
echo

if [ ! -f ".env" ]; then
    echo -e "${RED}[错误] 缺少 .env 文件${NC}" >&2
    echo "请基于 .env.production.example 创建并填写（COMPOSE_DATABASE_URL / JWT_SECRET_KEY 等）。"
    exit 1
fi

load_database_target_from_env() {
    local key value
    while IFS='=' read -r key value; do
        value="${value%$'\r'}"
        case "$value" in
            \"*\") value="${value#\"}"; value="${value%\"}" ;;
            \'*\') value="${value#\'}"; value="${value%\'}" ;;
        esac
        case "$key" in
            COMPOSE_DATABASE_URL)
                [ -n "${COMPOSE_DATABASE_URL:-}" ] || COMPOSE_DATABASE_URL="$value"
                ;;
            PG_CONTAINER) [ -n "${PG_CONTAINER:-}" ] || PG_CONTAINER="$value" ;;
            POSTGRES_USER) [ -n "${POSTGRES_USER:-}" ] || POSTGRES_USER="$value" ;;
            POSTGRES_DB) [ -n "${POSTGRES_DB:-}" ] || POSTGRES_DB="$value" ;;
        esac
    done < "$SCRIPT_DIR/.env"
}
load_database_target_from_env

PG_CONTAINER="${PG_CONTAINER:-}"
POSTGRES_USER="${POSTGRES_USER:-}"
POSTGRES_DB="${POSTGRES_DB:-}"
COMPOSE_DATABASE_URL="${COMPOSE_DATABASE_URL:-}"

invalid_database_target_value() {
    case "$1" in
        ""|*[[:space:]]*|*YOUR_*|*your_*|*CHANGE_ME*|*change-me*|*CHANGEME*|*changeme*|*PLACEHOLDER*|*placeholder*|*'<'*|*'>'*)
            return 0
            ;;
    esac
    return 1
}

validate_database_target() {
    local key value url_tail authority path userinfo hostport url_user url_host url_db
    for key in PG_CONTAINER POSTGRES_USER POSTGRES_DB; do
        value="${!key}"
        if invalid_database_target_value "$value"; then
            echo -e "${RED}[错误] 数据库目标配置 ${key} 缺失、含空白或仍是占位符，拒绝继续。${NC}" >&2
            return 1
        fi
    done
    if invalid_database_target_value "$COMPOSE_DATABASE_URL"; then
        echo -e "${RED}[错误] 数据库目标配置 COMPOSE_DATABASE_URL 缺失、含空白或仍是占位符，拒绝继续。${NC}" >&2
        return 1
    fi
    case "$COMPOSE_DATABASE_URL" in
        postgresql://*|postgresql+psycopg://*) ;;
        *)
            echo -e "${RED}[错误] 数据库目标配置 COMPOSE_DATABASE_URL 格式无效，拒绝继续。${NC}" >&2
            return 1
            ;;
    esac
    url_tail="${COMPOSE_DATABASE_URL#*://}"
    case "$url_tail" in
        */*) ;;
        *)
            echo -e "${RED}[错误] 数据库目标配置 COMPOSE_DATABASE_URL 缺少数据库名，拒绝继续。${NC}" >&2
            return 1
            ;;
    esac
    authority="${url_tail%%/*}"
    path="${url_tail#*/}"
    case "$authority" in
        *@*) ;;
        *)
            echo -e "${RED}[错误] 数据库目标配置 COMPOSE_DATABASE_URL 缺少用户或主机，拒绝继续。${NC}" >&2
            return 1
            ;;
    esac
    userinfo="${authority%@*}"
    hostport="${authority##*@}"
    url_user="${userinfo%%:*}"
    url_host="${hostport%%:*}"
    url_db="${path%%\?*}"
    url_db="${url_db%%\#*}"
    if [ "$POSTGRES_USER" != "$url_user" ]; then
        echo -e "${RED}[错误] 数据库目标配置 POSTGRES_USER 与 COMPOSE_DATABASE_URL 不一致，拒绝继续。${NC}" >&2
        return 1
    fi
    if [ "$PG_CONTAINER" != "$url_host" ]; then
        echo -e "${RED}[错误] 数据库目标配置 PG_CONTAINER 与 COMPOSE_DATABASE_URL 不一致，拒绝继续。${NC}" >&2
        return 1
    fi
    if [ "$POSTGRES_DB" != "$url_db" ]; then
        echo -e "${RED}[错误] 数据库目标配置 POSTGRES_DB 与 COMPOSE_DATABASE_URL 不一致，拒绝继续。${NC}" >&2
        return 1
    fi
}
validate_database_target
export COMPOSE_DATABASE_URL PG_CONTAINER POSTGRES_USER POSTGRES_DB

echo "[1/4] 部署前备份数据库与文件..."
if [ ! -x "./backup.sh" ]; then
    echo -e "${RED}[错误] 缺少可执行的 backup.sh，拒绝无备份部署。${NC}" >&2
    exit 1
fi
./backup.sh || { echo -e "${RED}[错误] 备份失败，已中止部署${NC}" >&2; exit 1; }
echo

echo "[2/4] 拉取最新代码..."
git pull --ff-only
echo

# Schema 哨兵：库版本必须存在于当前代码迁移链，否则后端启动迁移会崩溃循环。
if [ "${SKIP_SCHEMA_GUARD:-0}" != "1" ]; then
    if ! SCHEMA_STATE=$(docker exec "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -tAc "
            SELECT CASE
                WHEN to_regclass('public.alembic_version') IS NOT NULL
                    THEN 'versioned'
                WHEN EXISTS (
                    SELECT 1
                    FROM pg_class AS relation
                    JOIN pg_namespace AS namespace
                      ON namespace.oid = relation.relnamespace
                    WHERE namespace.nspname = 'public'
                      AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
                    UNION ALL
                    SELECT 1
                    FROM pg_proc AS routine
                    JOIN pg_namespace AS namespace
                      ON namespace.oid = routine.pronamespace
                    WHERE namespace.nspname = 'public'
                      AND routine.prokind IN ('f', 'p')
                    UNION ALL
                    SELECT 1
                    FROM pg_type AS data_type
                    JOIN pg_namespace AS namespace
                      ON namespace.oid = data_type.typnamespace
                    WHERE namespace.nspname = 'public'
                      AND data_type.typtype IN ('e', 'd')
                )
                    THEN 'nonempty-no-alembic'
                ELSE 'empty'
            END AS schema_state
        " 2>/dev/null); then
        echo -e "${RED}[中止] 无法连接数据库读取 schema 状态，拒绝继续。${NC}" >&2
        exit 1
    fi
    SCHEMA_STATE=$(printf '%s' "$SCHEMA_STATE" | tr -d '[:space:]')
    case "$SCHEMA_STATE" in
        empty)
            echo "  已确认 public schema 为空，将由后端执行 initial migration。"
            ;;
        nonempty-no-alembic)
            echo -e "${RED}[中止] 数据库非空但缺少 alembic_version，无法证明 schema 来源。${NC}" >&2
            exit 1
            ;;
        versioned)
            if ! DB_REV=$(docker exec "$PG_CONTAINER" psql -U "$POSTGRES_USER" \
                -d "$POSTGRES_DB" -tAc \
                "SELECT version_num FROM alembic_version LIMIT 1" 2>/dev/null); then
                echo -e "${RED}[中止] alembic_version 存在但无法读取，拒绝继续。${NC}" >&2
                exit 1
            fi
            DB_REV=$(printf '%s' "$DB_REV" | tr -d '[:space:]')
            if [ -z "$DB_REV" ] || ! grep -RqsF -- "$DB_REV" backend/alembic/versions/; then
                echo -e "${RED}[中止] 数据库迁移版本 ${DB_REV:-<空>} 不在当前代码迁移链中。${NC}" >&2
                echo "  跳过检查：SKIP_SCHEMA_GUARD=1 ./deploy.sh" >&2
                exit 1
            fi
            ;;
        *)
            echo -e "${RED}[中止] 无法识别数据库 schema 状态：${SCHEMA_STATE:-<空>}。${NC}" >&2
            exit 1
            ;;
    esac
fi

echo "[3/4] 构建并启动容器（后端启动时自动执行 alembic 迁移）..."
$COMPOSE up -d --build
echo

echo "[4/4] 等待服务健康检查..."
MAX_WAIT="${MAX_WAIT:-180}"
HEALTH_POLL_INTERVAL="${HEALTH_POLL_INTERVAL:-5}"
WAITED=0
ALL_HEALTHY=false
if ! EXPECTED_SERVICES=$($COMPOSE config --services 2>/dev/null); then
    echo -e "${RED}[中止] 无法读取 Compose 预期服务集合。${NC}" >&2
    exit 1
fi
EXPECTED_SERVICES=$(printf '%s\n' "$EXPECTED_SERVICES" | sed '/^[[:space:]]*$/d' | sort -u)
if [ -z "$EXPECTED_SERVICES" ]; then
    echo -e "${RED}[中止] Compose 未定义任何预期服务。${NC}" >&2
    exit 1
fi
while [ $WAITED -lt $MAX_WAIT ]; do
    PS_ROWS=$($COMPOSE ps --all --format '{{.Service}}|{{.State}}|{{.Health}}' 2>/dev/null || true)
    ACTUAL_SERVICES=$(printf '%s\n' "$PS_ROWS" | awk -F '|' 'NF >= 1 && $1 != "" {print $1}' | sort -u)
    STATUS="no"
    if [ -n "$PS_ROWS" ] && [ "$ACTUAL_SERVICES" = "$EXPECTED_SERVICES" ]; then
        STATUS="yes"
        while IFS='|' read -r SERVICE_NAME SERVICE_STATE SERVICE_HEALTH EXTRA_FIELD; do
            if [ -z "$SERVICE_NAME" ] \
                || [ "$SERVICE_STATE" != "running" ] \
                || [ "$SERVICE_HEALTH" != "healthy" ] \
                || [ -n "$EXTRA_FIELD" ]; then
                STATUS="no"
                break
            fi
        done <<< "$PS_ROWS"
    fi
    if [ "$STATUS" = "yes" ]; then
        ALL_HEALTHY=true
        break
    fi
    sleep "$HEALTH_POLL_INTERVAL"
    WAITED=$((WAITED + HEALTH_POLL_INTERVAL))
done

echo
if [ "$ALL_HEALTHY" = "true" ]; then
    echo -e "${GREEN}[完成] 所有服务健康运行！${NC}"
    echo "  域名: https://cvd.rustypiano.com"
    echo "  后端健康: $COMPOSE exec backend curl -s http://127.0.0.1:8000/health"
else
    echo -e "${RED}[警告] 健康检查超时（${MAX_WAIT}秒），请检查：${NC}" >&2
    echo "  $COMPOSE ps"
    echo "  $COMPOSE logs --tail=50"
    exit 1
fi
