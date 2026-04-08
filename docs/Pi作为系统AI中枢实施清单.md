# Pi 作为系统 AI 中枢实施清单

创建日期：2026-04-04  
适用范围：`/Users/peach/develop/career-agent`

## 1. 文档目标

本文件用于把“将 Pi Coding Agent 作为 Career Agent 系统统一 AI 中枢”拆解为可实施、可验收、可追踪的过程清单，避免后续工作停留在概念讨论层。

本清单重点覆盖以下内容：

- 统一架构边界，明确 Pi 在系统中的职责。
- 拆分后端模块、工具层、会话层、配置层和可观测层的落地步骤。
- 约束与现有后端模块组织方式保持一致，避免出现临时脚本式接入。
- 为后续实现、联调、验收与演示提供统一执行顺序。

## 2. 目标定义

目标不是把终端里的 `pi` 命令直接嵌入产品，而是把 `@mariozechner/pi-coding-agent` 作为后端内部的 Agent Runtime，承接系统中所有“需要多步推理、工具调用、上下文编排”的 AI 任务。

最终目标形态如下：

1. 前端与其他后端模块不直接调用模型 SDK。
2. 统一由 `apps/backend/src/modules/ai` 暴露 AI 能力入口。
3. `ai` 模块内部基于 Pi SDK 维护 Agent 会话、工具注册、模型选择与运行策略。
4. 业务域通过受控工具向 Agent 暴露能力，而不是让 Agent 直接访问数据库或散落调用 service。
5. 所有 AI 请求都具备可审计的输入、工具轨迹、输出和失败原因。

## 3. 目标架构

```text
前端 / 业务 API
    ↓
apps/backend/src/modules/ai/ai.route.ts
    ↓
apps/backend/src/modules/ai/ai.service.ts
    ↓
apps/backend/src/modules/ai/runtime/*
    ├─ Pi Agent Session Runtime
    ├─ System Prompt / Resource Loader
    ├─ Session Manager / Settings Manager
    └─ Model Registry / Auth Storage
    ↓
apps/backend/src/modules/ai/tools/*
    ↓
既有业务模块 service（profile / matching / report / knowledge / jobs / career-path）
    ↓
repository / adapter / PostgreSQL / pgvector / Neo4j
```

## 4. 实施原则

1. 统一入口：所有业务 AI 能力统一从 `ai` 模块进入，不再散落在各业务模块中直接拼 prompt。
2. 工具隔离：Agent 只能调用显式注册的业务工具，默认不开放 `bash`、`edit`、`write`。
3. 契约优先：对外暴露的 AI API 先收敛 contracts，再实现 route/service。
4. 会话可控：区分“单次任务型会话”和“多轮对话型会话”，避免状态污染。
5. 结果可审计：记录请求、模型、工具调用顺序、关键证据、失败原因。
6. 降级清晰：模型失败、检索失败、工具失败时必须有明确失败返回或受控降级，不允许静默吞错。

## 5. 任务拆分

## 阶段 A：架构收口与边界确认

目标：把“AI 中枢”从概念变成明确模块边界。

1. 新增 `apps/backend/src/modules/ai` 领域模块。
2. 明确 `ai.route.ts`、`ai.schemas.ts`、`ai.service.ts`、`ai.repository.ts` 的职责边界。
3. 确定 `ai` 模块只做编排，不直接承载画像、匹配、报告等业务细节。
4. 梳理现有直接或间接使用 Agent/LLM 的入口，形成迁移清单。
5. 明确哪些能力必须走 Agent，哪些简单能力可继续保留为普通 service 逻辑。

交付物：

- `ai` 模块目录骨架。
- 一份现有 AI 调用入口迁移清单。
- 一份 Agent 与各业务域的依赖边界说明。

验收标准：

- 后端中不再出现“是否走 Pi、是否走其他链路”这种模糊边界。
- 能明确回答每个 AI 能力的统一入口在哪里。

## 阶段 B：Pi Runtime 内核封装

目标：把 Pi SDK 封成可复用的后端运行时，而不是到处直接创建 session。

