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
