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

file_mode() {
    stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

proof_value() {
    local key="$1"
    awk -v key="$key" '
        index($0, key "=") == 1 {
            count += 1
            value = substr($0, length(key) + 2)
        }
        END {
            if (count != 1) exit 1
            print value
        }
    ' "$BATCH8_PROOF_FILE"
}

validate_batch8_capability() {
    local backup_root backup_real backup_parent
    local artifact database_sha storage_sha expected_sums actual_sums
    local proof_format proof_pg_container proof_postgres_user proof_postgres_db
    local proof_storage_volume proof_target_sha proof_database_sha proof_storage_sha
    local proof_verified_epoch proof_restore_verified current_sha dirty_state now age
    local container_ids container_count container_id container_inspect container_running
    local actual_storage_volume storage_entries key

    if [ "${SKIP_SCHEMA_GUARD:-0}" = "1" ]; then
        echo -e "${RED}[错误] 批8模式禁止 SKIP_SCHEMA_GUARD。${NC}" >&2
        return 1
    fi
    case "$BATCH8_VERIFIED_BACKUP_DIR" in
        /*) ;;
        *)
            echo -e "${RED}[错误] BATCH8_VERIFIED_BACKUP_DIR 必须是绝对路径。${NC}" >&2
            return 1
            ;;
    esac
    if [ ! -d "$BATCH8_VERIFIED_BACKUP_DIR" ] \
        || [ -L "$BATCH8_VERIFIED_BACKUP_DIR" ]; then
        echo -e "${RED}[错误] 批8备份目录不存在或是符号链接。${NC}" >&2
        return 1
    fi
    backup_real=$(cd -- "$BATCH8_VERIFIED_BACKUP_DIR" && pwd -P)
    backup_parent=$(cd -- "$BATCH8_VERIFIED_BACKUP_DIR/.." && pwd -P)
    if [ "$backup_real" != "$BATCH8_VERIFIED_BACKUP_DIR" ]; then
        echo -e "${RED}[错误] 批8备份目录必须是真实绝对路径，不能经过符号链接。${NC}" >&2
        return 1
    fi
    backup_root="$backup_parent"
    if [ ! -f "$backup_root/.cvd-backup-root" ] \
        || [ -L "$backup_root/.cvd-backup-root" ]; then
        echo -e "${RED}[错误] 批8 BACKUP_ROOT 未通过专用目录标记验证。${NC}" >&2
        return 1
    fi
    if [ "$(file_mode "$backup_root")" != "700" ] \
        || [ "$(file_mode "$backup_real")" != "700" ]; then
        echo -e "${RED}[错误] 批8 BACKUP_ROOT 与备份目录权限必须为 0700。${NC}" >&2
        return 1
    fi

    for artifact in database.sql storage.tar.gz SHA256SUMS batch8-proof.env; do
        if [ ! -f "$backup_real/$artifact" ] \
            || [ -L "$backup_real/$artifact" ] \
            || [ ! -s "$backup_real/$artifact" ]; then
            echo -e "${RED}[错误] 批8备份缺少非空普通文件：${artifact}。${NC}" >&2
            return 1
        fi
        if [ "$(file_mode "$backup_real/$artifact")" != "600" ]; then
            echo -e "${RED}[错误] 批8备份文件权限必须为 0600：${artifact}。${NC}" >&2
            return 1
        fi
    done
    if ! tar -tzf "$backup_real/storage.tar.gz" >/dev/null 2>&1; then
        echo -e "${RED}[错误] 批8 storage.tar.gz 不可读。${NC}" >&2
        return 1
    fi
    database_sha=$(sha256_file "$backup_real/database.sql")
    storage_sha=$(sha256_file "$backup_real/storage.tar.gz")
    expected_sums=$(printf '%s  database.sql\n%s  storage.tar.gz' \
        "$database_sha" "$storage_sha")
    actual_sums=$(cat -- "$backup_real/SHA256SUMS")
    if [ "$actual_sums" != "$expected_sums" ]; then
        echo -e "${RED}[错误] 批8 SHA256SUMS 与备份文件不一致。${NC}" >&2
        return 1
    fi

    BATCH8_PROOF_FILE="$backup_real/batch8-proof.env"
    for key in FORMAT PG_CONTAINER POSTGRES_USER POSTGRES_DB STORAGE_VOLUME \
        TARGET_GIT_SHA DATABASE_SHA256 STORAGE_SHA256 VERIFIED_AT_EPOCH \
        RESTORE_VERIFIED; do
        if ! proof_value "$key" >/dev/null; then
            echo -e "${RED}[错误] 批8 proof 缺少或重复字段 ${key}。${NC}" >&2
            return 1
        fi
    done
    proof_format=$(proof_value FORMAT)
    proof_pg_container=$(proof_value PG_CONTAINER)
    proof_postgres_user=$(proof_value POSTGRES_USER)
    proof_postgres_db=$(proof_value POSTGRES_DB)
    proof_storage_volume=$(proof_value STORAGE_VOLUME)
    proof_target_sha=$(proof_value TARGET_GIT_SHA)
    proof_database_sha=$(proof_value DATABASE_SHA256)
    proof_storage_sha=$(proof_value STORAGE_SHA256)
    proof_verified_epoch=$(proof_value VERIFIED_AT_EPOCH)
    proof_restore_verified=$(proof_value RESTORE_VERIFIED)
    if [ "$proof_format" != "cvd-batch8-v1" ]; then
        echo -e "${RED}[错误] 批8 proof 的 FORMAT 无效。${NC}" >&2
        return 1
    fi
    if [ "$proof_pg_container" != "$PG_CONTAINER" ]; then
        echo -e "${RED}[错误] 批8 proof 的 PG_CONTAINER 与当前目标不一致。${NC}" >&2
        return 1
    fi
    if [ "$proof_postgres_user" != "$POSTGRES_USER" ]; then
        echo -e "${RED}[错误] 批8 proof 的 POSTGRES_USER 与当前目标不一致。${NC}" >&2
        return 1
    fi
    if [ "$proof_postgres_db" != "$POSTGRES_DB" ]; then
        echo -e "${RED}[错误] 批8 proof 的 POSTGRES_DB 与当前目标不一致。${NC}" >&2
        return 1
    fi
    if [ "$proof_database_sha" != "$database_sha" ]; then
        echo -e "${RED}[错误] 批8 proof 的 DATABASE_SHA256 与当前备份不一致。${NC}" >&2
        return 1
    fi
    if [ "$proof_storage_sha" != "$storage_sha" ]; then
        echo -e "${RED}[错误] 批8 proof 的 STORAGE_SHA256 与当前备份不一致。${NC}" >&2
        return 1
    fi
    if [ "$proof_restore_verified" != "true" ]; then
        echo -e "${RED}[错误] 批8 proof 的 RESTORE_VERIFIED 必须为 true。${NC}" >&2
        return 1
    fi

    case "$proof_target_sha" in
        ""|*[!0-9a-f]*)
            echo -e "${RED}[错误] 批8 proof 的 TARGET_GIT_SHA 无效。${NC}" >&2
            return 1
            ;;
    esac
    if [ "${#proof_target_sha}" -ne 40 ]; then
        echo -e "${RED}[错误] 批8 proof 的 TARGET_GIT_SHA 无效。${NC}" >&2
        return 1
    fi
    current_sha=$(git rev-parse HEAD)
    if [ "$current_sha" != "$proof_target_sha" ]; then
        echo -e "${RED}[错误] 当前 HEAD 与批8 TARGET_GIT_SHA 不一致。${NC}" >&2
        return 1
    fi
    dirty_state=$(git status --porcelain --untracked-files=all)
    if [ -n "$dirty_state" ]; then
        echo -e "${RED}[错误] 批8要求目标 commit 的干净工作树。${NC}" >&2
        return 1
    fi

    case "$proof_verified_epoch" in
        ""|*[!0-9]*)
            echo -e "${RED}[错误] 批8 proof 的 VERIFIED_AT_EPOCH 无效。${NC}" >&2
            return 1
            ;;
    esac
    now=$(date +%s)
    age=$((now - proof_verified_epoch))
    if [ "$age" -lt 0 ] || [ "$age" -gt 21600 ]; then
        echo -e "${RED}[错误] 批8 proof 尚未生效或已过期。${NC}" >&2
        return 1
    fi

    if ! container_ids=$($COMPOSE ps -q --all backend 2>/dev/null); then
        echo -e "${RED}[错误] 无法解析批8后端容器。${NC}" >&2
        return 1
    fi
    container_ids=$(printf '%s\n' "$container_ids" | sed '/^[[:space:]]*$/d')
    container_count=$(printf '%s\n' "$container_ids" | awk 'NF {count++} END {print count+0}')
    if [ "$container_count" -ne 1 ]; then
        echo -e "${RED}[错误] 批8要求精确找到一个已停止的后端容器。${NC}" >&2
        return 1
    fi
    container_id=$(printf '%s\n' "$container_ids" | head -n 1)
    if ! container_inspect=$(docker inspect --format \
        '{{.State.Running}}|{{range .Mounts}}{{if eq .Destination "/data/storage"}}{{.Name}}{{end}}{{end}}' \
        "$container_id" 2>/dev/null); then
        echo -e "${RED}[错误] 无法读取批8后端状态与文件存储卷。${NC}" >&2
        return 1
    fi
    container_inspect=$(printf '%s' "$container_inspect" | tr -d '[:space:]')
    container_running="${container_inspect%%|*}"
    actual_storage_volume="${container_inspect#*|}"
    if [ "$container_running" != "false" ]; then
        echo -e "${RED}[错误] 批8要求后端容器已停止后再使用一致恢复点。${NC}" >&2
        return 1
    fi
    if [ -z "$actual_storage_volume" ] \
        || [ "$proof_storage_volume" != "$actual_storage_volume" ]; then
        echo -e "${RED}[错误] 批8 proof 的 STORAGE_VOLUME 与实际挂载卷不一致。${NC}" >&2
        return 1
    fi
    if ! storage_entries=$(docker cp "${container_id}:/data/storage/." - 2>/dev/null \
        | tar -tf - 2>/dev/null); then
        echo -e "${RED}[错误] 无法从已停止的后端容器读取批8文件存储卷。${NC}" >&2
        return 1
    fi
    storage_entries=$(printf '%s\n' "$storage_entries" | sed '/^[[:space:]]*$/d')
    if [ "$storage_entries" != "./" ]; then
        echo -e "${RED}[错误] 批8文件存储必须是空卷，当前仍含旧文件。${NC}" >&2
        return 1
    fi
}

BATCH8_MODE=0
if [ -n "${BATCH8_VERIFIED_BACKUP_DIR:-}" ]; then
    validate_batch8_capability
    BATCH8_MODE=1
    echo "[1/4] 批8备份、恢复演练、目标 commit 与存储卷证明已验证。"
else
    echo "[1/4] 部署前备份数据库与文件..."
    if [ ! -x "./backup.sh" ]; then
        echo -e "${RED}[错误] 缺少可执行的 backup.sh，拒绝无备份部署。${NC}" >&2
        exit 1
    fi
    ./backup.sh || { echo -e "${RED}[错误] 备份失败，已中止部署${NC}" >&2; exit 1; }
fi
echo

if [ "$BATCH8_MODE" = "1" ]; then
    echo "[2/4] 批8目标 commit 已固定，跳过 git pull。"
else
    echo "[2/4] 拉取最新代码..."
    git pull --ff-only
fi
echo

# Schema 哨兵：v2 单轨重基线后，旧库上的 alembic_version 在新迁移链中不存在，
# 直接部署会让后端启动迁移崩溃循环。库版本必须存在于当前代码迁移链，否则按批8 整库重建。
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
    if [ "$BATCH8_MODE" = "1" ] && [ "$SCHEMA_STATE" != "empty" ]; then
        echo -e "${RED}[中止] 批8只能部署到 fresh-empty schema。${NC}" >&2
        exit 1
    fi
    case "$SCHEMA_STATE" in
        empty)
            echo "  已确认 public schema 为空，将由后端执行 initial migration。"
            ;;
        nonempty-no-alembic)
            echo -e "${RED}[中止] 数据库非空但缺少 alembic_version，无法证明 schema 来源。${NC}" >&2
            echo "  请按批8流程重建空库后再部署；禁止把现有对象误判为空库。" >&2
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
                echo -e "${RED}[中止] 数据库迁移版本 ${DB_REV:-<空>} 不在当前代码迁移链中（schema 已重基线）。${NC}" >&2
                echo "  直接部署会崩溃循环。请按 docs/engineering/v2-single-track-plan.md 批8 执行整库重建切换。" >&2
                echo "  确认自担风险可用 SKIP_SCHEMA_GUARD=1 ./deploy.sh 跳过本检查。" >&2
                exit 1
            fi
            if ! SCHEMA_FINGERPRINT=$(docker exec "$PG_CONTAINER" psql \
                -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "
                    SELECT CASE
                        WHEN EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'measured_products'
                              AND column_name = 'layer_count'
                        )
                        AND (
                            SELECT count(DISTINCT relation.relname)
                            FROM pg_trigger AS trigger
                            JOIN pg_class AS relation
                              ON relation.oid = trigger.tgrelid
                            JOIN pg_namespace AS namespace
                              ON namespace.oid = relation.relnamespace
                            WHERE namespace.nspname = 'public'
                              AND relation.relname IN (
                                  'material_lot_versions',
                                  'setup_versions',
                                  'instrument_versions'
                              )
                              AND trigger.tgname IN (
                                  'trg_material_lot_versions_immutable',
                                  'trg_setup_versions_immutable',
                                  'trg_instrument_versions_immutable'
                              )
                              AND trigger.tgenabled <> 'D'
                              AND position(
                                  'DELETE' IN upper(pg_get_triggerdef(trigger.oid))
                              ) > 0
                        ) = 3
                        AND (
                            SELECT count(*)
                            FROM pg_attribute AS attribute
                            JOIN pg_class AS relation
                              ON relation.oid = attribute.attrelid
                            JOIN pg_namespace AS namespace
                              ON namespace.oid = relation.relnamespace
                            WHERE namespace.nspname = 'public'
                              AND relation.relname = 'file_assets'
                              AND attribute.attnum > 0
                              AND NOT attribute.attisdropped
                              AND NOT attribute.attnotnull
                              AND (
                                  (
                                      attribute.attname = 'experiment_run_id'
                                      AND format_type(
                                          attribute.atttypid,
                                          attribute.atttypmod
                                      ) = 'uuid'
                                  )
                                  OR
                                  (
                                      attribute.attname = 'entity_type'
                                      AND format_type(
                                          attribute.atttypid,
                                          attribute.atttypmod
                                      ) = 'character varying(32)'
                                  )
                                  OR
                                  (
                                      attribute.attname = 'entity_id'
                                      AND format_type(
                                          attribute.atttypid,
                                          attribute.atttypmod
                                      ) = 'uuid'
                                  )
                                  OR
                                  (
                                      attribute.attname = 'entity_version'
                                      AND format_type(
                                          attribute.atttypid,
                                          attribute.atttypmod
                                      ) = 'integer'
                                  )
                              )
                        ) = 4
                        AND EXISTS (
                            SELECT 1
                            FROM pg_constraint AS constraint_row
                            JOIN pg_class AS relation
                              ON relation.oid = constraint_row.conrelid
                            JOIN pg_namespace AS namespace
                              ON namespace.oid = relation.relnamespace
                            WHERE namespace.nspname = 'public'
                              AND relation.relname = 'file_assets'
                              AND constraint_row.contype = 'c'
                              AND constraint_row.convalidated
                              AND constraint_row.conname =
                                  'ck_file_assets_single_scope'
                              AND position(
                                  'EXPERIMENT_RUN_ID IS NOT NULL'
                                  IN upper(pg_get_constraintdef(constraint_row.oid))
                              ) > 0
                              AND position(
                                  'EXPERIMENT_RUN_ID IS NULL'
                                  IN upper(pg_get_constraintdef(constraint_row.oid))
                              ) > 0
                              AND position(
                                  'ENTITY_TYPE IS NULL'
                                  IN upper(pg_get_constraintdef(constraint_row.oid))
                              ) > 0
                              AND position(
                                  'ENTITY_ID IS NULL'
                                  IN upper(pg_get_constraintdef(constraint_row.oid))
                              ) > 0
                              AND position(
                                  'ENTITY_VERSION IS NULL'
                                  IN upper(pg_get_constraintdef(constraint_row.oid))
                              ) > 0
                              AND position(
                                  'ENTITY_TYPE IS NOT NULL'
                                  IN upper(pg_get_constraintdef(constraint_row.oid))
                              ) > 0
                              AND position(
                                  'ENTITY_ID IS NOT NULL'
                                  IN upper(pg_get_constraintdef(constraint_row.oid))
                              ) > 0
                              AND position(
                                  'ENTITY_VERSION >= 1'
                                  IN upper(pg_get_constraintdef(constraint_row.oid))
                              ) > 0
                        )
                        AND EXISTS (
                            SELECT 1
                            FROM pg_constraint AS constraint_row
                            JOIN pg_class AS relation
                              ON relation.oid = constraint_row.conrelid
                            JOIN pg_namespace AS namespace
                              ON namespace.oid = relation.relnamespace
                            WHERE namespace.nspname = 'public'
                              AND relation.relname = 'file_assets'
                              AND constraint_row.contype = 'c'
                              AND constraint_row.convalidated
                              AND constraint_row.conname =
                                  'ck_file_assets_entity_type'
                              AND position(
                                  'ENTITY_TYPE IS NULL'
                                  IN upper(pg_get_constraintdef(constraint_row.oid))
                              ) > 0
                              AND position(
                                  'MATERIAL_LOT'
                                  IN upper(pg_get_constraintdef(constraint_row.oid))
                              ) > 0
                              AND position(
                                  'SETUP'
                                  IN upper(pg_get_constraintdef(constraint_row.oid))
                              ) > 0
                              AND position(
                                  'INSTRUMENT'
                                  IN upper(pg_get_constraintdef(constraint_row.oid))
                              ) > 0
                        )
                            THEN 'ok'
                        ELSE 'mismatch'
                    END AS schema_fingerprint
                " 2>/dev/null); then
                echo -e "${RED}[中止] 无法读取数据库 schema 指纹，拒绝继续。${NC}" >&2
                exit 1
            fi
            SCHEMA_FINGERPRINT=$(printf '%s' "$SCHEMA_FINGERPRINT" | tr -d '[:space:]')
            if [ "$SCHEMA_FINGERPRINT" != "ok" ]; then
                echo -e "${RED}[中止] 当前 revision 对应的 schema 指纹不完整或已过期。${NC}" >&2
                echo "  同 revision 的旧形状不可原地迁移；请按批8流程重建空库。" >&2
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
