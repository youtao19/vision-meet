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

## 接口文档

- 人读版接口文档：[`docs/接口文档.md`](./docs/接口文档.md)
- OpenAPI 契约：[`packages/contracts/openapi/career-agent.openapi.yaml`](./packages/contracts/openapi/career-agent.openapi.yaml)
- 共享类型：[`packages/contracts/types/index.ts`](./packages/contracts/types/index.ts)

## 当前后端已实现 API

1. `POST /api/v1/jobs/import`：岗位数据导入（csv/tsv/json/xls/xlsx）
2. `GET /api/v1/jobs`：岗位列表查询
3. `POST /api/v1/jobs/profile/generate`：岗位画像生成
4. `GET /api/v1/profile`：学生画像列表
5. `POST /api/v1/profile`：手动创建学生画像
6. `POST /api/v1/profile/resume`：简历上传创建学生画像
7. `POST /api/v1/matches`：创建人岗匹配结果（支持复现/缓存语义）
8. `GET /api/v1/matches`：匹配结果列表查询（按画像/岗位筛选）
9. `GET /api/v1/matches/{match_id}`：匹配结果详情查询
10. `POST /api/v1/reports`：基于匹配结果生成职业报告版本
11. `GET /api/v1/reports?match_id={match_id}`：查询某个匹配结果下的报告版本列表
12. `GET /api/v1/reports/{report_id}`：查询职业报告详情
13. `PATCH /api/v1/reports/{report_id}`：保存职业报告结构化章节编辑结果
14. `POST /api/v1/reports/{report_id}/exports`：生成并登记 PDF 导出产物
15. `GET /api/v1/reports/{report_id}/exports`：查询当前报告版本的导出记录
16. `GET /api/v1/report-exports/{export_id}/download`：下载已生成的 PDF 文件
17. `GET /healthz`：服务健康检查（含存储文件路径）

## 协作规范

- 结构约束文档：[`docs/工程结构与协作规范.md`](./docs/工程结构与协作规范.md)
- 宪章：[`.specify/memory/constitution.md`](./.specify/memory/constitution.md)
- 贡献指南：[`AGENTS.md`](./AGENTS.md)
- 问题记录：[`docs/问题记录库.jsonl`](./docs/问题记录库.jsonl)
