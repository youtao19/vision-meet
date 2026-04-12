#!/usr/bin/env zsh
set -euo pipefail

# 文件作用：在老电脑上导出 Career Agent 的可迁移资产。
# 职责边界：
# 1. 导出当前仓库工作副本（包含未提交代码，但排除 node_modules / 构建产物）。
# 2. 导出 PostgreSQL 数据库备份。
# 3. 备份前后端本地环境文件、Pi Agent 目录、报告导出文件。
# 4. Neo4j 默认不做物理备份，迁移后建议在新电脑重建。

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${1:-$HOME/career-agent-migration-$(date '+%Y%m%d-%H%M%S')}"
BACKEND_ENV_FILE="$ROOT_DIR/apps/backend/.env"
FRONTEND_ENV_FILE="$ROOT_DIR/apps/frontend/.env"

log() {
  echo "[migration-export] $*"
}

fail() {
  echo "[migration-export] ERROR: $*" >&2
  exit 1
}

# 作用：把相对路径统一解析为基于仓库根目录的绝对路径，避免脚本在任意目录执行时跑偏。
resolve_path() {
  local raw_path="$1"
  if [[ "$raw_path" = /* ]]; then
    echo "$raw_path"
  else
    echo "$ROOT_DIR/$raw_path"
  fi
}

# 作用：加载后端 .env，优先复用当前项目真实运行配置，而不是只读 example。
load_backend_env() {
  if [[ ! -f "$BACKEND_ENV_FILE" ]]; then
    fail "未找到 $BACKEND_ENV_FILE，请先确认后端 .env 已存在。"
  fi

  set -a
  # shellcheck source=/dev/null
  source "$BACKEND_ENV_FILE"
  set +a
}

# 作用：把当前迁移包中包含了哪些内容写入说明文件，便于新电脑核对是否漏项。
write_manifest() {
  cat >"$OUTPUT_DIR/README.txt" <<EOF
Career Agent 迁移包
生成时间：$(date '+%Y-%m-%d %H:%M:%S %z')
仓库根目录：$ROOT_DIR

已导出内容：
1. career-agent-repo.tgz        当前仓库工作副本（含未提交代码）
2. career_agent.dump            PostgreSQL 自定义格式备份
3. backend.env                  后端环境变量
4. frontend.env                 前端环境变量（若存在）
5. pi-agent.tgz                 ~/.career-agent/pi-agent
6. report-exports.tgz           报告导出目录内容（若存在）

未导出内容：
1. Neo4j 物理数据卷
   建议在新电脑恢复 PostgreSQL 后，按项目脚本或接口重新生成图谱。
EOF
}

mkdir -p "$OUTPUT_DIR"
load_backend_env

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGDATABASE:=career_agent}"
: "${PGUSER:=career}"
: "${PGPASSWORD:=career_dev_password}"
: "${REPORT_EXPORT_DIR:=storage/exports/reports}"
: "${AGENT_PI_DIR:=$HOME/.career-agent/pi-agent}"

ABS_REPORT_EXPORT_DIR="$(resolve_path "$REPORT_EXPORT_DIR")"
REPO_PARENT_DIR="$(dirname "$ROOT_DIR")"
REPO_BASENAME="$(basename "$ROOT_DIR")"

command -v pg_dump >/dev/null 2>&1 || fail "未找到 pg_dump，请先安装 PostgreSQL 客户端工具。"
command -v tar >/dev/null 2>&1 || fail "未找到 tar。"

log "输出目录：$OUTPUT_DIR"

log "打包当前仓库工作副本。"
tar \
  --exclude="$REPO_BASENAME/node_modules" \
  --exclude="$REPO_BASENAME/apps/frontend/node_modules" \
  --exclude="$REPO_BASENAME/apps/backend/node_modules" \
  --exclude="$REPO_BASENAME/apps/frontend/dist" \
  --exclude="$REPO_BASENAME/apps/backend/dist" \
  --exclude="$REPO_BASENAME/dist" \
  --exclude="$REPO_BASENAME/build" \
  --exclude="$REPO_BASENAME/.DS_Store" \
  --exclude="$REPO_BASENAME/storage/exports/reports" \
  --exclude="$REPO_BASENAME/apps/backend/storage" \
  -czf "$OUTPUT_DIR/career-agent-repo.tgz" \
  -C "$REPO_PARENT_DIR" \
  "$REPO_BASENAME"

log "导出 PostgreSQL：postgres://${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"
PGPASSWORD="$PGPASSWORD" pg_dump \
  -h "$PGHOST" \
  -p "$PGPORT" \
  -U "$PGUSER" \
  -d "$PGDATABASE" \
  -Fc \
  -f "$OUTPUT_DIR/career_agent.dump"

log "备份环境变量文件。"
cp "$BACKEND_ENV_FILE" "$OUTPUT_DIR/backend.env"
if [[ -f "$FRONTEND_ENV_FILE" ]]; then
  cp "$FRONTEND_ENV_FILE" "$OUTPUT_DIR/frontend.env"
fi

if [[ -d "$AGENT_PI_DIR" ]]; then
  log "备份 Pi Agent 目录：$AGENT_PI_DIR"
  tar -czf "$OUTPUT_DIR/pi-agent.tgz" -C "$HOME" ".career-agent/pi-agent"
else
  log "未找到 Pi Agent 目录，跳过：$AGENT_PI_DIR"
fi

if [[ -d "$ABS_REPORT_EXPORT_DIR" ]]; then
  log "备份报告导出目录：$ABS_REPORT_EXPORT_DIR"
  tar -czf "$OUTPUT_DIR/report-exports.tgz" -C "$ABS_REPORT_EXPORT_DIR" .
else
  log "未找到报告导出目录，跳过：$ABS_REPORT_EXPORT_DIR"
fi

write_manifest

log "导出完成。"
log "迁移包目录：$OUTPUT_DIR"
