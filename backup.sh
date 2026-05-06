#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

BACKUP_BASE="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_BASE/$TIMESTAMP"

mkdir -p "$BACKUP_DIR"

echo -e "${GREEN}[1/2] 备份 PostgreSQL 数据库...${NC}"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-cvd}" \
    > "$BACKUP_DIR/database.sql"
echo "  -> $BACKUP_DIR/database.sql"

echo -e "${GREEN}[2/2] 备份文件存储...${NC}"
if docker compose exec -T backend test -d /data/storage; then
    docker compose exec -T backend tar czf - /data/storage \
        > "$BACKUP_DIR/storage.tar.gz"
    echo "  -> $BACKUP_DIR/storage.tar.gz"
else
    echo "  (文件存储目录不存在，跳过)"
fi

echo
echo -e "${GREEN}备份完成: $BACKUP_DIR${NC}"

# 清理旧备份
if [ -d "$BACKUP_BASE" ]; then
    DELETED=$(find "$BACKUP_BASE" -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} \; -print 2>/dev/null | wc -l | tr -d ' ')
    if [ "${DELETED:-0}" -gt 0 ]; then
        echo "已清理 ${DELETED} 个超过 ${RETENTION_DAYS} 天的旧备份"
    fi
fi

echo
echo "设置定时备份："
echo "  crontab -e"
echo "  添加: 0 2 * * * $(realpath "$0") >> /var/log/cvd-backup.log 2>&1"
