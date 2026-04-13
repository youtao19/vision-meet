# 文件作用：在 Windows 新电脑上恢复 Career Agent 的核心运行资产。
# 职责边界：
# 1. 恢复前后端环境文件。
# 2. 使用 Docker 容器内自带的 PostgreSQL 工具恢复数据库，避免额外安装 pg_restore/psql。
# 3. 恢复 Pi Agent 目录与报告导出文件。
# 4. 安装 Node 依赖与 Playwright Chromium。

param(
  [Parameter(Mandatory = $true)]
  [string]$MigrationDir
)

$ErrorActionPreference = "Stop"

function Write-Log {
  param([string]$Message)
  Write-Host "[migration-import.ps1] $Message"
}

function Fail {
  param([string]$Message)
  throw "[migration-import.ps1] ERROR: $Message"
}

# 作用：读取 .env 文件中的键值对，供迁移脚本复用当前项目真实配置。
function Read-EnvFile {
  param([string]$FilePath)

  if (-not (Test-Path -LiteralPath $FilePath)) {
    Fail "未找到环境文件：$FilePath"
  }

  $result = @{}
  foreach ($line in Get-Content -LiteralPath $FilePath) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
      continue
    }
    if ($trimmed.StartsWith("#")) {
      continue
    }

    $index = $trimmed.IndexOf("=")
    if ($index -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $index).Trim()
    $value = $trimmed.Substring($index + 1).Trim()
    $result[$key] = $value
  }

  return $result
}

# 作用：把相对路径统一解析为仓库内路径；若用户误把 macOS 绝对路径带到 Windows，这里直接显式报错。
function Resolve-RepoPath {
  param(
    [string]$RootDir,
    [string]$RawPath
  )

  if ([string]::IsNullOrWhiteSpace($RawPath)) {
    return $null
  }

  if ($RawPath -match "^[A-Za-z]:\\" -or $RawPath -match "^\\\\") {
    return $RawPath
  }

  if ($RawPath.StartsWith("/")) {
    Fail "检测到 Unix 风格绝对路径：$RawPath。请先把 apps/backend/.env 中的路径改成 Windows 路径，或删除该配置后走默认值。"
  }

  return (Join-Path $RootDir $RawPath)
}

function Invoke-Docker {
  param([string[]]$Args)
  & docker @Args
  if ($LASTEXITCODE -ne 0) {
    Fail "docker 命令执行失败：docker $($Args -join ' ')"
  }
}

function Wait-ForPostgres {
  param(
    [string]$User
  )

  for ($i = 0; $i -lt 30; $i += 1) {
    & docker exec career-agent-postgres pg_isready -U $User -d postgres | Out-Null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 2
  }

  Fail "PostgreSQL 在预期时间内未就绪，请检查 Docker Desktop 与容器状态。"
}

$RootDir = Split-Path -Parent $PSScriptRoot
$BackendEnvFile = Join-Path $RootDir "apps/backend/.env"
$FrontendEnvFile = Join-Path $RootDir "apps/frontend/.env"
$MigrationDir = (Resolve-Path -LiteralPath $MigrationDir).Path

if (-not (Test-Path -LiteralPath $MigrationDir)) {
  Fail "迁移包目录不存在：$MigrationDir"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail "未找到 docker，请先安装并启动 Docker Desktop。"
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Fail "未找到 npm，请先安装 Node.js 22.20.x。"
}

if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
  Fail "未找到 tar，请确认 Windows 已提供 tar 命令。"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $BackendEnvFile) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $FrontendEnvFile) | Out-Null

$BackendMigrationEnv = Join-Path $MigrationDir "backend.env"
if (-not (Test-Path -LiteralPath $BackendMigrationEnv)) {
  Fail "迁移包中缺少 backend.env"
}
Copy-Item -LiteralPath $BackendMigrationEnv -Destination $BackendEnvFile -Force

$FrontendMigrationEnv = Join-Path $MigrationDir "frontend.env"
if (Test-Path -LiteralPath $FrontendMigrationEnv) {
  Copy-Item -LiteralPath $FrontendMigrationEnv -Destination $FrontendEnvFile -Force
}

$EnvMap = Read-EnvFile -FilePath $BackendEnvFile
$PGUser = if ($EnvMap.ContainsKey("PGUSER")) { $EnvMap["PGUSER"] } else { "career" }
$PGPassword = if ($EnvMap.ContainsKey("PGPASSWORD")) { $EnvMap["PGPASSWORD"] } else { "career_dev_password" }
$PGDatabase = if ($EnvMap.ContainsKey("PGDATABASE")) { $EnvMap["PGDATABASE"] } else { "career_agent" }
$ReportExportDir = if ($EnvMap.ContainsKey("REPORT_EXPORT_DIR")) { $EnvMap["REPORT_EXPORT_DIR"] } else { "storage/exports/reports" }
$AgentPiDir = if ($EnvMap.ContainsKey("AGENT_PI_DIR")) { $EnvMap["AGENT_PI_DIR"] } else { (Join-Path $HOME ".career-agent/pi-agent") }

