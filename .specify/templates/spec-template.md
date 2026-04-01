# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`  
**Created**: [DATE]  
**Status**: Draft  
**Input**: User description: "$ARGUMENTS"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently and delivers concrete value]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST [specific capability]
- **FR-002**: System MUST [specific capability]
- **FR-003**: Users MUST be able to [key interaction]
- **FR-004**: System MUST [data requirement]
- **FR-005**: System MUST [behavior]

### API Contract Requirements *(mandatory when API is involved)*

- **AC-001**: MUST 明确每个接口的 Path/Query/Header/Body 参数，包含字段名、类型、是否必填、约束与示例。
- **AC-002**: MUST 明确成功响应结构，包含状态码、字段定义、示例。
- **AC-003**: MUST 明确错误响应结构，至少区分 4xx 与 5xx，包含错误码/错误信息/可选追踪字段。
- **AC-004**: MUST 在 `packages/contracts/openapi` 与 `packages/contracts/types` 完成变更后，
  再进入后端和前端实现。

### Implementation Constraints *(mandatory)*

- **IC-001**: 变更 MUST 保持 Monorepo 结构，不拆分仓库。
- **IC-002**: 前端代码 MUST 放在 `apps/frontend` 并遵循 `app/features/shared` 分层。
- **IC-003**: 后端代码 MUST 放在 `apps/backend` 并遵循
  `route/schemas/service/repository/repository.adapter` 分层。
- **IC-004**: `service` 层 MUST 通过 `repository` 抽象访问数据，不直接依赖具体存储。
- **IC-005**: 实现 MUST 使用 TypeScript，关键逻辑需补充高质量中文注释。

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes]
- **[Entity 2]**: [What it represents, relationships]

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: [Measurable metric tied to user value]
- **SC-002**: [Measurable metric tied to performance/reliability]
- **SC-003**: [Measurable usability/adoption metric]
- **SC-004**: `npm run type-check` 在本需求交付分支上 MUST 通过。

## Assumptions

- [Assumption about target users]
- [Assumption about scope boundaries]
- [Assumption about data/environment]
- [Dependency on existing system/service]
