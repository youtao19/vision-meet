# 岗位画像逻辑重构执行 TodoList

更新时间：2026-04-04

## 1. 目标与范围

本清单用于将当前“逐条岗位招聘信息直接生成最终画像”的链路，重构为“单条事实抽取 -> 标准岗位聚合画像 -> 职业路径图谱”三层链路。

重构目标：

1. 产物粒度从 posting 级调整到 canonical role 级，满足比赛对“标准岗位画像 + 路径规划”的要求。
2. LLM 从“直接产出最终画像”调整为“结构化抽取 + 证据约束总结”，提升稳定性与可解释性。
3. 图谱从后置补建改为独立建模，与标准岗位画像并行演进。
4. 全链路保留证据绑定与审计能力，支持评测复算与结果追溯。

当前执行原则：

1. 先重构建模方式，再做并发、重试、阈值等工程优化。
2. 先完成 schema 与数据链路改造，再逐步迁移 Agent 职责。
3. 每完成一个执行项，立即同步本文档与 `docs/实现跟踪.md`。

## 2. 核心方案（两层画像 + 一层图谱）

### 2.1 第一层：岗位帖画像（Posting Profile）

定位：针对单条岗位招聘信息做结构化事实抽取，不做最终岗位定型。

抽取目标字段（建议 schema）：

```json
{
  "job_id": "",
  "normalized_title": "",
  "job_family": "",
  "job_level": "",
  "responsibilities": [],
  "required_skills": [],
  "preferred_skills": [],
  "tools": [],
  "certificates": [],
  "education_requirement": "",
  "experience_requirement": "",
  "soft_skills": [],
  "industry_context": [],
  "evidence": [
    {
      "field": "required_skills",
      "text": "",
      "source": "job_description"
    }
  ],
  "confidence": 0
}
```

落地约束：

1. Extract 层必须强制 evidence 绑定。
2. 无证据字段需降置信度，或不进入标准岗位核心画像字段。
3. LLM 只做结构化抽取，不做自由发挥式“岗位文案创作”。

### 2.2 第二层：标准岗位画像（Canonical Role Profile）

定位：将大量 posting profile 聚合到同一个标准岗位，生成可展示、可匹配、可路径规划的标准画像。

聚合键建议：

1. `normalized_title + job_family + level_band`

聚合输出建议：

1. 岗位简介（由统计事实约束下总结生成）
2. 核心职责
3. 核心能力要求
4. 加分项
5. 典型入门路径
6. 常见发展方向

聚合规则建议：

1. 技能频率分层：70%+ 核心必备，30%-70% 常见要求，10%-30% 加分项。
2. 软技能仅保留高频且可解释项（沟通协作、学习能力、抗压能力、责任心、逻辑分析）。
3. LLM 仅基于“聚合统计 + 证据片段”做总结，不允许脱证据扩写。

### 2.3 第三层：职业路径图谱（Role Graph）

定位：围绕标准岗位构建职业路径，不以招聘帖子为节点。

图谱节点：

1. 标准岗位
2. 技能
3. 职级
4. 行业方向

图谱边（至少）：

1. `PROMOTE_TO`（垂直晋升）
2. `TRANSFER_TO`（换岗迁移）
3. `REQUIRES_SKILL`（岗位技能要求）

可选边：

1. `SIMILAR_TO`
2. `COMMON_IN_INDUSTRY`

生成原则：

1. 规则为主，LLM 辅助解释，不让 LLM 自由生成路径主结构。
2. 垂直路径依据：岗位族一致 + 职级递进 + 技能覆盖提升 + 责任范围扩大。
3. 换岗路径依据：技能重叠 + 工具相似 + 业务场景相近 + 经验迁移可行性。

## 3. 数据与职责重构设计

### 3.1 数据层表设计（建议最小集）

原始层：

1. `jobs`
2. `job_normalized`

抽取层：

1. `job_facts`
2. `job_fact_evidence`

标准岗位层：

1. `canonical_roles`
2. `canonical_role_skills`
3. `canonical_role_traits`
4. `canonical_role_certificates`

图谱层：

1. `role_edges`

任务层：

1. `agent_runs`
2. `agent_failures`
3. `agent_retry_queue`

### 3.2 Agent 职责划分

1. Normalize Agent：标题标准化、岗位族分类、职级判断。
2. Extract Agent：单条 JD 事实抽取 + 字段证据绑定。
3. Synthesis Agent：同类岗位聚合总结，生成标准岗位画像。
4. Graph Agent：基于规则构图，LLM 辅助生成路径解释文案。

### 3.3 LLM 使用三条硬约束

1. LLM 不直接决定最终 `job_family`，优先规则/词典/分类模型，低置信度再辅助。
2. LLM 输出必须带 `evidence_refs`，无证据字段不可进入核心画像。
3. LLM 只做“抽取”和“总结”，不做自由创作式画像编造。

## 4. 执行分解

