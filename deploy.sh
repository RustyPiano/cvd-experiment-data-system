#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

HEADER="============================================================"
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}${HEADER}${NC}"
echo -e "${GREEN}  CVD 实验数据采集系统 — 部署脚本${NC}"
echo -e "${GREEN}${HEADER}${NC}"
echo

# 检查 .env 是否存在
if [ ! -f ".env" ]; then
    echo -e "${RED}[错误] 缺少 .env 文件${NC}" >&2
    echo "请先基于 .env.production.example 创建并填写配置："
    echo
    echo "  cp .env.production.example .env"
    echo "  编辑 .env 文件，修改所有 YOUR_* 和 change-me-* 占位符"
    echo "  提示：用 openssl rand -hex 32 生成 JWT_SECRET_KEY"
    echo "  提示：用 openssl rand -base64 24 生成 POSTGRES_PASSWORD"
    echo
    exit 1
fi

echo "[1/3] 拉取最新代码..."
git pull --ff-only
echo

echo "[2/3] 构建并启动容器..."
docker compose up -d --build
echo

echo "[3/3] 等待服务健康检查..."
MAX_WAIT=120
WAITED=0
ALL_HEALTHY=false

while [ $WAITED -lt $MAX_WAIT ]; do
    STATUS=$(docker compose ps --format json 2>/dev/null | python3 -c "
import sys, json
lines = [json.loads(l) for l in sys.stdin if l.strip()]
all_healthy = all(
    h.get('Status') == 'running' and ('healthy' in (h.get('Health') or ''))
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
    echo
    echo "  前端: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'your-server'):${FRONTEND_PORT:-80}"
    echo "  后端: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'your-server'):${BACKEND_PORT:-8000}/health"
    echo
    echo "  首次部署还需手动创建管理员账号："
    echo "    docker compose exec backend uv run python -m app.commands.create_admin --email your@email.com --name \"Your Name\""
    echo
else
    echo -e "${RED}[警告] 健康检查超时（${MAX_WAIT}秒）${NC}" >&2
    echo "检查服务状态："
    echo "  docker compose ps"
    echo "  docker compose logs --tail=50"
    exit 1
fi
