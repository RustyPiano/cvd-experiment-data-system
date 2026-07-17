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

echo "[1/4] 部署前备份数据库与文件..."
if [ -x "./backup.sh" ]; then
    ./backup.sh || { echo -e "${RED}[错误] 备份失败，已中止部署${NC}" >&2; exit 1; }
else
    echo "  (未找到可执行的 backup.sh，跳过备份)"
fi
echo

echo "[2/4] 拉取最新代码..."
git pull --ff-only
echo

# Schema 哨兵：v2 单轨重基线后，旧库上的 alembic_version 在新迁移链中不存在，
# 直接部署会让后端启动迁移崩溃循环。库版本必须存在于当前代码迁移链，否则按批8 整库重建。
if [ "${SKIP_SCHEMA_GUARD:-0}" != "1" ]; then
    PG_CONTAINER="${PG_CONTAINER:-1Panel-postgresql-4ljp}"
    POSTGRES_USER="${POSTGRES_USER:-user_GztwJM}"
    POSTGRES_DB="${POSTGRES_DB:-cvd}"
    DB_REV=$( (docker exec "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -tAc "SELECT version_num FROM alembic_version" 2>/dev/null || true) | tr -d '[:space:]')
    if [ -z "$DB_REV" ]; then
        echo -e "${RED}[中止] 无法读取数据库 alembic 版本（容器名/凭据可能不对），拒绝继续。${NC}" >&2
        echo "  确认自担风险可用 SKIP_SCHEMA_GUARD=1 ./deploy.sh 跳过本检查。" >&2
        exit 1
    fi
    if ! grep -rq "$DB_REV" backend/alembic/versions/; then
        echo -e "${RED}[中止] 数据库迁移版本 ${DB_REV} 不在当前代码迁移链中（schema 已重基线）。${NC}" >&2
        echo "  直接部署会崩溃循环。请按 docs/engineering/v2-single-track-plan.md 批8 执行整库重建切换。" >&2
        echo "  确认自担风险可用 SKIP_SCHEMA_GUARD=1 ./deploy.sh 跳过本检查。" >&2
        exit 1
    fi
fi

echo "[3/4] 构建并启动容器（后端启动时自动执行 alembic 迁移）..."
$COMPOSE up -d --build
echo

echo "[4/4] 等待服务健康检查..."
MAX_WAIT=180
WAITED=0
ALL_HEALTHY=false
while [ $WAITED -lt $MAX_WAIT ]; do
    STATUS=$($COMPOSE ps --format json 2>/dev/null | python3 -c "
import sys, json
lines = [json.loads(l) for l in sys.stdin if l.strip()]
all_healthy = bool(lines) and all(
    h.get('State') == 'running' and ('healthy' in (h.get('Health') or ''))
    for h in lines if 'exited' not in (h.get('State') or '')
)
print('yes' if all_healthy else 'no')
" 2>/dev/null || echo "no")
    if [ "$STATUS" = "yes" ]; then
        ALL_HEALTHY=true
        break
    fi
    sleep 5
    WAITED=$((WAITED + 5))
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
