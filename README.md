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

| 命令                                                                    | 作用                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev:backend`                                                   | 启动后端开发服务，默认监听 `http://127.0.0.1:8000`。                                 |
| `npm run dev:frontend`                                                  | 启动前端开发服务，默认监听 `http://127.0.0.1:5173`。                                 |
| `npm run agent:auth -- status`                                          | 查看当前 Pi Agent 配置目录、当前运行模型和已登录 provider，不打印密钥。              |
| `npm run agent:auth -- list`                                            | 查看 Pi 当前支持的登录方式，例如 Codex、Claude、Gemini、Copilot。                    |
| `npm run agent:auth -- login openai-codex`                              | 进入 Pi 的 Codex 登录流程，并自动记录该 provider 的默认运行模型。                    |
| `npm run agent:auth -- use openai-codex/gpt-5.4`                        | 切换当前 Pi 运行模型，不修改 `.env`。                                                |
| `npm run type-check`                                                    | 执行 contracts、后端、前端的 TypeScript 类型检查。                                   |
| `npm run build`                                                         | 构建 contracts、后端、前端，检查项目是否能完整产出。                                 |
| `npm run agent:smoke`                                                   | 跑一次最小 Pi Agent 联通性检查，确认当前 Pi 运行模型和认证可用。                     |
| `npm run evaluation:manual`                                             | 执行手工抽样评测，读取 `data/evaluation/*.jsonl` 并生成评测结果文档。                |
| `npm run knowledge:init`                                                | 初始化知识库相关数据库结构。                                                         |
| `npm run knowledge:index:jobs`                                          | 将岗位数据索引进业务知识库命名空间 `career_runtime`。                                |
| `npm run knowledge:index:project-docs`                                  | 将 `docs/*.md` 索引进内部项目文档命名空间 `internal_project_docs`。                  |
| `npm run knowledge:eval`                                                | 执行知识检索基线评测。                                                               |

6. 访问地址
1. 后端健康检查：`http://127.0.0.1:8000/healthz`
1. 后端 API：`http://127.0.0.1:8000/api/v2/jobs`
1. 前端：`http://127.0.0.1:5173`

## 接口文档

- 人读版接口文档：[`docs/接口文档.md`](./docs/接口文档.md)
- OpenAPI 契约：[`packages/contracts/openapi/career-agent.openapi.yaml`](./packages/contracts/openapi/career-agent.openapi.yaml)
- 共享类型：[`packages/contracts/types/index.ts`](./packages/contracts/types/index.ts)

## 当前后端已实现 API

1. `POST /api/v2/jobs/import`：岗位数据导入（csv/tsv/json/xls/xlsx）
2. `GET /api/v2/jobs`：岗位列表查询
3. `GET /api/v2/profile`：学生画像列表
4. `POST /api/v2/profile`：手动创建学生画像
5. `POST /api/v2/profile/resume`：简历上传创建学生画像
6. `POST /api/v2/matches`：创建人岗匹配结果（支持复现/缓存语义）
7. `GET /api/v2/matches`：匹配结果列表查询（按画像/岗位筛选）
8. `GET /api/v2/matches/{match_id}`：匹配结果详情查询
9. `POST /api/v2/knowledge/index`：索引岗位数据 / 简历文本 / 内部项目文档
10. `POST /api/v2/knowledge/search`：执行知识检索（默认仅查 `career_runtime`）
11. `POST /api/v2/knowledge/evaluations`：执行知识检索基线评测
12. `POST /api/v2/reports`：基于匹配结果生成职业报告版本
13. `GET /api/v2/reports?match_id={match_id}`：查询某个匹配结果下的报告版本列表
14. `GET /api/v2/reports/{report_id}`：查询职业报告详情
15. `PATCH /api/v2/reports/{report_id}`：保存职业报告结构化章节编辑结果
16. `POST /api/v2/reports/{report_id}/exports`：生成并登记 PDF 导出产物
17. `GET /api/v2/reports/{report_id}/exports`：查询当前报告版本的导出记录
18. `GET /api/v2/report-exports/{export_id}/download`：下载已生成的 PDF 文件
19. `POST /api/v2/ai/tasks`：创建一次 AI 任务（任务规划 -> 工具执行 -> 结果汇总）
20. `POST /api/v2/ai/chat`：AI 中枢聊天式兼容入口
21. `GET /api/v2/ai/tasks/{task_id}`：查询单个 AI 任务结果
22. `GET /healthz`：服务健康检查（含数据库连接摘要）

