# Career Agent Backend

## 启动（从仓库根目录）

```bash
npm run dev:backend
```

## 架构约束

后端必须采用领域模块结构：

- `src/modules/<domain>/`：业务域
- `src/shared/`：共享基础能力

当前已落地模块：

- `modules/jobs/jobs.route.ts`
- `modules/jobs/jobs.schemas.ts`
- `modules/jobs/jobs.service.ts`
- `modules/jobs/jobs.repository.ts`
- `modules/jobs/jobs.repository.pg.ts`
- `modules/profile/profile.route.ts`
- `modules/profile/profile.schemas.ts`
- `modules/profile/profile.service.ts`
- `modules/profile/profile.repository.ts`
- `modules/profile/profile.repository.pg.ts`

## 配置

使用 `zod` 启动校验（`src/shared/config/env.ts`）。

环境变量示例：

```bash
cp apps/backend/.env.example apps/backend/.env
```

支持变量：

- `APP_ENV`
- `PORT`
- `REPORT_EXPORT_DIR`
- `AGENT_PI_DIR`
- `AGENT_SESSION_STORE_DIR`
- `AGENT_MODEL`
- `AGENT_THINKING_LEVEL`
- `MATCH_SCORING_VERSION`
- `PGHOST`
- `PGPORT`
- `PGDATABASE`
- `PGUSER`
- `PGPASSWORD`
- `PGVECTOR_DIM`
- `KNOWLEDGE_TOP_K`
- `KNOWLEDGE_REINDEX_BATCH_SIZE`

## Pi Agent 登录与切换

从仓库根目录执行：

```bash
npm run agent:auth -- status
npm run agent:auth -- list
npm run agent:auth -- models codex
npm run agent:auth -- login openai-codex --model openai-codex/gpt-5.4
npm run agent:auth -- switch kimi-coding/k2p5
npm run agent:smoke
```

说明：

- `login` 会调用 Pi 官方 `pi-ai login`，使用 Pi 支持的登录方式重新登录。
- 登录凭证写入本项目 Agent 目录，默认是 `~/.career-agent/pi-agent/auth.json`，不会提交到仓库。
- `switch` 只更新 `apps/backend/.env` 中的 `AGENT_MODEL`，模型格式必须是 `provider/model`。
- `status` 只打印 provider 和认证类型，不打印 token 或 API key。

## API

- `GET /healthz`
- `POST /api/v2/jobs/import`
- `GET /api/v2/jobs`
- `GET /api/v2/profile`
- `POST /api/v2/profile`
- `POST /api/v2/profile/resume`
- `POST /api/v2/matches`
- `GET /api/v2/matches`
- `GET /api/v2/matches/{match_id}`
- `POST /api/v2/knowledge/index`
- `POST /api/v2/knowledge/search`
- `POST /api/v2/knowledge/evaluations`
- `POST /api/v2/reports`
- `GET /api/v2/reports?match_id={match_id}`
- `GET /api/v2/reports/{report_id}`
- `PATCH /api/v2/reports/{report_id}`
- `POST /api/v2/reports/{report_id}/exports`
- `GET /api/v2/reports/{report_id}/exports`
- `GET /api/v2/report-exports/{export_id}/download`

详细说明见：

- [`docs/接口文档.md`](../../docs/接口文档.md)
- [`packages/contracts/openapi/career-agent.openapi.yaml`](../../packages/contracts/openapi/career-agent.openapi.yaml)

## 存储适配器

当前结构化数据统一使用 PostgreSQL 存储适配器：

- `modules/jobs/jobs.repository.pg.ts`
- `modules/profile/profile.repository.pg.ts`
- `modules/matching/matching.repository.pg.ts`
- `modules/report/report.repository.pg.ts`
- `modules/report/report-export.repository.pg.ts`
- `modules/ai/ai.repository.pg.ts`

知识检索仍由 `modules/knowledge/knowledge.repository.pg.ts` 负责，并使用 pgvector 承载向量索引。

## 知识库脚本

从仓库根目录执行：

```bash
npm run knowledge:init
npm run knowledge:index:jobs
npm run knowledge:index:project-docs
npm run knowledge:eval
```

说明：

- `knowledge:index:jobs` 只索引岗位数据到 `career_runtime`
- `knowledge:index:project-docs` 只索引 `docs/*.md` 到 `internal_project_docs`
