# Infra

本目录包含本地开发基础设施编排配置。

说明：

1. Docker 版 PostgreSQL 映射到宿主机 `5433`，避免与本机 Homebrew PostgreSQL `5432` 冲突。
2. 若后端要切到 Docker PostgreSQL，请将 `apps/backend/.env` 中的 `PGPORT` 改为 `5433`。

## 启动

```bash
docker compose -f infra/docker-compose.yml up -d
```

## 停止

```bash
docker compose -f infra/docker-compose.yml down
```

## 服务

1. PostgreSQL（含 pgvector）：`localhost:5433`
2. Neo4j：`localhost:7474`（Web）/ `localhost:7687`（Bolt）
