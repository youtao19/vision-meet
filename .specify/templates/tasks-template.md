---

description: "Task list template for feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: 可按需求补充，但 `npm run type-check` 为必选质量门禁。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无依赖）
- **[Story]**: 归属用户故事（US1/US2/US3）
- 任务描述必须包含准确文件路径

## Path Conventions

- 前端：`apps/frontend/src/app`、`apps/frontend/src/features`、`apps/frontend/src/shared`
- 后端：`apps/backend/src/modules/<domain>`、`apps/backend/src/shared`
- 契约：`packages/contracts/openapi`、`packages/contracts/types`
- 文档：`docs/问题记录库.jsonl`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 初始化本需求的结构与边界

- [ ] T001 校验需求目录结构并创建 `specs/[###-feature-name]/` 产物占位
- [ ] T002 明确本需求涉及的前端 feature 与后端 domain（含目标文件路径）
- [ ] T003 [P] 建立本需求的 contracts 变更草案（OpenAPI + types）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 为所有用户故事提供统一基础能力

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 完成 contracts 定稿：更新 `packages/contracts/openapi/*`
- [ ] T005 [P] 生成并校验共享类型：更新 `packages/contracts/types/*`
- [ ] T006 [P] 设计后端模块分层：`*.route.ts`、`*.schemas.ts`、`*.service.ts`、`*.repository.ts`、`*.repository.<adapter>.ts`
- [ ] T007 明确 repository 抽象与 adapter 注入方式，避免 service 依赖具体存储
- [ ] T008 完成错误响应结构基线（4xx/5xx）并与 contracts 对齐
- [ ] T009 若涉及环境变量，更新 `apps/backend/.env.example` 与 `apps/frontend/.env.example`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description]

**Independent Test**: [How to verify independently]

### Tests for User Story 1 (OPTIONAL)

- [ ] T010 [P] [US1] 补充/更新契约测试（若本故事涉及 API）
- [ ] T011 [P] [US1] 补充/更新集成测试（若规格要求）

### Implementation for User Story 1

- [ ] T012 [P] [US1] 前端实现（`apps/frontend/src/features/...`）
- [ ] T013 [P] [US1] 后端 schema 与 route 实现（`apps/backend/src/modules/<domain>/...`）
- [ ] T014 [US1] 后端 service 实现并通过 repository 抽象访问数据
- [ ] T015 [US1] JSON adapter 或其他 adapter 实现（如有必要）
- [ ] T016 [US1] 增补关键逻辑高质量中文注释
- [ ] T017 [US1] 校验请求参数/成功响应/错误响应与 contracts 一致

**Checkpoint**: User Story 1 is independently functional

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description]

**Independent Test**: [How to verify independently]

### Tests for User Story 2 (OPTIONAL)

- [ ] T018 [P] [US2] 契约/集成测试补充（按规格要求）

### Implementation for User Story 2

- [ ] T019 [P] [US2] 前端实现（`apps/frontend/src/features/...`）
- [ ] T020 [P] [US2] 后端 route/schemas/service/repository 实现
- [ ] T021 [US2] 对齐 contracts 与错误响应结构

**Checkpoint**: User Stories 1 and 2 are independently functional

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description]

**Independent Test**: [How to verify independently]

### Tests for User Story 3 (OPTIONAL)

- [ ] T022 [P] [US3] 契约/集成测试补充（按规格要求）

### Implementation for User Story 3

- [ ] T023 [P] [US3] 前端实现（`apps/frontend/src/features/...`）
- [ ] T024 [P] [US3] 后端分层实现（`apps/backend/src/modules/<domain>/...`）
- [ ] T025 [US3] 对齐 contracts 与渲染结果

**Checkpoint**: All user stories are independently functional

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: 跨故事收敛与发布前门禁

- [ ] TXXX [P] 文档更新（`docs/`）
- [ ] TXXX 运行 `npm run type-check` 并修复全部类型错误
- [ ] TXXX [P] 若为问题修复，更新 `docs/问题记录库.jsonl`
- [ ] TXXX 复核分层边界与 contracts-first 顺序
- [ ] TXXX 复核 `.env.example` 同步（如需求涉及环境变量）

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1): 无依赖
- Foundational (Phase 2): 依赖 Setup，且阻塞全部用户故事
- User Stories (Phase 3+): 依赖 Foundational 完成
- Polish (Final Phase): 依赖已选用户故事完成

### User Story Dependencies

- User Story 1 (P1): Foundational 后即可开始
- User Story 2 (P2): Foundational 后即可开始，可依赖 US1 结果但必须可独立验证
- User Story 3 (P3): Foundational 后即可开始，可依赖 US1/US2 结果但必须可独立验证

### Within Each User Story

- 先保证 contracts 与实现一致，再补齐调用与渲染
- route 不得绕过 service/repository 直接访问存储
- service 不得依赖具体 adapter
- 关键逻辑补充高质量中文注释
- 每个故事完成后可独立验收

### Parallel Opportunities

- 标记 [P] 的任务可并行
- Foundational 阶段可并行推进 contracts/types 与分层骨架
- Foundational 完成后，多个故事可并行开发

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1 + Phase 2
2. 完成 User Story 1
3. 执行 `npm run type-check`
4. 验证 US1 可独立演示

### Incremental Delivery

1. Foundation 完成后按 P1 -> P2 -> P3 迭代
2. 每完成一个故事即独立验收并对齐 contracts
3. 全量收敛时执行 type-check 与文档同步

### Parallel Team Strategy

1. 团队共同完成 Setup + Foundational
2. 按故事并行：A 负责 US1，B 负责 US2，C 负责 US3
3. 合流前统一执行 contracts diff 检查与 type-check

---

## Notes

- 所有实现文件必须使用 TypeScript
- 任务描述必须落到真实路径，避免模糊表述
- 若涉及存储演进，优先保持 service 层稳定
- 若涉及 bugfix，问题记录入库是必做项