| 编号 | 阶段 | 执行项 | 状态 | 产出物 | 验收口径 |
| --- | --- | --- | --- | --- | --- |
| P01 | 建模重构 | 统一三层建模与字段契约（posting/canonical/graph） | 已完成 | contracts 全量类型（posting/canonical/graph）+ 后端类型回收 | 三层 schema 与字段语义固定，可供开发并行实施 |
| P02 | 数据层 | 新增抽取层与标准岗位层数据表 | 已完成首版 | `jobs-intelligence.repository.pg.ts` | 已新增 `v2_job_facts` 与 `v2_job_fact_evidence`，支持落库 |
| P03 | 抽取层 | 改造岗位画像流水线为“单条事实抽取” | 已完成首版 | `jobs-intelligence` 抽取链路 + 入库 + 查询接口 + 单元测试 | 每条 JD 可稳定输出并查询 job_facts + evidence |
| P04 | 聚合层 | 新增 canonical role 聚合与总结链路 | 已完成（当前阶段） | 聚合规则 + 质量门禁 + 结构化summary产物 + 版本管理/幂等回放 + canonical 入库/查询接口 | 至少产出 10 个标准岗位画像并可复算 |
| P05 | 图谱层 | 独立构建 role graph 规则链路 | 已完成（当前阶段） | `career-path` / graph 构图任务 + `docs/process-图谱层与评测工程化-TDD.md` | 至少 5 个岗位各 2 条换岗路径，垂直链路可解释 |
| P06 | 评测层 | 新增证据一致性与准确率抽样评测 | 已完成（当前阶段） | 图谱评测脚本 + JSON/Markdown 报告输出 | 可一键执行并复算图谱覆盖率/断链率核心指标 |
| P07 | 工程化 | 接入失败队列、阈值重跑、并发优化 | 已完成（当前阶段） | 图谱质量门禁 + 失败重跑接口 + 任务审计信息 | 图谱门禁失败可明确报错，支持按 task_id 重跑 |

## 5. 实施顺序（优先级）

1. 第一优先级：P01 + P02 + P03（先完成“逐条事实抽取”重构）。
2. 第二优先级：P04（形成标准岗位聚合画像主产物）。
3. 第三优先级：P05（图谱独立建模并入路径规划主链路）。
4. 第四优先级：P06（指标化验收，形成可复算闭环）。
5. 第五优先级：P07（并发/重试/阈值等工程增强）。

## 6. 同步修改记录

### 2026-04-04

