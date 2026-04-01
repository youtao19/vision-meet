# Implementation Plan: 学生画像与人岗匹配评分

**Branch**: `001-student-profile-matching` | **Date**: 2026-04-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-student-profile-matching/spec.md`

**Note**: This plan follows Career Agent constitution and enforces contracts-first delivery.

## Summary

本需求将补齐“学生画像 -> 人岗匹配 -> 结果解释/查询”的可交付链路，覆盖简历上传与手动录入
两种画像输入，并新增可复现的四维评分与结果持久化查询能力。技术路线采用 contracts-first：
先定义 OpenAPI 与共享类型，再实现后端 `route/schemas/service/repository/repository.adapter` 分层，
最后完成前端 `features/shared` 调用与页面渲染。

## Technical Context

**Language/Version**: TypeScript 5.x（Node.js 20+、Vue 3）  
**Primary Dependencies**: Express、multer、zod、Vue Router、Pinia、Fetch API  
**Storage**: 当前 JSON adapter（学生画像 + 匹配结果）；演进目标 PostgreSQL + pgvector + Neo4j  
**Testing**: 以 `npm run type-check` 为最低门槛，辅以后端接口 smoke test 与前端流程手工验收  
**Target Platform**: Web（frontend + backend）  
**Project Type**: Monorepo Web Application  
**Performance Goals**: 匹配详情查询 P95 ≤ 2 秒；用户完整流程（输入到看到结果）≤ 5 分钟  
**Constraints**: 契约优先、分层边界、TypeScript-only、高质量中文注释、结果可复现（同输入同输出）  
**Scale/Scope**: 单次分析为“单学生画像 + 单岗位画像”；支持结果列表分页查询（`limit <= 100`）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] C1. Monorepo 形态保持不变，不拆分前后端独立仓库。
- [x] C2. 前端变更仅落在 `apps/frontend`，并遵循 `app/features/shared` 分层。
- [x] C3. 后端变更仅落在 `apps/backend`，并遵循
      `route/schemas/service/repository/repository.adapter` 分层。
- [x] C4. 接口变更按 contracts-first：先改 `packages/contracts/openapi` 与
      `packages/contracts/types`，再改后端和前端。
- [x] C5. `service` 层不依赖具体存储实现，仅通过 `repository` 抽象访问数据。
- [x] C6. 数据层演进方案明确：后续迁移聚焦 adapter，保持 `service` 层稳定。
- [x] C7. 已确认流程顺序为 `spec -> plan -> tasks -> implementation`。
- [x] C8. 本计划已明确请求参数、成功响应、错误响应结构（见 `contracts/`）。
- [x] C9. 实施范围全部使用 TypeScript，并要求关键逻辑补充高质量中文注释。
- [x] C10. 本需求为新功能非问题修复，不触发 `docs/问题记录库.jsonl` 必填门禁。
- [x] C11. `npm run type-check` 作为合并前必过门禁。
- [x] C12. 当前方案不新增环境变量；若实现阶段新增变量，必须同步更新两端 `.env.example`。

## Project Structure

### Documentation (this feature)

```text
specs/001-student-profile-matching/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── student-matching.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
apps/
├── frontend/
│   └── src/
│       ├── app/
│       ├── features/
│       │   ├── profile/
│       │   └── matching/
│       └── shared/
│           └── api/
└── backend/
    └── src/
        ├── modules/
        │   ├── profile/
        │   │   ├── profile.route.ts
        │   │   ├── profile.schemas.ts
        │   │   ├── profile.service.ts
        │   │   ├── profile.repository.ts
        │   │   └── profile.repository.json.ts
        │   └── matching/
        │       ├── matching.route.ts
        │       ├── matching.schemas.ts
        │       ├── matching.service.ts
        │       ├── matching.repository.ts
        │       └── matching.repository.json.ts
        └── shared/

packages/
└── contracts/
    ├── openapi/
    │   └── career-agent.openapi.yaml
    └── types/
        └── index.ts
```

**Structure Decision**: 不引入越层实现，不新增非标准目录；所有改动严格落在现有分层。

## Phase 0: Research Output

研究结论见 [research.md](./research.md)，已完成以下关键决策：

1. 简历上传接口采用 multipart/form-data，统一进入学生画像创建流程。
2. 匹配计算采用确定性规则引擎 + 输入指纹，保证结果可复现。
3. 新增独立 `matching` 领域模块，避免将匹配存储耦合到 `profile` 仓储。
4. 统一错误响应结构（4xx/5xx）以支持前端稳定渲染。
5. 当前阶段使用 JSON adapter，迁移到 PostgreSQL/pgvector/Neo4j 时保持 service 接口稳定。

## Phase 1: Design & Contracts

### Data Model

- 输出文件：[data-model.md](./data-model.md)
- 覆盖实体：`StudentProfile`、`JobProfileSnapshot`、`MatchResult`、`MatchExplanationItem`
- 明确校验规则、唯一性约束、状态与可复现字段。

### Interface Contracts

- 输出文件：[contracts/student-matching.openapi.yaml](./contracts/student-matching.openapi.yaml)
- 契约覆盖接口：
  - `POST /api/v1/profile/resume`
  - `POST /api/v1/matches`
  - `GET /api/v1/matches`
  - `GET /api/v1/matches/{match_id}`
- 实施时先同步到 `packages/contracts/openapi/career-agent.openapi.yaml` 与
  `packages/contracts/types/index.ts`。

### Developer Quickstart

- 输出文件：[quickstart.md](./quickstart.md)
- 提供 contracts-first 执行顺序、验收命令、接口调试样例。

### Agent Context Update

- 执行命令：`.specify/scripts/bash/update-agent-context.sh codex`
- 目的：同步当前计划技术上下文到代理指引文件。

## Phase 2: Implementation Strategy (for `/speckit.tasks`)

1. **Contracts**: 先更新 OpenAPI 与共享类型，定义请求/响应/错误。
2. **Backend-Profile**: 完成简历上传入口与画像生成复用逻辑。
3. **Backend-Matching**: 新增 matching 模块，完成评分、解释、存储、查询。
4. **Frontend**: 增加岗位选择、发起匹配、列表与详情渲染；封装 `shared/api/matching.ts`。
5. **Validation**: 执行 type-check、关键 API smoke test、主流程人工验收。

## Post-Design Constitution Check

- [x] Contracts-first 执行顺序已明确并落到可交付文件。
- [x] 后端严格采用 `route/schemas/service/repository/repository.adapter` 分层设计。
- [x] 前端改动限定于 `features` + `shared/api`，不在 `app` 层堆业务逻辑。
- [x] 可复现性通过 `scoring_version + input_fingerprint` 设计保证。
- [x] 质量门禁固定为 `npm run type-check`。

## Complexity Tracking

> Constitution violations: none

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
