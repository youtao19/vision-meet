# Tasks: 学生画像与人岗匹配评分

**Input**: Design documents from `/specs/001-student-profile-matching/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: 本需求未强制 TDD；以接口 smoke + `npm run type-check` 作为验收门禁。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无依赖）
- **[Story]**: 归属用户故事（US1/US2/US3）
- 每条任务都包含明确文件路径

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 初始化本需求涉及的前后端分层骨架与落点

- [X] T001 创建匹配领域分层骨架文件：`apps/backend/src/modules/matching/matching.module.ts`、`apps/backend/src/modules/matching/matching.route.ts`、`apps/backend/src/modules/matching/matching.schemas.ts`、`apps/backend/src/modules/matching/matching.service.ts`、`apps/backend/src/modules/matching/matching.repository.ts`、`apps/backend/src/modules/matching/matching.repository.json.ts`
- [X] T002 [P] 创建前端匹配功能骨架：`apps/frontend/src/features/matching/routes.ts`、`apps/frontend/src/features/matching/pages/MatchingPage.vue`
- [X] T003 [P] 创建前端匹配 API 骨架：`apps/frontend/src/shared/api/matching.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 先完成 contracts-first 与跨故事共用能力

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 更新 OpenAPI 主契约，合并匹配相关接口定义到 `packages/contracts/openapi/career-agent.openapi.yaml`
- [X] T005 [P] 更新共享类型定义到 `packages/contracts/types/index.ts`（新增匹配请求/响应、差距项、解释条目、结构化错误类型）
- [X] T006 [P] 统一后端错误响应结构与 trace 字段输出，修改 `apps/backend/src/app.ts`
- [X] T007 增加匹配结果存储配置读取，修改 `apps/backend/src/shared/config/env.ts`
- [X] T008 [P] 同步环境变量示例，更新 `apps/backend/.env.example` 与 `apps/frontend/.env.example`
- [X] T009 新增可复现指纹工具函数，创建 `apps/backend/src/shared/utils/match-fingerprint.ts`
- [X] T010 在应用装配层注册 matching 模块路由，修改 `apps/backend/src/app.ts`
- [X] T011 确认 repository 抽象边界（service 禁止依赖 adapter），完善 `apps/backend/src/modules/matching/matching.repository.ts` 与 `apps/backend/src/modules/profile/profile.repository.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - 生成学生画像并完成单岗位匹配 (Priority: P1) 🎯 MVP

**Goal**: 支持简历上传/手动录入生成学生画像，并完成单岗位四维评分与结果解释

**Independent Test**: 使用一份简历文件或手动录入创建画像后，调用匹配创建接口，返回四维分数、总分、差距项与建议

### Implementation for User Story 1

- [X] T012 [P] [US1] 扩展画像请求校验（新增简历上传相关字段与约束），修改 `apps/backend/src/modules/profile/profile.schemas.ts`
- [X] T013 [US1] 实现简历上传入口与参数校验，修改 `apps/backend/src/modules/profile/profile.route.ts`
- [X] T014 [US1] 实现简历解析到画像输入的业务逻辑，修改 `apps/backend/src/modules/profile/profile.service.ts`
- [X] T015 [US1] 扩展画像仓储持久化字段（`source_type`、`source_digest`），修改 `apps/backend/src/modules/profile/profile.repository.ts` 与 `apps/backend/src/modules/profile/profile.repository.json.ts`
- [X] T016 [P] [US1] 实现匹配创建请求校验与路由入口，修改 `apps/backend/src/modules/matching/matching.schemas.ts` 与 `apps/backend/src/modules/matching/matching.route.ts`
- [X] T017 [US1] 实现四维评分、差距项与建议生成逻辑，修改 `apps/backend/src/modules/matching/matching.service.ts`
- [X] T018 [US1] 实现匹配结果仓储写入与读取（JSON adapter），修改 `apps/backend/src/modules/matching/matching.repository.json.ts`
- [X] T019 [US1] 完成 matching 模块装配与依赖注入，修改 `apps/backend/src/modules/matching/matching.module.ts`
- [X] T020 [P] [US1] 前端实现画像创建与发起匹配主流程，修改 `apps/frontend/src/features/profile/pages/ProfilePage.vue` 与 `apps/frontend/src/features/matching/pages/MatchingPage.vue`
- [X] T021 [US1] 对齐前端 API 客户端与错误提示渲染，修改 `apps/frontend/src/shared/api/profile.ts` 与 `apps/frontend/src/shared/api/matching.ts`
- [X] T022 [US1] 为 US1 关键算法与边界处理补充高质量中文注释，修改 `apps/backend/src/modules/profile/profile.service.ts` 与 `apps/backend/src/modules/matching/matching.service.ts`

**Checkpoint**: User Story 1 is independently functional

---

## Phase 4: User Story 2 - 查询匹配结果列表与详情 (Priority: P2)

**Goal**: 支持按学生/岗位查询匹配结果列表，并查看单条详情解释

**Independent Test**: 预置多条匹配记录后，列表可按条件查询且详情返回与创建时一致的数据

### Implementation for User Story 2

- [X] T023 [P] [US2] 实现匹配列表与详情请求参数校验，修改 `apps/backend/src/modules/matching/matching.schemas.ts`
- [X] T024 [US2] 实现匹配列表与详情路由处理，修改 `apps/backend/src/modules/matching/matching.route.ts`
- [X] T025 [US2] 实现匹配列表/详情服务方法（含 not found 映射），修改 `apps/backend/src/modules/matching/matching.service.ts`
- [X] T026 [US2] 实现仓储分页过滤与按 ID 查询，修改 `apps/backend/src/modules/matching/matching.repository.ts` 与 `apps/backend/src/modules/matching/matching.repository.json.ts`
- [X] T027 [P] [US2] 前端实现匹配列表与详情展示，修改 `apps/frontend/src/features/matching/pages/MatchingPage.vue`
- [X] T028 [US2] 前端补充列表/详情 API 调用并处理结构化错误，修改 `apps/frontend/src/shared/api/matching.ts`
- [X] T029 [US2] 注册匹配页面路由并接入总路由，修改 `apps/frontend/src/features/matching/routes.ts` 与 `apps/frontend/src/features/routes.ts`

**Checkpoint**: User Stories 1 and 2 are independently functional

---

## Phase 5: User Story 3 - 匹配结果可复现并可被报告模块复用 (Priority: P3)

**Goal**: 确保同输入同输出，并沉淀可供报告模块消费的稳定结果结构

**Independent Test**: 对同一画像与岗位重复发起匹配，返回一致分值且 `from_cache` 标记正确；报告侧可按 `match_id` 读取完整结果

### Implementation for User Story 3

- [X] T030 [US3] 实现 `input_fingerprint + scoring_version` 复现判定策略，修改 `apps/backend/src/modules/matching/matching.service.ts`
- [X] T031 [US3] 实现重复请求缓存命中返回与 `from_cache` 语义，修改 `apps/backend/src/modules/matching/matching.repository.json.ts` 与 `apps/backend/src/modules/matching/matching.service.ts`
- [X] T032 [P] [US3] 稳定解释输出顺序与建议生成规则，修改 `apps/backend/src/modules/matching/matching.service.ts`
- [X] T033 [P] [US3] 前端实现“重复分析”与结果一致性提示，修改 `apps/frontend/src/features/matching/pages/MatchingPage.vue`
- [X] T034 [US3] 校准报告复用字段映射（match_id、四维分数、差距项、建议）并对齐 API 类型，修改 `packages/contracts/types/index.ts` 与 `apps/frontend/src/shared/api/matching.ts`

**Checkpoint**: All user stories are independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 跨故事收敛与发布前门禁

- [X] T035 [P] 更新后端 API 描述文档与说明，修改 `README.md`
- [X] T036 [P] 复核 contracts-first 顺序与分层边界，更新 `specs/001-student-profile-matching/quickstart.md`
- [X] T037 执行并通过类型检查，运行 `npm run type-check`
- [X] T038 [P] 执行手工 smoke 验收并记录命令结果，更新 `specs/001-student-profile-matching/quickstart.md`
- [X] T039 复核环境变量示例同步状态，检查并必要时修改 `apps/backend/.env.example` 与 `apps/frontend/.env.example`

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1): 无依赖
- Foundational (Phase 2): 依赖 Setup，且阻塞全部用户故事
- User Stories (Phase 3+): 依赖 Foundational 完成
- Polish (Phase 6): 依赖已选用户故事完成

### User Story Dependencies

- User Story 1 (P1): Foundational 后即可开始，是 MVP 主链路
- User Story 2 (P2): 依赖 US1 产生的匹配数据结构，但可独立验收查询能力
- User Story 3 (P3): 依赖 US1/US2 的匹配能力，聚焦复现性与报告复用

### Within Each User Story

- 先实现后端 `schemas -> route -> service -> repository` 协作，再接入前端调用与渲染
- route 不得直接访问存储；service 仅依赖 repository 抽象
- 实现与 contracts 保持一致，错误响应遵循统一结构
- 每个故事完成后执行独立验收

### Parallel Opportunities

- **US1**: `T012` 与 `T016` 可并行；`T020` 可在后端接口稳定后并行推进
- **US2**: `T023` 与 `T027` 可并行；`T028` 可与 `T025` 后段并行
- **US3**: `T032` 与 `T033` 可并行
- **Polish**: `T035`、`T036`、`T038` 可并行

---

## Parallel Execution Examples

### User Story 1

```bash
# 并行启动（不同文件）
Task: T012 -> apps/backend/src/modules/profile/profile.schemas.ts
Task: T016 -> apps/backend/src/modules/matching/matching.schemas.ts
Task: T020 -> apps/frontend/src/features/profile/pages/ProfilePage.vue
```

### User Story 2

```bash
# 并行启动（后端查询契约 + 前端展示）
Task: T023 -> apps/backend/src/modules/matching/matching.schemas.ts
Task: T027 -> apps/frontend/src/features/matching/pages/MatchingPage.vue
```

### User Story 3

```bash
# 并行启动（后端稳定性 + 前端交互）
Task: T032 -> apps/backend/src/modules/matching/matching.service.ts
Task: T033 -> apps/frontend/src/features/matching/pages/MatchingPage.vue
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1 + Phase 2
2. 完成 US1（T012-T022）
3. 执行 `npm run type-check`
4. 验证“创建画像 -> 发起匹配 -> 查看结果”可独立演示

### Incremental Delivery

1. Foundation 完成后按 US1 -> US2 -> US3 迭代
2. 每完成一个故事即做独立验收与 contracts 对齐
3. 在 Polish 阶段执行统一门禁与文档收敛

### Parallel Team Strategy

1. 全员先完成 Setup + Foundational
2. A 负责 US1 后端链路，B 负责 US2 查询链路，C 负责 US1/US2 前端页面
3. US3 由后端与前端协同收敛复现逻辑与交互

---

## Notes

- 所有实现文件必须使用 TypeScript
- 任务描述已落到真实文件路径，可直接执行
- 若实施中新增环境变量，必须同步更新两端 `.env.example`
- 本需求为新功能，不强制更新 `docs/问题记录库.jsonl`
