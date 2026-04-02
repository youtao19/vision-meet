# Career Agent（Monorepo）

基于 AI 的大学生职业规划智能体项目。
需求文档见：[docs/项目大赛文档.md](./docs/项目大赛文档.md)

## 技术栈

1. 前端：Vue3 + TypeScript + Pinia + Vue Router
2. 后端：Node.js + Express + TypeScript
3. 契约：OpenAPI + 共享 TypeScript 类型（`packages/contracts`）
4. 数据层：PostgreSQL + pgvector
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

1. 先切到 Node 22.12+

```bash
node -v
# 期望看到 v22.12.x 或更高的 22.x
```

仓库已提供 [`.nvmrc`](./.nvmrc) 和 [`.node-version`](./.node-version)，统一要求使用 Node `22.12.0`。

2. 启动 PostgreSQL（本地 docker compose 场景）

```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

若使用仓库自带 compose，记得把后端 `PGPORT` 配成 `5433`。

3. 安装依赖

```bash
npm install
```

4. 启动前后端

```bash
npm run dev
```

5. 常用命令

```bash
npm run dev:backend
npm run dev:frontend
npm run type-check
npm run build
npm run knowledge:init
npm run knowledge:index:jobs
npm run knowledge:index:project-docs
npm run knowledge:eval
npm run moonshot:smoke
npm run moonshot:smoke:sdk
```

6. 访问地址
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
10. `POST /api/v1/knowledge/index`：索引岗位数据 / 简历文本 / 内部项目文档
11. `POST /api/v1/knowledge/search`：执行知识检索（默认仅查 `career_runtime`）
12. `POST /api/v1/knowledge/evaluations`：执行知识检索基线评测
13. `POST /api/v1/reports`：基于匹配结果生成职业报告版本
14. `GET /api/v1/reports?match_id={match_id}`：查询某个匹配结果下的报告版本列表
15. `GET /api/v1/reports/{report_id}`：查询职业报告详情
16. `PATCH /api/v1/reports/{report_id}`：保存职业报告结构化章节编辑结果
17. `POST /api/v1/reports/{report_id}/exports`：生成并登记 PDF 导出产物
18. `GET /api/v1/reports/{report_id}/exports`：查询当前报告版本的导出记录
19. `GET /api/v1/report-exports/{export_id}/download`：下载已生成的 PDF 文件
20. `POST /api/v1/agent/tasks`：创建一次 Agent 任务（任务规划 -> 工具执行 -> 结果汇总）
21. `GET /api/v1/agent/tasks/{task_id}`：查询单个 Agent 任务结果
22. `GET /healthz`：服务健康检查（含数据库连接摘要）

## 知识库说明

1. 业务知识库命名空间为 `career_runtime`，只收录岗位数据与学生简历文本。
2. 项目文档只进入 `internal_project_docs`，用于内部调试与评测，不参与默认用户检索。
3. PostgreSQL/pgvector 初始化 SQL 位于 [`infra/sql/knowledge.init.sql`](./infra/sql/knowledge.init.sql)。
4. 简历上传成功后，会自动把简历原文同步写入知识库，并通过 `student_profile_id` 建立关联。

## Agent 说明

1. 当前 `/api/v1/agent/tasks` 已切换为真实的 Pi SDK 运行时：后端不再手写固定 workflow，而是把 `load_task_context`、`search_knowledge`、`create_match`、`create_report` 封装成 Pi 可调用工具，由 Pi 决定调用顺序并返回最终总结。
2. Agent 默认使用独立配置目录 `~/.career-agent/pi-agent`，不会把其他项目目录当成自己的运行目录；但如果独立目录缺少 `auth.json` 或 `models.json`，会自动从 `~/.openclaw/agents/main/agent` 复制缺失文件做一次兼容导入。如需自定义，可通过 `AGENT_PI_DIR`、`AGENT_SESSION_STORE_DIR`、`AGENT_MODEL`、`AGENT_THINKING_LEVEL` 覆盖。
3. 当前业务报告模块仍通过现有 OpenAI 兼容 LLM 配置工作，因此若需要生成职业报告，后端仍需配置 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`、`LLM_TIMEOUT_MS`、`LLM_TEMPERATURE`。
4. 若只想让 Pi Agent 跑起来，需先在独立 Agent 目录准备好 `auth.json` / `models.json`，或确保对应 provider 的标准环境变量已存在；若显式设置 `AGENT_MODEL`，格式必须为 `provider/model`。
5. 当前代码已通过 `npm run type-check`、`npm run build:backend` 和 `createApp()` 级别验证；真实任务执行仍依赖本机的 Agent 凭证、知识库和业务数据是否准备完毕。
6. 如需绕开业务链路单独验证 Moonshot/Kimi 凭证，可直接运行 `npm run moonshot:smoke`，脚本会先验证 `/models` 再验证最小 `chat/completions`。
7. 如需严格按 Moonshot 官方文档的 OpenAI SDK 方式验证，可运行 `npm run moonshot:smoke:sdk`，用于排除自写 HTTP 请求与 SDK 行为差异。

## 协作规范

- 结构约束文档：[`docs/工程结构与协作规范.md`](./docs/工程结构与协作规范.md)
- 宪章：[`.specify/memory/constitution.md`](./.specify/memory/constitution.md)
- 贡献指南：[`AGENTS.md`](./AGENTS.md)
- 问题记录：[`docs/问题记录库.jsonl`](./docs/问题记录库.jsonl)
