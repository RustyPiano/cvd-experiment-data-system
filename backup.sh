#!/usr/bin/env bash
# 备份生产数据库与文件存储（hongkong 服务器）
# 数据库是共享的 1Panel PostgreSQL 容器；可用环境变量覆盖默认值。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE="docker compose -f $COMPOSE_FILE"

# 共享 1Panel PostgreSQL 容器名 / 账号 / 库名（可用 env 覆盖）
PG_CONTAINER="${PG_CONTAINER:-1Panel-postgresql-4ljp}"
POSTGRES_USER="${POSTGRES_USER:-user_GztwJM}"
POSTGRES_DB="${POSTGRES_DB:-cvd}"

BACKUP_BASE="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_BASE/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

echo -e "${GREEN}[1/2] 备份 PostgreSQL（容器 $PG_CONTAINER / 库 $POSTGRES_DB）...${NC}"
if ! docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_DIR/database.sql"; then
    echo -e "${RED}[错误] 数据库备份失败（检查 PG_CONTAINER / POSTGRES_USER / POSTGRES_DB）${NC}" >&2
    exit 1
fi
echo "  -> $BACKUP_DIR/database.sql ($(du -h "$BACKUP_DIR/database.sql" | cut -f1))"

echo -e "${GREEN}[2/2] 备份文件存储...${NC}"
if $COMPOSE exec -T backend test -d /data/storage 2>/dev/null; then
    $COMPOSE exec -T backend tar czf - /data/storage > "$BACKUP_DIR/storage.tar.gz" 2>/dev/null \
        && echo "  -> $BACKUP_DIR/storage.tar.gz ($(du -h "$BACKUP_DIR/storage.tar.gz" | cut -f1))"
else
    echo "  (后端容器未运行或无存储目录，跳过)"
fi

echo
echo -e "${GREEN}备份完成: $BACKUP_DIR${NC}"

# 清理超期备份
if [ -d "$BACKUP_BASE" ]; then
    find "$BACKUP_BASE" -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} \; 2>/dev/null || true
fi
