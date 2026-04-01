# Career Agent（Monorepo）

基于 AI 的大学生职业规划智能体项目。  
需求文档见：[docs/项目大赛文档.md](./docs/项目大赛文档.md)

## 技术栈

1. 前端：Vue3 + TypeScript + Pinia + Vue Router
2. 后端：Node.js + Express + TypeScript
3. 契约：OpenAPI + 共享 TypeScript 类型（`packages/contracts`）
4. 数据层：JSON 文件（当前）/ PostgreSQL + pgvector（目标）
5. 图谱：Neo4j（目标）

## 核心协作约束（摘要）

1. 必须保持 Monorepo，不拆分前后端仓库。
2. 前端只在 `apps/frontend`，并遵循 `src/app`、`src/features`、`src/shared`。
3. 后端只在 `apps/backend`，并遵循
   `route -> schemas -> service -> repository -> repository.adapter` 分层。
4. 接口变更遵循 contracts-first：先改 `packages/contracts/openapi` 与
   `packages/contracts/types`，再改后端，最后改前端。

## 目录结构

```text
career-agent/
├─ apps/
│  ├─ frontend/          # Vue 前端应用（app/features/shared）
│  └─ backend/           # Express 后端应用（modules/<domain> + route/schemas/service/repository/repository.adapter）
├─ packages/
│  └─ contracts/         # OpenAPI / shared types
├─ infra/
├─ data/
├─ docs/
├─ scripts/
└─ services/
```

## 快速开始（根目录）

1. 安装依赖

```bash
npm install
```

2. 启动前后端

```bash
npm run dev
```

3. 常用命令

```bash
npm run dev:backend
npm run dev:frontend
npm run type-check
npm run build
```

4. 访问地址
1. 后端健康检查：`http://127.0.0.1:8000/healthz`
1. 后端 API：`http://127.0.0.1:8000/api/v1/jobs`
1. 前端：`http://127.0.0.1:5173`

## 当前后端已实现 API

1. `POST /api/v1/jobs/import`：岗位数据导入（csv/tsv/json/xls/xlsx）
2. `GET /api/v1/jobs`：岗位列表查询
3. `POST /api/v1/jobs/profile/generate`：岗位画像生成
4. `GET /api/v1/profile`：学生画像列表
5. `POST /api/v1/profile`：创建学生画像（MVP）
6. `GET /healthz`：服务健康检查（含存储文件路径）

## 协作规范

- 结构约束文档：[`docs/工程结构与协作规范.md`](./docs/工程结构与协作规范.md)
- 宪章：[`.specify/memory/constitution.md`](./.specify/memory/constitution.md)
- 贡献指南：[`AGENTS.md`](./AGENTS.md)
- 问题记录：[`docs/问题记录库.jsonl`](./docs/问题记录库.jsonl)