1. 新增运行时封装文件，例如：
   `runtime/agent-runtime.ts`
   `runtime/agent-session.factory.ts`
   `runtime/agent-config.ts`
   `runtime/agent-auth.ts`
2. 用 `createAgentSession()` 或 `createAgentSessionRuntime()` 封装标准创建流程。
3. 固定默认 `cwd`、`agentDir`、`AuthStorage`、`ModelRegistry`、`SettingsManager`。
4. 通过 `systemPromptOverride` 注入系统业务身份，而不是复用默认 coding prompt。
5. 明确运行模式：
   单次任务默认 `SessionManager.inMemory()`
   需要多轮对话时再引入持久化 session

交付物：

- 可复用的 Pi Runtime 工厂。
- 统一配置读取逻辑。
- 统一模型和认证装配逻辑。

验收标准：

- 业务 service 不需要知道 Pi SDK 的底层细节。
- 新增一个 Agent 任务时，不需要重复写 session 初始化逻辑。

## 阶段 C：业务工具层重构

目标：让 Agent 通过“业务工具”工作，而不是直接越层访问。

1. 新增 `apps/backend/src/modules/ai/tools/` 目录。
2. 为核心业务能力设计工具接口：
   `get_student_profile`
   `search_jobs`
   `retrieve_knowledge`
   `match_student_to_jobs`
   `generate_career_report`
   `query_career_paths`
   `save_agent_artifact`
3. 工具内部只能调用对应 domain 的 service，不得直接访问 repository。
4. 工具输入输出统一结构化，避免把自由文本协议暴露给业务层。
5. 对高风险工具增加参数校验、超时控制和错误归一化。

交付物：

- 首批核心业务工具定义与实现。
- 工具级输入输出 schema。
- 工具错误码与失败文案规范。

验收标准：

- Agent 完成一次任务时，业务动作都能映射到明确工具。
- 工具层不跨越 `service -> repository` 边界。

## 阶段 D：统一 AI API 设计

目标：让前端和其他模块只依赖稳定的 AI 能力接口。

1. 在 `packages/contracts` 中补齐 AI 模块契约。
2. 设计首批接口：
   `POST /api/v2/ai/tasks`
   `GET /api/v2/ai/tasks/:id`
   `POST /api/v2/ai/chat`
   `GET /api/v2/ai/sessions/:id`
3. 区分同步任务和异步任务返回结构。
4. 补充任务状态字段：
   `queued`
   `running`
   `succeeded`
   `failed`
5. 统一输出：
   结果正文
   结构化结果
   证据摘要
   工具轨迹
   错误信息

交付物：

- OpenAPI 契约。
- 共享类型。
- route/schema/service 实现。

验收标准：

- 前端调用 AI 能力时，不再依赖具体业务模块内部的 Agent 实现细节。
- 任一 AI 接口都能明确看到任务状态和失败原因。

## 阶段 E：会话与记忆策略

目标：避免“所有请求都共享一锅上下文”导致污染。

1. 区分三类会话：
   单次任务会话
   用户多轮咨询会话
   后台批处理会话
2. 定义 session 生命周期、过期策略和存储策略。
3. 为多轮场景补充 sessionId 传递与恢复机制。
4. 评估哪些场景必须持久化到数据库，哪些场景保留内存即可。
5. 明确 compaction 策略和摘要保留策略。

交付物：

- 会话策略设计说明。
- session 存储与恢复方案。
- 会话清理策略。

验收标准：

- 不同用户、不同任务之间不会互相污染上下文。
- 能解释任意一条 AI 结果来自哪个 session。

## 阶段 F：观测、审计与失败恢复

目标：让 AI 中枢可排查、可追责、可复盘。

1. 记录每次任务的：
   请求参数摘要
   sessionId
   model/provider
   system prompt 版本
   工具调用轨迹
   最终输出
   失败原因
2. 增加运行耗时、工具耗时、重试次数、token 消耗统计。
3. 统一异常分层：
   模型调用失败
   工具执行失败
   数据检索失败
   契约校验失败
4. 为可降级任务定义降级策略，为不可降级任务定义快速失败策略。
5. 对关键任务补充 smoke/self-check 入口。

交付物：