1. 已创建本 TodoList，固化“单条事实抽取 -> 标准岗位聚合画像 -> 职业路径图谱”的重构方向。
2. 已将执行项拆解为 P01-P07，并定义产出物与验收口径。
3. 已同步要求：后续每次推进需同时更新本文档与 `docs/实现跟踪.md`。
4. 已按 TDD 启动 P03：先新增 `jobs-intelligence.posting-facts.test.ts` 定义“事实抽取 + 证据绑定 + 无证据降置信度”行为，再实现 `extractPostingProfileFacts` 使测试通过。
5. 已新增后端测试命令 `npm run test`（backend workspace），并完成验证：2/2 用例通过，`npm run type-check` 通过。
6. 已执行下一步 TDD（P02/P03联动）：先新增 `jobs-intelligence.repository.pg.test.ts` 约束 `createJobFacts` 行为，再补齐仓储接口与 PG 实现，完成 `v2_job_facts/v2_job_fact_evidence` 入库能力。
7. 已在流水线中接入 `extractPostingProfileFacts -> createJobFacts`，实现“先抽事实再生成画像”的落库闭环；当前测试 3/3 通过，`npm run type-check` 通过。
8. 已执行 P04 首批 TDD：新增 `buildCanonicalRoleProfile` 聚合测试，按“70%+/30%-70%/10%-30%”规则验证技能分层；实现聚合函数后测试通过。
9. 当前 backend 测试 4/4 通过，`npm run type-check` 通过。
10. 已执行 P04 第二批 TDD：新增 `groupPostingFactsByRole` 测试并转绿，完成按 `job_family + normalized_title + level_band` 分组。
11. 已新增 canonical 持久化能力：`v2_canonical_roles` 建表、`upsertCanonicalRoleProfile` 入库、`listLatestJobFactsForCanonical` 查询。
12. 已在岗位流水线接入 canonical 聚合写入，任务完成信息新增“标准岗位数”；当前 backend 测试 5/5 通过，`npm run type-check` 通过。
13. 已执行 P04 第三批 TDD：新增“软技能白名单”失败用例，限制 canonical 输出仅保留可解释软技能（沟通/协作/学习能力/抗压能力/责任心/逻辑分析）。
14. 已在 `buildCanonicalRoleProfile` 增加软技能白名单过滤并验证通过；当前 backend 测试 6/6 通过，`npm run type-check` 通过。
15. 已执行 P04 第四批 TDD：新增 `jobs-intelligence.service.test.ts`，验证“标准岗位数不足 10 必须判失败”。
16. 已在流水线成功判定中加入 `canonical_roles >= 10` 门禁，并返回明确错误信息“标准岗位数量不足 10”；当前 backend 测试 7/7 通过，`npm run type-check` 通过。
17. 已执行 P04 第五批 TDD：新增 `listCanonicalRoles` 服务层失败用例并转绿，完成标准岗位分页查询能力。
18. 已补齐 `/api/v2/canonical-roles` 查询接口（schema + route + service + repository.pg），并在 contracts 新增 canonical 共享类型；当前 backend 测试 8/8 通过，`npm run type-check` 通过。
19. 已执行 P03/P04 联动 TDD：新增“无证据或低置信度事实不得进入 canonical 聚合”失败用例并转绿，聚合分组前新增质量过滤（`confidence >= 0.5` 且 `evidence` 非空）。
20. 已补齐抽取层查询能力：新增 `/api/v2/job-facts`（schema + route + service + repository.pg），支持按关键字/岗位族分页查看最新事实抽取结果；contracts 已新增 job-facts 共享类型。
21. 当前 backend 测试 10/10 通过，`npm run type-check` 通过。
22. 已执行 P03/P04 下一轮 TDD：新增并转绿详情查询用例，抽取层新增 `/api/v2/job-facts/:job_id`，聚合层新增 `/api/v2/canonical-roles/:role_key`。
23. 已补齐 service/repository 详情方法：`getJobFact`/`getCanonicalRole` 与 `getLatestJobFactByJobId`/`getCanonicalRoleByKey`，不存在时返回 404 业务错误。
24. 当前 backend 测试 12/12 通过，`npm run type-check` 通过。
25. 已执行 P04 第七批 TDD：新增“canonical 必须产出结构化岗位总结”失败用例并转绿，聚合结果新增 `summary_version=v1 + summary`（岗位概述/核心职责/核心要求/加分项/入门路径/发展方向）。
26. 已完成 P01 首批收口：contracts 新增 `CanonicalRoleSummary`、`CanonicalRoleProfileDraft`、`PostingEvidenceField`、`PostingProfileFacts` 等终版类型，并在 profile/repository 抽象与 PG 实现中回收本地重复类型引用。
27. canonical 持久化已新增 `summary_version` 与 `summary_payload` 字段写入/读取，支持展示与报告层稳定复用同一聚合产物。
28. 当前 backend 测试 13/13 通过，`npm run type-check` 通过。
29. 已执行 P04 第八批 TDD：新增“同内容重跑不重复升版”仓储失败用例并转绿，聚合层已引入 `canonical_version + content_hash` 版本管理。
30. 已固化幂等回放策略：`v2_canonical_role_versions` 版本表 + `role_key/content_hash` 唯一约束；同内容重跑仅更新时间，不新增版本；内容变化才升版并落版本历史。
31. 已完成 P01 最终收口：contracts 新增图谱层共享类型 `CareerGraphNodeRecord/CareerGraphEdgeRecord/CareerGraphSnapshot`，Neo4j 仓储已切换依赖共享类型。
32. 当前 backend 测试 14/14 通过，`npm run type-check` 通过。
33. 已创建图谱层执行流程文件 `docs/process-图谱层与评测工程化-TDD.md`，将 P05/P06/P07 拆分为 G01-G12 小任务并固化 TDD（Red/Green/Refactor）与文档同步强约束；后续图谱相关改动严格按该 process 执行并同步状态。
34. 已按 process 完成 G01-G12：图谱契约升级（`graph_version/generated_at` + 图谱统计元信息）、构图规则收口（晋升/换岗阈值与解释字段）、Neo4j 仓储可注入 driver 并补齐幂等测试、流水线新增图谱质量门禁（覆盖岗位数/孤立节点比例）。
35. 已补齐图谱查询增强：`/api/v2/career-paths/jobs/:job_id` 支持 `relation_type` 与 `min_score` 过滤，并返回图谱版本与统计字段。
36. 已补齐图谱评测脚本与命令：新增 `apps/backend/src/scripts/evaluation-graph-e2e.ts`、`npm run evaluation:graph:e2e`，本机已验证样本执行成功并输出 `docs/评测结果-图谱端到端质量.md`。
37. 已补齐工程化重跑能力：新增 `POST /api/v2/jobs/pipeline/tasks/:task_id/retry`，支持按历史任务模式发起重跑并记录来源任务信息。
38. 当前 backend 测试 23/23 通过，`npm run type-check` 通过，图谱评测脚本命令可执行通过。

## 7. 下一步（立即执行）

1. 在 `packages/contracts/types` 增补 posting facts 与 canonical role 的共享类型定义草案。
2. 在后端 `jobs-intelligence` 模块落一版 `job_facts` 持久化接口，优先打通 evidence 入库。
3. 设计 canonical 聚合任务入参与幂等键，确保同批次结果可复算。