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

## API

- `GET /healthz`
- `POST /api/v1/jobs/import`
- `GET /api/v1/jobs`
- `POST /api/v1/jobs/profile/generate`
- `GET /api/v1/profile`
- `POST /api/v1/profile`

## 存储适配器

当前使用 JSON 存储适配器：

- `modules/jobs/jobs.repository.json.ts`
- `modules/profile/profile.repository.json.ts`

后续接 PostgreSQL/pgvector/Neo4j 时，新增 repository adapter 文件，不修改 route/service 调用链。