- AI 任务审计表或审计记录结构。
- 统一错误码与日志规范。
- 自检脚本或自检接口。

验收标准：

- 任意失败任务都能快速定位在模型、工具还是业务层。
- 演示现场出现失败时，能给出可解释的错误反馈。

## 阶段 G：业务迁移与联调

目标：把现有 AI 能力逐步收口到新中枢。

1. 迁移学生画像相关 Agent/LLM 调用。
2. 迁移匹配分析相关 Agent/LLM 调用。
3. 迁移报告生成相关 Agent/LLM 调用。
4. 迁移 RAG 检索增强任务入口。
5. 移除迁移完成后多余的旧入口和重复运行链路。

交付物：

- 迁移后的统一调用链。
- 已下线的旧入口清单。
- 联调记录与回归结果。

验收标准：

- 前端主流程只经过统一 AI 中枢。
- 仓库内不再存在平行的“第二套业务模型主链路”。

## 阶段 H：测试、验收与演示准备

目标：保证新中枢在演示和持续开发中可稳定复用。

1. 为 `ai` 模块补充单元测试和最小集成测试。
2. 增加至少一条端到端联调链路测试：
   检索 -> 分析 -> 匹配/报告
3. 补充 AI 中枢接口示例请求与响应样例。
4. 整理演示场景中的标准操作流程与兜底说明。
5. 回写架构文档、实现跟踪和问题记录。

交付物：

- `ai` 模块测试用例。
- 联调脚本或验证说明。
- 演示手册中的 AI 中枢章节。

验收标准：

- 关键链路可重复跑通。
- 新成员可以根据文档快速理解 AI 中枢的启动和调用方式。

## 6. 建议执行顺序

建议严格按以下顺序推进，避免先写接口、后补内核，导致返工：

1. 阶段 A：先把边界收口。
2. 阶段 B：先封装 Pi Runtime。
3. 阶段 C：再设计业务工具。
4. 阶段 D：然后暴露统一 API。
5. 阶段 E：补会话与记忆策略。
6. 阶段 F：补观测、审计和失败恢复。
7. 阶段 G：最后迁移既有业务入口。
8. 阶段 H：收尾测试、验收与演示材料。

## 7. 最小可落地版本（推荐）

如果当前时间紧，建议先交付一个最小闭环版本，而不是一次性把所有能力都塞进去。

第一批最小闭环建议只覆盖：

1. `ai` 模块骨架。
2. Pi Runtime 工厂。
3. 3 个业务工具：
   `retrieve_knowledge`
   `match_student_to_jobs`
   `generate_career_report`
4. 2 个统一接口：
   `POST /api/v2/ai/tasks`
   `GET /api/v2/ai/tasks/:id`
5. 审计记录最小集：
   请求摘要、工具轨迹、输出结果、失败原因。

达到这个最小版本后，再向多轮会话、更多工具和更复杂的前端交互扩展。

## 8. 风险清单

1. 风险：把默认 coding tools 带进业务运行时，导致权限过大。  
   应对：业务环境默认禁用 `bash/read/write/edit`，只开放白名单业务工具。

2. 风险：Agent 与既有 service 边界不清，出现多处拼 prompt。  
   应对：规定所有业务 AI 编排都必须经过 `ai.service.ts`。

3. 风险：多轮会话状态污染。  
   应对：优先用任务型短会话，只有明确场景才引入持久化 session。

4. 风险：观测不足，线上失败难以定位。  
   应对：首批版本就补齐任务审计和错误分层。

5. 风险：一次性大改范围过大，影响当前演示链路。  
   应对：采用“新中枢并行接入 -> 逐条业务迁移 -> 验证通过后下线旧入口”的渐进式迁移。

## 9. 完成定义

当以下条件同时满足时，可以认为“Pi 作为系统 AI 中枢”这一大任务完成：

1. 后端存在独立 `ai` 模块并作为统一 AI 入口。
2. 至少 3 条核心业务能力已迁移到 Pi Runtime 编排。
3. 前端主链路已切换到统一 AI API。
4. 任务日志、工具轨迹、失败原因可查询。
5. 旧的平行业务模型链路已下线或明确封存。
6. 文档、进度和测试已同步更新。
