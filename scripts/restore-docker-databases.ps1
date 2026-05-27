param(
  [string]$ComposeFile = "infra/docker-compose.app.yml",
  [string]$BackupDir = "infra/backups/current",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Run-Step {
  param(
    [string]$Title,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Title"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed: $Title"
  }
}

function Wait-Postgres {
  for ($i = 1; $i -le 60; $i++) {
    docker compose -f $ComposeFile exec -T postgres pg_isready -U career -d career_agent *> $null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 2
  }

  throw "PostgreSQL did not become ready within 120 seconds."
}

$RepoRoot = (Get-Location).Path
$PostgresBackup = Join-Path $RepoRoot (Join-Path $BackupDir "postgres.sql")
$Neo4jBackup = Join-Path $RepoRoot (Join-Path $BackupDir "neo4j-data.tar.gz")
$StorageBackup = Join-Path $RepoRoot (Join-Path $BackupDir "backend-storage.zip")

if (-not (Test-Path $ComposeFile)) {
  throw "Compose file not found: $ComposeFile. Run this script from the repository root."
}

if (-not (Test-Path $PostgresBackup)) {
  throw "PostgreSQL backup not found: $PostgresBackup"
}

if (-not (Test-Path $Neo4jBackup)) {
  throw "Neo4j backup not found: $Neo4jBackup"
}

if (-not (Test-Path $StorageBackup)) {
  throw "Backend storage backup not found: $StorageBackup"
}

Run-Step "Check Docker" {
  docker version | Out-Host
  docker compose version | Out-Host
}

Run-Step "Validate Compose config" {
  docker compose -f $ComposeFile config | Out-Null
}

Run-Step "Stop existing stack" {
  docker compose -f $ComposeFile down
}

Run-Step "Create required volumes" {
  docker volume create infra_pg_data | Out-Host
  docker volume create infra_neo4j_data | Out-Host
}

Run-Step "Restore Neo4j volume" {
  docker run --rm `
    -v infra_neo4j_data:/data `
    --mount type=bind,source="$RepoRoot",target=/repo `
    alpine sh -c "find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar xzf /repo/$BackupDir/neo4j-data.tar.gz -C /data"
}

Run-Step "Start PostgreSQL" {
  docker compose -f $ComposeFile up -d postgres
}

Write-Host ""
Write-Host "==> Wait for PostgreSQL"
Wait-Postgres

Run-Step "Reset PostgreSQL public schema" {
  docker compose -f $ComposeFile exec -T postgres psql -v ON_ERROR_STOP=1 -U career -d career_agent -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
}

Run-Step "Restore PostgreSQL data" {
  Get-Content -Path $PostgresBackup | docker compose -f $ComposeFile exec -T postgres psql -v ON_ERROR_STOP=1 -U career -d career_agent
}

Run-Step "Restore backend storage files" {
  $StorageDir = Join-Path $RepoRoot "apps/backend/storage"
  if (Test-Path $StorageDir) {
    Remove-Item -Recurse -Force $StorageDir
  }
  Expand-Archive -Path $StorageBackup -DestinationPath (Join-Path $RepoRoot "apps/backend") -Force
}

if ($SkipBuild) {
  Run-Step "Start full stack" {
    docker compose -f $ComposeFile up -d
  }
} else {
  Run-Step "Build and start full stack" {
    docker compose -f $ComposeFile up -d --build
  }
}

Run-Step "Show service status" {
  docker compose -f $ComposeFile ps
}

Write-Host ""
Write-Host "Restore finished."
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend health: http://localhost:8000/healthz"
Write-Host "Neo4j Browser: http://localhost:7474"
