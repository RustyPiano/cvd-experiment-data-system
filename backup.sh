#!/usr/bin/env bash
# 备份生产数据库与文件存储（hongkong 服务器）
# 数据库是共享的 1Panel PostgreSQL 容器；目标必须由 .env 或环境变量显式配置。
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

load_database_target_from_env() {
    local key value
    [ -f "$SCRIPT_DIR/.env" ] || return 0
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

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE="docker compose -f $COMPOSE_FILE"

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

sha256_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | awk '{print $1}'
    else
        echo -e "${RED}[错误] 缺少 SHA-256 工具（sha256sum 或 shasum）。${NC}" >&2
        return 1
    fi
}

BACKUP_ROOT_INPUT="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
case "$BACKUP_ROOT_INPUT" in
    /*) BACKUP_ROOT_CANDIDATE="$BACKUP_ROOT_INPUT" ;;
    *) BACKUP_ROOT_CANDIDATE="$SCRIPT_DIR/$BACKUP_ROOT_INPUT" ;;
esac
if [ -L "$BACKUP_ROOT_CANDIDATE" ]; then
    echo -e "${RED}[错误] BACKUP_DIR 不能是符号链接。${NC}" >&2
    exit 1
fi
if ! mkdir -p -- "$BACKUP_ROOT_CANDIDATE"; then
    echo -e "${RED}[错误] 无法创建 BACKUP_DIR。${NC}" >&2
    exit 1
fi
if ! BACKUP_ROOT=$(cd -- "$BACKUP_ROOT_CANDIDATE" && pwd -P); then
    echo -e "${RED}[错误] 无法解析 BACKUP_DIR。${NC}" >&2
    exit 1
fi
case "$BACKUP_ROOT" in
    "/"|"$SCRIPT_DIR"|"$SCRIPT_DIR/.git"|"$SCRIPT_DIR/.git/"*)
        echo -e "${RED}[错误] BACKUP_DIR 必须是专用备份目录，不能是根目录、仓库根目录或 .git。${NC}" >&2
        exit 1
        ;;
esac
if [ -d "$BACKUP_ROOT/.git" ]; then
    echo -e "${RED}[错误] BACKUP_DIR 不能指向其他 Git 仓库根目录。${NC}" >&2
    exit 1
fi
if [[ "$(basename "$BACKUP_ROOT")" != *backup* ]] \
    && [ ! -f "$BACKUP_ROOT/.cvd-backup-root" ]; then
    echo -e "${RED}[错误] 自定义 BACKUP_DIR 必须解析到名称含 backup 的专用备份目录，或已有 .cvd-backup-root 标记。${NC}" >&2
    exit 1
fi
touch "$BACKUP_ROOT/.cvd-backup-root"
chmod 700 "$BACKUP_ROOT"
CURRENT_BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
PARTIAL_BACKUP_CREATED=0
BACKUP_COMPLETE=0
cleanup_partial_backup() {
    local exit_status=$?
    trap - EXIT
    if [ "$exit_status" -ne 0 ] \
        && [ "$PARTIAL_BACKUP_CREATED" = "1" ] \
        && [ "$BACKUP_COMPLETE" != "1" ]; then
        rm -rf -- "$CURRENT_BACKUP_DIR" || true
    fi
    exit "$exit_status"
}
trap cleanup_partial_backup EXIT
if ! mkdir -- "$CURRENT_BACKUP_DIR"; then
    echo -e "${RED}[错误] 无法创建本次备份目录；可能已有同秒备份。${NC}" >&2
    exit 1
fi
chmod 700 "$CURRENT_BACKUP_DIR"
PARTIAL_BACKUP_CREATED=1

echo -e "${GREEN}[1/2] 备份 PostgreSQL（容器 ${PG_CONTAINER} / 库 ${POSTGRES_DB}）...${NC}"
if ! docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$CURRENT_BACKUP_DIR/database.sql"; then
    echo -e "${RED}[错误] 数据库备份失败（检查 PG_CONTAINER / POSTGRES_USER / POSTGRES_DB）${NC}" >&2
    exit 1
fi
if [ ! -s "$CURRENT_BACKUP_DIR/database.sql" ]; then
    echo -e "${RED}[错误] 数据库备份为空，拒绝继续。${NC}" >&2
    exit 1
fi
echo "  -> $CURRENT_BACKUP_DIR/database.sql ($(du -h "$CURRENT_BACKUP_DIR/database.sql" | cut -f1))"

echo -e "${GREEN}[2/2] 备份文件存储...${NC}"
if ! BACKEND_CONTAINER_IDS=$($COMPOSE ps -q --all backend 2>/dev/null); then
    echo -e "${RED}[错误] 无法解析后端容器，拒绝继续。${NC}" >&2
    exit 1
fi
BACKEND_CONTAINER_IDS=$(printf '%s\n' "$BACKEND_CONTAINER_IDS" | sed '/^[[:space:]]*$/d')
BACKEND_CONTAINER_COUNT=$(printf '%s\n' "$BACKEND_CONTAINER_IDS" | awk 'NF {count++} END {print count+0}')
if [ "$BACKEND_CONTAINER_COUNT" -ne 1 ]; then
    echo -e "${RED}[错误] 必须精确找到一个后端容器（运行或已停止），当前为 ${BACKEND_CONTAINER_COUNT} 个。${NC}" >&2
    exit 1
fi
BACKEND_CONTAINER_ID=$(printf '%s\n' "$BACKEND_CONTAINER_IDS" | head -n 1)
if ! docker cp "${BACKEND_CONTAINER_ID}:/data/storage/." - 2>/dev/null \
    | gzip -c > "$CURRENT_BACKUP_DIR/storage.tar.gz"; then
    rm -f -- "$CURRENT_BACKUP_DIR/storage.tar.gz"
    echo -e "${RED}[错误] 文件存储备份失败。${NC}" >&2
    exit 1
fi
if [ ! -s "$CURRENT_BACKUP_DIR/storage.tar.gz" ] \
    || ! tar -tzf "$CURRENT_BACKUP_DIR/storage.tar.gz" >/dev/null 2>&1; then
    echo -e "${RED}[错误] 文件存储归档为空或不可读。${NC}" >&2
    exit 1
fi
echo "  -> $CURRENT_BACKUP_DIR/storage.tar.gz ($(du -h "$CURRENT_BACKUP_DIR/storage.tar.gz" | cut -f1))"

DATABASE_SHA256=$(sha256_file "$CURRENT_BACKUP_DIR/database.sql")
STORAGE_SHA256=$(sha256_file "$CURRENT_BACKUP_DIR/storage.tar.gz")
printf '%s  database.sql\n%s  storage.tar.gz\n' \
    "$DATABASE_SHA256" "$STORAGE_SHA256" > "$CURRENT_BACKUP_DIR/SHA256SUMS"
chmod 600 \
    "$CURRENT_BACKUP_DIR/database.sql" \
    "$CURRENT_BACKUP_DIR/storage.tar.gz" \
    "$CURRENT_BACKUP_DIR/SHA256SUMS"

echo
echo -e "${GREEN}备份完成: $CURRENT_BACKUP_DIR${NC}"

# 清理超期备份
if [ -f "$BACKUP_ROOT/.cvd-backup-root" ]; then
    find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d \
        -name '20[0-9][0-9][01][0-9][0-3][0-9]_[0-2][0-9][0-5][0-9][0-5][0-9]' \
        -mtime "+${RETENTION_DAYS}" -exec rm -rf -- {} + 2>/dev/null || true
fi
BACKUP_COMPLETE=1
