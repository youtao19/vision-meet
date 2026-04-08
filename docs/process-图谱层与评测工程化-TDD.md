# 图谱层与评测工程化 Process（TDD）

更新时间：2026-04-04  
适用范围：`P05 图谱层` + `P06 评测层` + `P07 工程化（图谱相关部分）`

## 1. 文档目标

本文件是“图谱层等功能”的唯一执行流程文件。后续实现严格按本文件的小任务顺序推进，并在每次完成后同步状态与记录。

## 2. 执行总规则（强约束）

1. 必须采用 TDD：先写失败测试（Red）-> 最小实现（Green）-> 重构（Refactor）。
2. 一次只推进一个小任务，不并行跨任务改动。
3. 每完成一个小任务，必须同步三处文档：
   - 本文件任务状态
   - `docs/todoList-岗位画像重构执行.md`
   - `docs/实现跟踪.md`
4. 若实现过程中出现问题修复，必须追加 `docs/问题记录库.jsonl`（遵循问题记录规范）。
5. 每次任务结束必须执行：
   - `npm run test --workspace @career/backend`
   - `npm run type-check --workspace @career/backend`

## 3. 小任务总览（按顺序执行）

| 编号 | 小任务             | 目标                                           | 状态   |
| ---- | ------------------ | ---------------------------------------------- | ------ |
| G01  | 图谱契约冻结       | 固化 graph 节点/边输入输出契约与版本字段       | 已完成 |
| G02  | 构图内核测试基线   | 建立纯函数构图测试基线（promotion/transition） | 已完成 |
| G03  | 晋升边规则收口     | 强化同岗位族职级递进与阈值约束                 | 已完成 |
| G04  | 换岗边规则收口     | 强化跨岗位族迁移规则与可迁移技能约束           | 已完成 |
| G05  | 图谱证据与解释字段 | 边解释 reason 与技能缺口生成规则可测化         | 已完成 |
| G06  | 图谱仓储幂等写入   | Neo4j 写入幂等与子图读取一致性测试             | 已完成 |
| G07  | 流水线图谱阶段改造 | pipeline 接入新图谱规则并增加阶段统计          | 已完成 |
| G08  | 图谱查询接口增强   | 补充过滤参数与返回元信息（版本/统计）          | 已完成 |
| G09  | 图谱质量门禁       | 增加“路径覆盖率/断链率”门禁，失败即任务失败    | 已完成 |
| G10  | 图谱评测脚本       | 落地可复算评测脚本与 Markdown 报告             | 已完成 |
| G11  | 失败重试与审计     | 图谱阶段失败入队、可重跑、可追踪               | 已完成 |
| G12  | 最终验收与回归     | 全链路回归 + 文档收口 + 验收结论               | 已完成 |

## 4. 每个小任务的 TDD 执行卡

### G01 图谱契约冻结

- 目标：统一图谱层输入输出契约，确保后续实现不漂移。
- Red：新增契约测试（字段存在、字段语义、版本字段）。
- Green：补齐/修正 contracts 类型与调用方类型引用。
- Refactor：移除模块内部重复 graph 类型定义。
- 主要文件：
  - `packages/contracts/types/index.ts`
  - `apps/backend/src/modules/jobs-intelligence/jobs-intelligence.repository.neo4j.ts`
  - `apps/backend/src/modules/career-path/career-path.repository.ts`
- DoD：图谱核心类型只保留一份来源（contracts）。

### G02 构图内核测试基线

- 目标：为 `buildAutoCareerGraph` 建立可回归测试基线。
- Red：新增 `jobs-intelligence.graph.test.ts`，覆盖节点数、边类型、评分区间。
- Green：让现有构图函数满足测试。
- Refactor：抽离技能相似度与阈值函数，便于后续迭代。
- 主要文件：
  - `apps/backend/src/modules/jobs-intelligence/__tests__/jobs-intelligence.graph.test.ts`
  - `apps/backend/src/modules/jobs-intelligence/jobs-intelligence.graph.ts`
- DoD：构图纯函数在固定输入下稳定输出。

### G03 晋升边规则收口

- 目标：晋升边必须满足“同族 + level+1 + 技能重叠阈值”。
- Red：补充晋升边失败用例（低重叠、不连续等级、跨族）。
- Green：完善 promotion 过滤规则。
- Refactor：统一阈值常量与命名。
- DoD：晋升边误连显著降低，测试全绿。

### G04 换岗边规则收口

- 目标：换岗边必须满足“跨族 + 可迁移技能>=2 + 成本合理”。
- Red：补充换岗边失败用例（同族、重叠不足、等级跳跃过大）。
- Green：完善 transition 过滤规则。
- Refactor：优化候选召回，避免无效遍历。
- DoD：每个节点换岗边数量和质量可控。

### G05 图谱证据与解释字段