## V2 新增接口（岗位智能处理闭环）

1. `GET /api/v2/career-paths/jobs/{job_id}`：查询 V2 自动图谱（晋升 + 换岗）。
4. `POST /api/v2/matches`、`GET /api/v2/matches*`：V2 匹配接口（含路径建议和证据引用）。
5. `POST /api/v2/reports`、`GET /api/v2/reports*`：V2 报告接口（含 `generator_mode` 与结构化行动计划）。

## 知识库说明

1. 业务知识库命名空间为 `career_runtime`，默认收录岗位数据。
2. 项目文档只进入 `internal_project_docs`，用于内部调试与评测，不参与默认用户检索。
3. PostgreSQL/pgvector 初始化 SQL 位于 [`infra/sql/knowledge.init.sql`](./infra/sql/knowledge.init.sql)。
4. 手工抽样评测命令为 `npm run evaluation:manual`，默认读取 `data/evaluation/*.jsonl`，并生成 [`docs/评测结果-手工抽样.md`](./docs/评测结果-手工抽样.md)。

## Agent 说明

1. 当前 `/api/v2/ai/tasks` 使用真实的 Pi SDK 运行时：后端不再手写固定 workflow，而是把 `load_task_context`、`search_knowledge`、`create_match`、`create_report` 封装成 Pi 可调用工具，由 Pi 决定调用顺序并返回最终总结。
2. Agent 默认使用独立配置目录 `~/.career-agent/pi-agent`，不会把其他项目目录当成自己的运行目录；如果独立目录缺少 `auth.json` 或 `models.json`，会优先从标准 Pi 目录 `~/.pi/agent` 复制缺失文件做一次兼容导入。若检测到 OpenClaw 主智能体目录 `~/.openclaw/agents/main/agent`，还会把其中的 `auth-profiles.json` 按 Pi `auth.json` 结构转换导入。后续运行仍以独立目录为准。如需自定义目录，可通过 `AGENT_PI_DIR`、`AGENT_SESSION_STORE_DIR` 覆盖；模型选择保存在该目录的 `career-agent-runtime.json`，不再写入 `.env`。
3. 当前职业报告生成已回到稳定可复现的模板链路，不再依赖独立聊天补全客户端。
4. 若只想让 Pi Agent 跑起来，推荐使用项目封装的 `npm run agent:auth -- login <provider>`。它会调用 Pi 支持的登录方式，把凭证写入 `~/.career-agent/pi-agent/auth.json`，并把当前运行模型写入 `career-agent-runtime.json`。也可以追加 `--model <provider/model>` 显式指定登录后使用的模型。
5. 常用切换命令：`npm run agent:auth -- list` 查看 Pi 支持的登录方式；`npm run agent:auth -- models codex` 搜索可用模型；`npm run agent:auth -- use openai-codex/gpt-5.4` 只切换当前运行模型；`npm run agent:auth -- status` 查看当前模型和已登录 provider。旧的 `npm run agent:auth:kimi` 仍保留，只用于把 Kimi/Moonshot API key 固化到项目独立 Agent 目录。
6. 当前代码已通过 `npm run type-check`、`npm run build:backend` 和 `createApp()` 级别验证；如需单独做 Agent 联通性检查，可运行 `npm run agent:smoke`。

## 协作规范

- 结构约束文档：[`docs/工程结构与协作规范.md`](./docs/工程结构与协作规范.md)
- 宪章：[`.specify/memory/constitution.md`](./.specify/memory/constitution.md)
- 贡献指南：[`AGENTS.md`](./AGENTS.md)
- 问题记录：[`docs/问题记录库.jsonl`](./docs/问题记录库.jsonl)
