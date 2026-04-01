# Infra

本目录包含本地开发基础设施编排配置。

## 启动

```bash
docker compose -f infra/docker-compose.yml up -d
```

## 停止

```bash
docker compose -f infra/docker-compose.yml down
```

## 服务

1. PostgreSQL（含 pgvector）：`localhost:5432`
2. Neo4j：`localhost:7474`（Web）/ `localhost:7687`（Bolt）