- 目标：每条边都可解释（reason + required_skills + gap_skills）。
- Red：新增解释字段完整性测试。
- Green：补齐生成规则与空值兜底。
- Refactor：统一解释文案模板函数。
- DoD：查询结果中边解释字段完整且可读。

### G06 图谱仓储幂等写入

- 目标：重复同步不产生重复图关系，子图查询稳定。
- Red：新增仓储测试（重复写入、读取节点边一致）。
- Green：优化 Neo4j MERGE/DELETE 逻辑与约束。
- Refactor：拆分 query 构造函数，降低仓储复杂度。
- 主要文件：
  - `apps/backend/src/modules/jobs-intelligence/__tests__/jobs-intelligence.repository.neo4j.test.ts`
  - `apps/backend/src/modules/jobs-intelligence/jobs-intelligence.repository.neo4j.ts`
- DoD：重复执行同步脚本结果一致。

### G07 流水线图谱阶段改造

- 目标：pipeline 图谱阶段可观测（输入规模、产出规模、耗时）。
- Red：service 测试新增图谱阶段统计断言。
- Green：在 `runPipelineTask` 中增加阶段日志与进度字段。
- Refactor：抽离图谱阶段编排函数。
- DoD：任务详情可看到图谱阶段关键统计。

### G08 图谱查询接口增强

- 目标：增强 `/career-paths/jobs/:job_id` 的可用性（过滤和元数据）。
- Red：route/schema/service 测试新增参数与返回约束。
- Green：补齐 schema、service、route 实现。
- Refactor：统一响应组装函数。
- DoD：接口可稳定支撑前端路径图谱页。

### G09 图谱质量门禁

- 目标：在流水线增加图谱质量门禁。
- 门禁建议：
  - 覆盖率门禁：至少 5 个岗位有有效路径。
  - 断链率门禁：无出边节点比例不超过阈值。
- Red：新增门禁失败测试。
- Green：落地门禁判定与错误信息。
- Refactor：门禁配置抽成常量。
- DoD：门禁失败时任务状态为 failed 且错误清晰。

### G10 图谱评测脚本

- 目标：形成“可复算、可追踪”的图谱评测。
- Red：先定义评测输出结构断言。
- Green：实现脚本和报告输出。
- 主要文件：
  - `apps/backend/src/scripts/evaluation-graph-e2e.ts`
  - `data/evaluation/`（输出目录）
- DoD：一条命令产出 JSON + Markdown 报告。

### G11 失败重试与审计

- 目标：图谱阶段失败后可重试、可追踪原因。
- Red：新增 service/repository 失败重试测试。
- Green：实现失败入队与重跑入口。
- Refactor：统一错误码和审计记录结构。
- DoD：失败任务可按 task_id 重跑并保留审计链路。

### G12 最终验收与回归

- 目标：完成图谱层阶段收口。
- Red：补充回归测试（关键路径）。
- Green：修复剩余边界问题。
- Refactor：清理冗余代码与文档。
- DoD：测试通过、类型检查通过、文档闭环。

## 5. 任务同步模板（每次完成后追加）

```text
[YYYY-MM-DD HH:mm] 完成 Gxx
- Red: 新增/更新测试：...
- Green: 实现改动：...
- Refactor: 重构项：...
- 验证: npm run test --workspace @career/backend / npm run type-check --workspace @career/backend
- 文档同步: todoList + 实现跟踪 + process
```

## 6. 当前执行指令

1. 后续图谱相关改动严格按 G01 -> G12 顺序执行。
2. 若需要跳过任务，必须先在本文件写明“跳过原因 + 风险 + 回补时间点”。
3. 默认从 G01 开始，不直接跨到实现阶段。

## 7. 本轮执行记录

[2026-04-04 14:40] 完成 G01-G12

- Red: 新增/扩展测试 `jobs-intelligence.graph.test.ts`、`jobs-intelligence.repository.neo4j.test.ts`、`jobs-intelligence.service.test.ts`，覆盖构图规则、仓储幂等、图谱门禁、查询过滤、重跑能力。
- Green: 已完成 contracts 图谱版本字段、图谱构图内核规则收口、Neo4j 仓储可测化与快照元信息、流水线图谱门禁（覆盖岗位数/孤立节点比例）、图谱查询增强（`relation_type`/`min_score` + 统计元信息）、重跑接口、图谱评测脚本与命令。
- Refactor: 构图函数改为直接输出 contracts `CareerGraphSnapshot`，抽离图谱质量计算与查询参数归一，降低重复逻辑。
- 验证: `npm run type-check --workspace @career/backend`、`npm run test --workspace @career/backend`、`npm run evaluation:graph:e2e -- --sample-size=1 --depth=2` 均已通过。
- 文档同步: todoList + 实现跟踪 + process 已同步。
