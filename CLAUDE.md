# 仓库贡献指南

## 项目结构与模块组织

- `apps/frontend/`：前端应用（Vue 3 + TypeScript + Vite）。
  - 必须按 `src/app`、`src/features`、`src/shared` 分层。
- `apps/backend/`：后端应用（Node.js + Express + TypeScript）。
  - 必须按 `src/modules/<domain>` + `src/shared` 组织。
  - `src/modules/ai/` 放 AI 入口与 AI 子服务。
  - `src/modules/pi-tools/` 放 Pi 工具能力；AI 能力型工具可内聚 prompt、parser、generator。
- `packages/contracts/`：前后端共享契约（OpenAPI、共享类型），禁止前后端重复定义接口类型。
- `infra/`：基础设施编排文件（如 `docker-compose`）。
- `data/`：原始数据文件（如 `岗位数据.xls`）。
- `docs/`：项目文档与规范。
- `scripts/`：开发脚本（必须使用相对路径，禁止硬编码绝对路径）。
- `services/`：集成服务目录（如暂未启用，需在文档中标记为占位）。

## 强制结构约束（必须遵守）

1. 前端：

- `src/app` 只放应用装配（入口、路由、provider、全局样式）。
- `src/features/<feature>` 放业务功能，页面/状态/路由必须在 feature 内聚。
- `src/shared` 放跨 feature 复用能力（`api`、`ui`、`utils`）。
- 禁止在 `src/` 根目录直接堆放业务代码。

2. 后端：

- 每个业务域必须放在 `src/modules/<domain>/`。
- 每个 domain 至少包含：`*.route.ts`、`*.schemas.ts`、`*.service.ts`、`*.repository.ts`。
- 数据源实现必须通过适配器文件（如 `*.repository.json.ts`、未来 `*.repository.pg.ts`）注入。
- `route` 层禁止直接访问存储；必须经 `service -> repository`。
- 确定性业务接口采用 `route -> service -> pi-tools capability -> service -> repository`。
- 业务前后置、持久化、状态流转写在具体 `service`。
- prompt、模型调用、结果解析放在对应 `pi-tools/<domain>/` 能力目录。
- 不做本地假成功兜底；Pi/Agent 超时、报错或输出不合规必须失败。

3. 契约：

- OpenAPI 放在 `packages/contracts/openapi/`。
- 共享类型放在 `packages/contracts/types/`。
- 前后端接口字段变更必须先更新 contracts，再改实现。

详见：`docs/工程结构与协作规范.md`。

## 构建、测试与开发命令（统一从仓库根目录执行）

- 安装所有工作区依赖：`npm install`
- 启动前后端：`npm run dev`
- 仅启动后端：`npm run dev:backend`
- 仅启动前端：`npm run dev:frontend`
- 全量类型检查：`npm run type-check`
- 全量格式化：`npm run format`
- 格式检查（不落盘）：`npm run format:check`
- 全量构建：`npm run build`
- 可选 make 入口：`make dev`、`make type-check`、`make build`

## 代码风格与命名规范

- Vue/TypeScript 使用 2 空格缩进，采用 ES Module 与 `<script setup lang="ts">` 风格。
- 后端 TypeScript 使用 2 空格缩进，文件命名使用 `kebab-case`。
- 前端导入优先使用 `@/` 别名。
- 后端模块文件建议命名：`jobs.route.ts`、`jobs.service.ts`、`jobs.repository.ts`。
- 提交前至少执行 `npm run type-check`，保证前后端与 contracts 一致。
- 编码、审查、重构默认遵守 `$karpathy-guidelines`：先说明假设，保持简单，只做必要修改，给出可验证结果。

## 测试规范

- 前端测试放在 `apps/frontend/src/**/__tests__/`。
- 后端测试放在 `apps/backend/tests/` 或 `apps/backend/src/**/__tests__/`。
- 命名统一 `*.test.ts`。
- 在测试体系逐步完善前，`npm run type-check` + 本地可运行为最低合并门槛。
- 不需要验证手机端

## 提交与合并请求规范

- 统一使用 Conventional Commits：`feat:`、`fix:`、`docs:`、`refactor:`。
- 提交应小而聚焦，按模块注明范围，例如 `refactor(backend): 模块化 jobs 域`。
- PR 需包含：变更内容与原因、影响路径、必要截图/GIF、关联任务或 Issue。

## 安全与配置建议

- 不要提交密钥或凭证；本地配置放在 `.env`。
- 必须维护 `apps/backend/.env.example`、`apps/frontend/.env.example`。
- 配置读取必须集中管理并做校验（建议 zod），禁止业务代码到处直读 `process.env`。

Always use Context7 when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
