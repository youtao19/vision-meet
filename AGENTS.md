# 仓库贡献指南

## 项目结构与模块组织

- `apps/frontend/`：前端应用（Vue 3 + TypeScript + Vite）。
  - 必须按 `src/app`、`src/features`、`src/shared` 分层。
- `apps/backend/`：后端应用（Node.js + Express + TypeScript）。
  - 必须按 `src/modules/<domain>` + `src/shared` 组织。
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

## 测试规范

- 前端测试放在 `apps/frontend/src/**/__tests__/`。
- 后端测试放在 `apps/backend/tests/` 或 `apps/backend/src/**/__tests__/`。
- 命名统一 `*.test.ts`。
- 在测试体系逐步完善前，`npm run type-check` + 本地可运行为最低合并门槛。

## 提交与合并请求规范

- 统一使用 Conventional Commits：`feat:`、`fix:`、`docs:`、`refactor:`。
- 提交应小而聚焦，按模块注明范围，例如 `refactor(backend): 模块化 jobs 域`。
- PR 需包含：变更内容与原因、影响路径、必要截图/GIF、关联任务或 Issue。

## 安全与配置建议

- 不要提交密钥或凭证；本地配置放在 `.env`。
- 必须维护 `apps/backend/.env.example`、`apps/frontend/.env.example`。
- 配置读取必须集中管理并做校验（建议 zod），禁止业务代码到处直读 `process.env`。

## 问题复盘与沉淀

- 每次问题修复完成后，必须追加结构化记录到 `docs/问题记录库.jsonl`。
- 字段至少包含：`id`、`occurred_at`、`module`、`symptom`、`root_cause`、`resolution_steps`、`conclusion`、`tags`。
- 记录规范与示例见 `docs/问题记录规范.md`。

## 进度同步

- 每次实现一个需求之后，需要同步修改进度文件`实现跟踪.md`.

## 高质量中文注释规范（默认生效）

- 从现在开始，生成代码默认遵循“高质量中文注释”规范；除非明确说明“这次不要注释”。

### 总目标

注释不是翻译代码，而是帮助快速理解：

1. 这段代码在做什么。
2. 为什么这样设计。
3. 关键逻辑与业务规则。
4. 哪些地方容易出错。
5. 后续改动应该优先看哪里。

### 总规则

1. 代码必须可直接运行，不能为了注释牺牲正确性、性能和可维护性。
2. 注释必须使用中文，简洁、准确、有信息量。
3. 不写“变量定义/这里判断”这类低信息注释。
4. 能靠命名看懂的内容，不重复写注释。
5. 注释重点写：设计意图、边界条件、异常分支、易错点、取舍原因。
6. 命名优先清晰（变量/函数/类），先提升代码自解释性，再补注释。
7. 对初学者不易理解的写法（如闭包、泛型约束、并发/异步细节、框架机制）要额外解释。
8. 复杂流程先给“整体思路”，再给代码。
9. 注释密度按复杂度调整：简单逻辑少注释，复杂逻辑详细注释。

### 文件级要求

1. 文件开头写“文件作用说明”。
2. 说明该文件在项目中的职责。
3. 如与其他模块有关键依赖，简要说明依赖关系与边界。

### 函数级要求（优化版）

以下函数必须写函数注释（写在函数上方）：

- 对外暴露的公共接口函数。
- 业务关键函数。
- 有副作用函数（I/O、数据库、网络、状态修改、权限判断等）。
- 逻辑复杂或不直观的函数。

函数注释至少包含：

1. 函数作用。
2. 参数含义。
3. 返回值含义。
4. 重要注意点（边界、异常、性能、幂等性等）。

明显简单、无副作用、语义直白的小函数可省略函数注释。

### 类级要求

1. 每个类上方说明类职责与使用场景。
2. 若有核心状态/关键属性，说明其含义、生命周期和约束。

### 代码块要求

1. 关键代码块上方写块注释；行内注释仅用于特别关键的一行。
2. 以下内容优先注释：框架配置、数据库操作、异步流程、权限校验、参数校验、异常处理、状态流转、业务规则判断。

### 禁止事项

1. 禁止无信息量伪注释。
2. 禁止为“看起来详细”而重复代码字面意思。
3. 禁止只给代码不解释关键流程（复杂改动场景）。
4. 禁止省略关键逻辑注释。

## Active Technologies

- TypeScript 5.x（Node.js 20+、Vue 3） + Express、multer、zod、Vue Router、Pinia、Fetch API (001-student-profile-matching)
- 当前 JSON adapter（学生画像 + 匹配结果）；演进目标 PostgreSQL + pgvector + Neo4j (001-student-profile-matching)

## Recent Changes

- 001-student-profile-matching: Added TypeScript 5.x（Node.js 20+、Vue 3） + Express、multer、zod、Vue Router、Pinia、Fetch API

Always use Context7 when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
