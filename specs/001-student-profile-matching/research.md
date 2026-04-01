# Phase 0 Research: 学生画像与人岗匹配评分

## Decision 1: 简历上传接口采用独立端点并复用画像服务

- Decision: 新增 `POST /api/v1/profile/resume`，使用 `multipart/form-data` 上传简历文件，
  后端解析后映射为学生画像输入并复用现有画像生成服务。
- Rationale: 能同时满足“简历上传”和“手动录入”两种入口，且避免重复实现评分与归一化逻辑。
- Alternatives considered:
  - 方案 A：将简历内容作为 JSON 字段提交到现有 `POST /api/v1/profile`。
    - 放弃原因：不利于真实文件上传场景，且与前端文件流转模式不一致。
  - 方案 B：由前端先解析简历再传结构化数据。
    - 放弃原因：前端解析质量不可控，且增加浏览器端复杂度。

## Decision 2: 匹配结果可复现采用“规则版本 + 输入指纹”

- Decision: 匹配计算记录 `scoring_version` 与 `input_fingerprint`，并在查询/重算时作为幂等与复现依据。
- Rationale: 该策略可直接满足“同输入同输出”的业务要求，并支持未来算法迭代时保留历史可解释性。
- Alternatives considered:
  - 方案 A：每次请求都实时计算，不做版本和指纹记录。
    - 放弃原因：难以证明复现性，也不利于问题追踪。
  - 方案 B：引入非确定性大模型直接打分。
    - 放弃原因：输出可能波动，不满足当前阶段可复现硬约束。

## Decision 3: 新增独立 matching 领域模块

- Decision: 在 `apps/backend/src/modules/matching` 新建 `route/schemas/service/repository/repository.json`
  文件集合；`profile` 域只负责画像创建与读取。
- Rationale: 将匹配过程与画像过程解耦，保持领域职责清晰，便于后续替换存储适配器。
- Alternatives considered:
  - 方案 A：把匹配逻辑直接放进 `profile.service.ts`。
    - 放弃原因：会导致 service 职责膨胀，后续迁移与测试复杂度显著提升。
  - 方案 B：在 route 层直接拼装匹配逻辑。
    - 放弃原因：违反后端分层宪章（route 不承载业务核心逻辑）。

## Decision 4: 错误响应统一为结构化错误模型

- Decision: 新增统一错误模型（`code`、`message`、`detail`、`trace_id?`），并在新增接口上区分
  `400/404/422/500` 语义。
- Rationale: 前端可稳定映射错误提示，接口文档和实现保持一致，联调成本更低。
- Alternatives considered:
  - 方案 A：延续仅返回 `detail` 的最小错误结构。
    - 放弃原因：前端难以进行稳定分类提示，不利于运营与排障。

## Decision 5: 当前性能与规模目标

- Decision: 本期性能目标定义为“匹配详情 P95 ≤ 2 秒”；列表接口采用分页（`limit <= 100`）。
- Rationale: 与规格成功标准一致，且适配当前 JSON adapter 的成本边界。
- Alternatives considered:
  - 方案 A：要求亚秒级全链路响应。
    - 放弃原因：在当前 JSON 存储模式下收益有限且实现代价高。

## Decision 6: 数据层演进保持 service 层稳定

- Decision: 在仓储抽象中封装读写操作，JSON 与未来 PostgreSQL/pgvector/Neo4j 差异仅在
  `repository.adapter` 层实现。
- Rationale: 迁移时只替换 adapter 和迁移脚本，避免前端与 service 层发生破坏性变更。
- Alternatives considered:
  - 方案 A：在 service 内引入多种存储分支判断。
    - 放弃原因：会放大业务层复杂度并削弱可测试性。

## Resolved Clarifications

- Performance Goals: 已确定为“详情查询 P95 ≤ 2 秒；端到端分析流程 ≤ 5 分钟”。
- Scale/Scope: 已确定为“单学生画像 + 单岗位画像分析；列表分页查询且 `limit <= 100`”。
- Interface Boundaries: 已确定本期不包含复杂图谱可视化与外部招聘平台集成。