$AbsReportExportDir = Resolve-RepoPath -RootDir $RootDir -RawPath $ReportExportDir
$AbsAgentPiDir =
  if ($AgentPiDir -match "^[A-Za-z]:\\" -or $AgentPiDir -match "^\\\\") {
    $AgentPiDir
  } elseif ($AgentPiDir.StartsWith("/")) {
    Fail "检测到 Unix 风格 AGENT_PI_DIR：$AgentPiDir。请改成 Windows 路径或删除该配置。"
  } else {
    Join-Path $RootDir $AgentPiDir
  }

Write-Log "启动基础设施容器。"
Invoke-Docker -Args @("compose", "-f", (Join-Path $RootDir "infra/docker-compose.yml"), "up", "-d", "postgres", "neo4j")
Wait-ForPostgres -User $PGUser

$DatabaseExists = (& docker exec career-agent-postgres psql -U $PGUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$PGDatabase'").Trim()
if ($DatabaseExists -ne "1") {
  Write-Log "目标数据库不存在，开始创建：$PGDatabase"
  Invoke-Docker -Args @("exec", "career-agent-postgres", "createdb", "-U", $PGUser, $PGDatabase)
}

$DumpFile = Join-Path $MigrationDir "career_agent.dump"
if (Test-Path -LiteralPath $DumpFile) {
  Write-Log "恢复 PostgreSQL 备份。"
  Invoke-Docker -Args @("cp", $DumpFile, "career-agent-postgres:/tmp/career_agent.dump")
  Invoke-Docker -Args @(
    "exec",
    "-e", "PGPASSWORD=$PGPassword",
    "career-agent-postgres",
    "pg_restore",
    "--clean",
    "--if-exists",
    "--no-owner",
    "-U", $PGUser,
    "-d", $PGDatabase,
    "/tmp/career_agent.dump"
  )
} else {
  Write-Log "未找到 career_agent.dump，跳过 PostgreSQL 恢复。"
}

$PiAgentArchive = Join-Path $MigrationDir "pi-agent.tgz"
if (Test-Path -LiteralPath $PiAgentArchive) {
  Write-Log "恢复 Pi Agent 目录。"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $AbsAgentPiDir) | Out-Null
  & tar -xzf $PiAgentArchive -C $HOME
  if ($LASTEXITCODE -ne 0) {
    Fail "pi-agent.tgz 解压失败。"
  }
} else {
  Write-Log "未找到 pi-agent.tgz，后续若 Agent 无法运行，请手动补齐 $AbsAgentPiDir"
}

$ReportArchive = Join-Path $MigrationDir "report-exports.tgz"
if (Test-Path -LiteralPath $ReportArchive) {
  Write-Log "恢复报告导出文件。"
  New-Item -ItemType Directory -Force -Path $AbsReportExportDir | Out-Null
  & tar -xzf $ReportArchive -C $AbsReportExportDir
  if ($LASTEXITCODE -ne 0) {
    Fail "report-exports.tgz 解压失败。"
  }
} else {
  Write-Log "未找到 report-exports.tgz，历史导出记录存在时，对应文件下载可能 404。"
}

Write-Log "安装 Node 依赖。"
Push-Location $RootDir
try {
  & npm install
  if ($LASTEXITCODE -ne 0) {
    Fail "npm install 执行失败。"
  }

  # 说明：报告 PDF 导出依赖 Playwright Chromium；
  # 新电脑仅安装 npm 包通常还不够，因此这里补齐浏览器运行时。
  Write-Log "安装 Playwright Chromium。"
  & npx playwright install chromium
  if ($LASTEXITCODE -ne 0) {
    Fail "npx playwright install chromium 执行失败。"
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "[migration-import.ps1] 恢复完成。"
Write-Host "[migration-import.ps1] 下一步建议："
Write-Host "1. 启动应用：npm run dev"
Write-Host "2. 健康检查：curl http://127.0.0.1:8000/healthz"
Write-Host "3. 如需重建 Neo4j 首批种子图谱：npm run career-path:sync"
Write-Host "4. 如需重建 V2 图谱，请在服务启动后调用 POST /api/v2/career-paths/generate"
