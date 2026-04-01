<!--
Sync Impact Report
- Version change: N/A (template) → 1.0.0
- Modified principles:
  - 模板原则槽位 1 → I. Monorepo 单仓约束
  - 模板原则槽位 2 → II. 前端目录与分层约束
  - 模板原则槽位 3 → III. 后端目录与分层约束
  - 模板原则槽位 4 → IV. 契约优先变更流程
  - 模板原则槽位 5 → V. Repository 抽象与适配器隔离
- Added principles:
  - VI. 数据层演进稳定性
  - VII. Spec/Plan/Tasks 先行
  - VIII. 接口输入输出与错误显式化
  - IX. TypeScript 与高质量中文注释
  - X. 问题修复记录沉淀
  - XI. 类型检查质量门槛
  - XII. 环境变量示例同步
- Added sections:
  - 工程边界与实施约束
  - 交付流程与质量门禁
- Removed sections:
  - 无
- Templates requiring updates:
  - ✅ updated: .specify/templates/plan-template.md
  - ✅ updated: .specify/templates/spec-template.md
  - ✅ updated: .specify/templates/tasks-template.md
  - ⚠ pending: .specify/templates/commands/*.md（目录当前不存在，后续启用命令模板时补齐）
  - ✅ updated: README.md
- Follow-up TODOs:
  - 无
-->
# Career Agent Constitution

## Core Principles

### I. Monorepo 单仓约束
项目 MUST 保持单一 Monorepo 形态，前后端与共享契约在同一仓库协同演进；
不得拆分为独立前端仓库或独立后端仓库。该约束用于保证变更可追溯、评审
上下文完整，并降低跨仓协作成本。

### II. 前端目录与分层约束
前端代码 MUST 仅位于 `apps/frontend`。业务实现 MUST 遵循
`src/app`、`src/features`、`src/shared` 分层：应用装配只在 `app`，
业务能力内聚在 `features`，跨特性复用下沉到 `shared`。
该规则用于抑制目录漂移与跨特性耦合。

### III. 后端目录与分层约束
后端代码 MUST 仅位于 `apps/backend`，并按领域模块组织在
`src/modules/<domain>`。每个领域 MUST 至少包含
`route`、`schemas`、`service`、`repository`、`repository.adapter`
对应文件。`route` 层 MUST NOT 直接访问存储；调用链 MUST 为
`route -> service -> repository`。该约束确保职责清晰与可替换性。

### IV. 契约优先变更流程
任何接口字段、请求参数、响应结构、错误响应变更 MUST 先更新
`packages/contracts/openapi` 与 `packages/contracts/types`，
再更新后端实现，最后更新前端调用与渲染。违反顺序的实现视为不合规。
该流程用于避免前后端接口漂移和隐式破坏。

### V. Repository 抽象与适配器隔离
当前允许使用 JSON adapter 快速交付，但 `service` 层 MUST 仅依赖
`repository` 抽象，不得依赖具体存储实现。具体存储 MUST 通过
`repository.adapter` 注入。该原则确保存储层可演进且业务层稳定。

### VI. 数据层演进稳定性
数据层目标架构为 PostgreSQL + pgvector + Neo4j。后续迁移 MUST
优先保持 `service` 层接口与业务语义稳定，迁移工作应聚焦于
`repository.adapter` 与数据迁移脚本，不得把存储切换成本扩散到业务流程。

### VII. Spec/Plan/Tasks 先行
所有新功能 MUST 先生成并评审 `spec`、`plan`、`tasks`，再进入实现。
未完成三类文档的开发任务不得开始编码。该门禁用于在实现前显式化需求、
约束与执行路径，降低返工概率。

### VIII. 接口输入输出与错误显式化
所有 API 设计与实现 MUST 明确请求参数、成功响应结构、错误响应结构。
错误响应 MUST 可区分客户端错误与服务端错误，并在契约与实现中保持一致。
该原则用于提升可测试性、可观测性与前后端联调效率。

### IX. TypeScript 与高质量中文注释
项目代码 MUST 使用 TypeScript。对公共接口、关键业务流程、复杂逻辑、
副作用逻辑 MUST 提供高质量中文注释，说明“做什么、为什么、边界与风险”。
禁止无信息量注释与仅复述代码字面含义。

### X. 问题修复记录沉淀
每次问题修复完成后 MUST 更新 `docs/问题记录库.jsonl`，至少包含
`id`、`occurred_at`、`module`、`symptom`、`root_cause`、
`resolution_steps`、`conclusion`、`tags`。该规则用于沉淀可检索经验，
减少重复故障。

### XI. 类型检查质量门槛
最低质量门槛为 `npm run type-check` 通过。未通过类型检查的变更
不得合入主线。该门槛用于保证跨工作区契约与实现一致性。

### XII. 环境变量示例同步
当新增或修改环境变量时，MUST 同步维护
`apps/backend/.env.example` 与 `apps/frontend/.env.example`，
并保证字段含义、默认值说明与实际读取逻辑一致。

## 工程边界与实施约束

1. 目录边界：仅在 `apps/frontend`、`apps/backend`、`packages/contracts`
   的职责范围内实施功能；跨边界改动必须在 `plan` 明确说明原因与影响。
2. 分层边界：前端禁止在 `app` 层编写业务逻辑；后端禁止绕过 `service`
   或 `repository` 直接耦合存储。
3. 契约边界：所有接口变更必须有对应 contracts 变更，且能追溯到同一需求上下文。
4. 演进边界：存储技术升级时优先保持 `service` 层 API 稳定，避免上层连锁改动。

## 交付流程与质量门禁

1. 交付顺序 MUST 为：`spec` -> `plan` -> `tasks` -> `implementation`。
2. 涉及 API 的需求在 `spec` 与 `plan` 中 MUST 写明请求、响应、错误结构。
3. 任务拆解 MUST 体现 contracts-first 顺序，并显式包含类型检查任务。
4. 涉及环境变量的需求 MUST 包含 `.env.example` 同步任务。
5. 问题修复型任务 MUST 包含 `docs/问题记录库.jsonl` 更新任务。

## Governance

1. 本宪章高于仓库内其他过程性约定；如文档冲突，以本宪章为准并触发文档修订。
2. 修订流程：提出变更动机与影响分析 -> 更新宪章草案 -> 同步模板与运行文档 ->
   通过评审后生效。
3. 版本策略：
   - MAJOR：删除或重定义原则，导致治理语义不兼容；
   - MINOR：新增原则或新增强制章节；
   - PATCH：措辞澄清、示例优化、非语义调整。
4. 合规检查：`plan` 阶段与合并前评审 MUST 执行 Constitution Check；
   不满足门禁的变更不得进入实现或合并。

**Version**: 1.0.0 | **Ratified**: 2026-04-02 | **Last Amended**: 2026-04-02
