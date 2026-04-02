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
- `modules/jobs/jobs.repository.json.ts`
- `modules/profile/profile.route.ts`
- `modules/profile/profile.schemas.ts`
- `modules/profile/profile.service.ts`
- `modules/profile/profile.repository.ts`
- `modules/profile/profile.repository.json.ts`

## 配置

使用 `zod` 启动校验（`src/shared/config/env.ts`）。

环境变量示例：

```bash
cp apps/backend/.env.example apps/backend/.env
```

支持变量：

- `APP_ENV`
- `PORT`
- `DATA_STORE_PATH`
- `PROFILE_STORE_PATH`
- `MATCH_STORE_PATH`
- `REPORT_STORE_PATH`
- `MATCH_SCORING_VERSION`

## API

- `GET /healthz`
- `POST /api/v1/jobs/import`
- `GET /api/v1/jobs`
- `POST /api/v1/jobs/profile/generate`
- `GET /api/v1/profile`
- `POST /api/v1/profile`
- `POST /api/v1/profile/resume`
- `POST /api/v1/matches`
- `GET /api/v1/matches`
- `GET /api/v1/matches/{match_id}`
- `POST /api/v1/reports`
- `GET /api/v1/reports?match_id={match_id}`
- `GET /api/v1/reports/{report_id}`
- `PATCH /api/v1/reports/{report_id}`

详细说明见：

- [`docs/接口文档.md`](../../docs/接口文档.md)
- [`packages/contracts/openapi/career-agent.openapi.yaml`](../../packages/contracts/openapi/career-agent.openapi.yaml)

## 存储适配器

当前使用 JSON 存储适配器：

- `modules/jobs/jobs.repository.json.ts`
- `modules/profile/profile.repository.json.ts`
- `modules/matching/matching.repository.json.ts`
- `modules/report/report.repository.json.ts`

后续接 PostgreSQL/pgvector/Neo4j 时，新增 repository adapter 文件，不修改 route/service 调用链。
