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

1. 先切到 Node 22.20+

```bash
node -v
# 期望看到 v22.20.x 或更高的 22.x
```

仓库已提供 [`.nvmrc`](./.nvmrc) 和 [`.node-version`](./.node-version)，统一要求使用 Node `22.20.0`。

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
npm run agent:auth:kimi
npm run type-check
npm run build
npm run agent:smoke
npm run evaluation:manual
npm run knowledge:init
npm run knowledge:index:jobs
npm run knowledge:index:project-docs
npm run knowledge:eval
npm run jobs:pipeline:run
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
3. `GET /api/v1/profile`：学生画像列表
4. `POST /api/v1/profile`：手动创建学生画像
5. `POST /api/v1/profile/resume`：简历上传创建学生画像
6. `POST /api/v1/matches`：创建人岗匹配结果（支持复现/缓存语义）
7. `GET /api/v1/matches`：匹配结果列表查询（按画像/岗位筛选）
8. `GET /api/v1/matches/{match_id}`：匹配结果详情查询
9. `POST /api/v1/knowledge/index`：索引岗位数据 / 简历文本 / 内部项目文档
10. `POST /api/v1/knowledge/search`：执行知识检索（默认仅查 `career_runtime`）
11. `POST /api/v1/knowledge/evaluations`：执行知识检索基线评测
12. `POST /api/v1/reports`：基于匹配结果生成职业报告版本
13. `GET /api/v1/reports?match_id={match_id}`：查询某个匹配结果下的报告版本列表
14. `GET /api/v1/reports/{report_id}`：查询职业报告详情
15. `PATCH /api/v1/reports/{report_id}`：保存职业报告结构化章节编辑结果
16. `POST /api/v1/reports/{report_id}/exports`：生成并登记 PDF 导出产物
17. `GET /api/v1/reports/{report_id}/exports`：查询当前报告版本的导出记录
18. `GET /api/v1/report-exports/{export_id}/download`：下载已生成的 PDF 文件
19. `POST /api/v1/agent/chat`：兼容旧聊天式入口，内部转到当前任务型 Agent
20. `POST /api/v1/agent/tasks`：创建一次 Agent 任务（任务规划 -> 工具执行 -> 结果汇总）
21. `GET /api/v1/agent/tasks/{task_id}`：查询单个 Agent 任务结果
22. `GET /healthz`：服务健康检查（含数据库连接摘要）

## V2 新增接口（岗位智能处理闭环）

1. `POST /api/v2/jobs/pipeline/run`：手动触发岗位智能流水线（全量/增量）。
2. `GET /api/v2/jobs/pipeline/tasks/{task_id}`：查询流水线任务进度与统计。
3. `GET /api/v2/career-paths/jobs/{job_id}`：查询 V2 自动图谱（晋升 + 换岗）。
4. `POST /api/v2/matches`、`GET /api/v2/matches*`：V2 匹配接口（含路径建议和证据引用）。
5. `POST /api/v2/reports`、`GET /api/v2/reports*`：V2 报告接口（含 `generator_mode` 与结构化行动计划）。

## 知识库说明

1. 业务知识库命名空间为 `career_runtime`，只收录岗位数据与学生简历文本。
2. 项目文档只进入 `internal_project_docs`，用于内部调试与评测，不参与默认用户检索。
3. PostgreSQL/pgvector 初始化 SQL 位于 [`infra/sql/knowledge.init.sql`](./infra/sql/knowledge.init.sql)。
4. 简历上传成功后，会自动把简历原文同步写入知识库，并通过 `student_profile_id` 建立关联。
5. 手工抽样评测命令为 `npm run evaluation:manual`，默认读取 `data/evaluation/*.jsonl`，并生成 [`docs/评测结果-手工抽样.md`](./docs/评测结果-手工抽样.md)。

## Agent 说明

1. 当前 `/api/v1/agent/tasks` 已切换为真实的 Pi SDK 运行时：后端不再手写固定 workflow，而是把 `load_task_context`、`search_knowledge`、`create_match`、`create_report` 封装成 Pi 可调用工具，由 Pi 决定调用顺序并返回最终总结。
2. Agent 默认使用独立配置目录 `~/.career-agent/pi-agent`，不会把其他项目目录当成自己的运行目录；如果独立目录缺少 `auth.json` 或 `models.json`，会优先从标准 Pi 目录 `~/.pi/agent` 复制缺失文件做一次兼容导入。若检测到 OpenClaw 主智能体目录 `~/.openclaw/agents/main/agent`，还会把其中的 `auth-profiles.json` 按 Pi `auth.json` 结构转换导入。后续运行仍以独立目录为准。如需自定义，可通过 `AGENT_PI_DIR`、`AGENT_SESSION_STORE_DIR`、`AGENT_MODEL`、`AGENT_THINKING_LEVEL` 覆盖。
3. 当前职业报告生成已回到稳定可复现的模板链路，不再依赖独立聊天补全客户端。
4. 若未显式设置 `AGENT_MODEL`，后端会优先沿用 `KIMI_MODEL`，其次才回退到 `MOONSHOT_MODEL`。
5. 若只想让 Pi Agent 跑起来，可以先使用官方 `pi` 完成 `/login`，项目会自动复用 `~/.pi/agent/auth.json` / `models.json`；如果你已经在 OpenClaw 中配置过 Kimi/Moonshot，项目也会自动尝试导入 `~/.openclaw/agents/main/agent/auth-profiles.json`。若显式设置 `AGENT_MODEL`，格式必须为 `provider/model`。
6. 当前项目默认使用 `kimi-coding/k2p5`。也就是说，Agent 主链路优先按 Kimi Code 接入，对应 `KIMI_API_KEY` 或 `KIMICODE_API_KEY`。
7. 若你确实需要兼容 Moonshot 开放平台 Kimi，仍可显式设置 `AGENT_MODEL=moonshot/kimi-k2.5`，此时使用 `MOONSHOT_API_KEY`。
8. 若希望把当前 provider 的 API key 固化到项目独立 Agent 目录，可执行 `npm run agent:auth:kimi`。该脚本会按当前 `AGENT_MODEL` 选择正确的 provider 写入 `~/.career-agent/pi-agent/auth.json`；默认会写 `kimi-coding`，若显式切到 `moonshot` 才会补齐 Moonshot `models.json` 片段。
9. 旧入口 `/api/v1/agent/chat` 现已直接复用任务型 Agent，便于历史前端和脚本平滑迁移；`/api/v1/agent/analyze` 仍继续兼容。
10. 当前代码已通过 `npm run type-check`、`npm run build:backend` 和 `createApp()` 级别验证；如需单独做 Agent 联通性检查，可运行 `npm run agent:smoke`。

## 协作规范

- 结构约束文档：[`docs/工程结构与协作规范.md`](./docs/工程结构与协作规范.md)
- 宪章：[`.specify/memory/constitution.md`](./.specify/memory/constitution.md)
- 贡献指南：[`AGENTS.md`](./AGENTS.md)
- 问题记录：[`docs/问题记录库.jsonl`](./docs/问题记录库.jsonl)
