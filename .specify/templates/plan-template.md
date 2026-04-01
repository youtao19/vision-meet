# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command.

## Summary

[Extract from feature spec: primary requirement + technical approach]

## Technical Context

**Language/Version**: TypeScript 5.x（Node.js 20+、Vue 3）  
**Primary Dependencies**: Express、Vue Router、Pinia、zod（按实际补充）  
**Storage**: 当前 JSON adapter；演进目标 PostgreSQL + pgvector + Neo4j  
**Testing**: 按项目现状补充（最低门槛必须通过 `npm run type-check`）  
**Target Platform**: Web（frontend + backend）  
**Project Type**: Monorepo Web Application  
**Performance Goals**: [NEEDS CLARIFICATION]  
**Constraints**: 契约优先、分层边界、TypeScript-only、高质量中文注释  
**Scale/Scope**: [NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [ ] C1. Monorepo 形态保持不变，不拆分前后端独立仓库。
- [ ] C2. 前端变更仅落在 `apps/frontend`，并遵循 `app/features/shared` 分层。
- [ ] C3. 后端变更仅落在 `apps/backend`，并遵循
      `route/schemas/service/repository/repository.adapter` 分层。
- [ ] C4. 若存在接口变更，已先更新 `packages/contracts/openapi` 与
      `packages/contracts/types`，再安排后端和前端实现。
- [ ] C5. `service` 层不依赖具体存储实现，仅通过 `repository` 抽象访问数据。
- [ ] C6. 若涉及数据层演进，明确保持 `service` 层稳定的迁移策略。
- [ ] C7. 已确认流程顺序为 `spec -> plan -> tasks -> implementation`。
- [ ] C8. 已在设计中明确请求参数、成功响应、错误响应结构。
- [ ] C9. 方案全部使用 TypeScript，并规划关键逻辑高质量中文注释。
- [ ] C10. 若为问题修复，任务中包含 `docs/问题记录库.jsonl` 更新。
- [ ] C11. 明确将 `npm run type-check` 作为合并前必过门禁。
- [ ] C12. 若有环境变量变更，包含
      `apps/backend/.env.example` 与 `apps/frontend/.env.example` 同步计划。

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
apps/
├── frontend/
│   └── src/
│       ├── app/
│       ├── features/
│       └── shared/
└── backend/
    └── src/
        ├── modules/
        │   └── <domain>/
        │       ├── *.route.ts
        │       ├── *.schemas.ts
        │       ├── *.service.ts
        │       ├── *.repository.ts
        │       └── *.repository.<adapter>.ts
        └── shared/

packages/
└── contracts/
    ├── openapi/
    └── types/

docs/
└── 问题记录库.jsonl
```

**Structure Decision**: 所有实现必须落在上述固定结构；若需偏离，必须在本节说明原因与范围。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 临时跨层调用] | [当前必要性] | [为何不能按标准分层实现] |
| [e.g., 非标准目录落盘] | [当前必要性] | [为何不能放入既有结构] |
