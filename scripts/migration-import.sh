#!/usr/bin/env zsh
set -euo pipefail

# 文件作用：在新电脑上恢复 Career Agent 的核心运行资产。
# 职责边界：
# 1. 恢复前后端环境文件。
# 2. 拉起 PostgreSQL / Neo4j 容器并恢复 PostgreSQL 备份。
# 3. 恢复 Pi Agent 目录与报告导出文件。
# 4. 安装 Node 依赖与 Playwright Chromium，减少报告导出首次运行失败。

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION_DIR="${1:-}"
BACKEND_ENV_FILE="$ROOT_DIR/apps/backend/.env"
FRONTEND_ENV_FILE="$ROOT_DIR/apps/frontend/.env"

log() {
  echo "[migration-import] $*"
}

fail() {
  echo "[migration-import] ERROR: $*" >&2
  exit 1
}

# 作用：把相对路径统一解析为基于仓库根目录的绝对路径，确保恢复目录与运行时读取口径一致。
resolve_path() {
  local raw_path="$1"
  if [[ "$raw_path" = /* ]]; then
    echo "$raw_path"
  else
    echo "$ROOT_DIR/$raw_path"
  fi
}

load_backend_env() {
  if [[ ! -f "$BACKEND_ENV_FILE" ]]; then
    fail "未找到 $BACKEND_ENV_FILE，请先确认迁移包中的 backend.env 已复制成功。"
  fi

  set -a
  # shellcheck source=/dev/null
  source "$BACKEND_ENV_FILE"
  set +a
}

# 作用：等待 PostgreSQL 容器真正可连接，避免 pg_restore 抢跑导致“数据库未就绪”。
wait_for_postgres() {
  command -v pg_isready >/dev/null 2>&1 || fail "未找到 pg_isready，请先安装 PostgreSQL 客户端工具。"

  local retries=30
  local index=1
  while (( index <= retries )); do
    if PGPASSWORD="$PGPASSWORD" pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    (( index += 1 ))
  done

  fail "PostgreSQL 在预期时间内未就绪，请检查 docker compose 状态。"
}

if [[ -z "$MIGRATION_DIR" ]]; then
  fail "用法：scripts/migration-import.sh <迁移包目录>"
fi

if [[ ! -d "$MIGRATION_DIR" ]]; then
  fail "迁移包目录不存在：$MIGRATION_DIR"
fi

command -v docker >/dev/null 2>&1 || fail "未找到 docker，请先安装 Docker Desktop。"
command -v npm >/dev/null 2>&1 || fail "未找到 npm，请先安装 Node.js 22.20.x。"
command -v pg_restore >/dev/null 2>&1 || fail "未找到 pg_restore，请先安装 PostgreSQL 客户端工具。"
command -v psql >/dev/null 2>&1 || fail "未找到 psql，请先安装 PostgreSQL 客户端工具。"
command -v createdb >/dev/null 2>&1 || fail "未找到 createdb，请先安装 PostgreSQL 客户端工具。"

mkdir -p "$(dirname "$BACKEND_ENV_FILE")" "$(dirname "$FRONTEND_ENV_FILE")"

if [[ -f "$MIGRATION_DIR/backend.env" ]]; then
  cp "$MIGRATION_DIR/backend.env" "$BACKEND_ENV_FILE"
else
  fail "迁移包中缺少 backend.env"
fi

if [[ -f "$MIGRATION_DIR/frontend.env" ]]; then
  cp "$MIGRATION_DIR/frontend.env" "$FRONTEND_ENV_FILE"
fi

load_backend_env

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGDATABASE:=career_agent}"
: "${PGUSER:=career}"
: "${PGPASSWORD:=career_dev_password}"
: "${REPORT_EXPORT_DIR:=storage/exports/reports}"
: "${AGENT_PI_DIR:=$HOME/.career-agent/pi-agent}"

ABS_REPORT_EXPORT_DIR="$(resolve_path "$REPORT_EXPORT_DIR")"

log "启动基础设施容器。"
docker compose -f "$ROOT_DIR/infra/docker-compose.yml" up -d postgres neo4j
wait_for_postgres

log "确保目标数据库存在。"
if ! PGPASSWORD="$PGPASSWORD" psql \
  -h "$PGHOST" \
  -p "$PGPORT" \
  -U "$PGUSER" \
  -d postgres \
  -tAc "SELECT 1 FROM pg_database WHERE datname = '$PGDATABASE'" | grep -q 1; then
  PGPASSWORD="$PGPASSWORD" createdb \
    -h "$PGHOST" \
    -p "$PGPORT" \
    -U "$PGUSER" \
    "$PGDATABASE"
fi

if [[ -f "$MIGRATION_DIR/career_agent.dump" ]]; then
  log "恢复 PostgreSQL 备份。"
  PGPASSWORD="$PGPASSWORD" pg_restore \
    --clean \
    --if-exists \
    --no-owner \
    -h "$PGHOST" \
    -p "$PGPORT" \
    -U "$PGUSER" \
    -d "$PGDATABASE" \
    "$MIGRATION_DIR/career_agent.dump"
else
  log "未找到 career_agent.dump，跳过 PostgreSQL 恢复。"
fi

if [[ -f "$MIGRATION_DIR/pi-agent.tgz" ]]; then
  log "恢复 Pi Agent 目录。"
  mkdir -p "$HOME"
  tar -xzf "$MIGRATION_DIR/pi-agent.tgz" -C "$HOME"
else
  log "未找到 pi-agent.tgz，后续若 Agent 无法运行，请手动补齐 ~/.career-agent/pi-agent。"
fi

if [[ -f "$MIGRATION_DIR/report-exports.tgz" ]]; then
  log "恢复报告导出文件。"
  mkdir -p "$ABS_REPORT_EXPORT_DIR"
  tar -xzf "$MIGRATION_DIR/report-exports.tgz" -C "$ABS_REPORT_EXPORT_DIR"
else
  log "未找到 report-exports.tgz，历史导出记录可能存在，但对应文件下载会 404。"
fi

log "安装 Node 依赖。"
cd "$ROOT_DIR"
npm install

# 说明：报告 PDF 导出依赖 Playwright 的 Chromium 浏览器；
# 新电脑只做 npm install 往往还不够，这一步用于补齐运行时浏览器二进制。
log "安装 Playwright Chromium。"
npx playwright install chromium

cat <<EOF
[migration-import] 恢复完成。
[migration-import] 下一步建议：
1. 启动应用：npm run dev
2. 健康检查：curl http://127.0.0.1:8000/healthz
3. 如需重建 Neo4j 首批种子图谱：npm run career-path:sync
4. 如需重建 V2 图谱，请在服务启动后调用 POST /api/v2/career-paths/generate
EOF
