# 后续重构清单

## 当前状态

- 已删除后端 V1 路由兼容层。
- 已删除 `apps/backend/src/modules/agent/`。
- 已删除 `apps/backend/src/modules/career-path/`。
- 后端基础接口已统一切到 `/api/v2/*`。
- AI 任务执行已收口到 `apps/backend/src/modules/ai/`。
- 阶段 1 已完成：Pi 工具已迁移到 `apps/backend/src/modules/pi-tools/`，旧 `modules/ai/tools/` 已删除。
- 前端 AI API 文件已从 `shared/api/agent.ts` 改名为 `shared/api/ai.ts`。

## 第一阶段：收口 AI / Pi 工具边界

- [x] 新建 `apps/backend/src/modules/pi-tools/`。
- [x] 新建 `pi-tools.registry.ts`，统一注册 Pi 可调用工具。
- [x] 新建 `pi-tool-context.ts`，集中定义工具依赖、运行状态和选项。
- [x] 将 `modules/ai/tools/search-knowledge.tool.ts` 迁到 `modules/pi-tools/knowledge/`。
- [x] 将 `modules/ai/tools/create-match.tool.ts` 迁到 `modules/pi-tools/matching/`。
- [x] 将 `modules/ai/tools/create-report.tool.ts` 迁到 `modules/pi-tools/report/`。
- [x] 增加 `modules/pi-tools/profile/create-student-profile.tool.ts`。
- [x] 增加 `modules/pi-tools/resume/generate-resume-html.tool.ts`。
- [x] 增加 `modules/pi-tools/jobs/generate-job-comic.tool.ts`。
- [x] 调整 `modules/ai/runtime`，让它只负责 Pi session、事件流、结果归一。
- [x] 删除或清空旧 `modules/ai/tools/`，避免两个 tools 目录长期并存。
- [x] 将前端 `apps/frontend/src/shared/api/agent.ts` 重命名为 `ai.ts`。
- [x] 同步更新前端对 `@/shared/api/agent` 的引用。

## 第二阶段：清理 contracts 和旧命名

- [ ] 将 contracts 中外部 API 命名统一为 `Ai*`。
- [ ] 删除或替换 `CreateAgentTaskRequest`。
- [ ] 删除或替换 `AgentTaskResponse`。
- [ ] 删除或替换 `AgentChatRequest`。
- [ ] 删除或替换 `AgentAnalyzeRequest`。
- [ ] 将 `AgentToolName` 改为更准确的 `PiToolName` 或 `AiToolName`。
- [ ] 外部响应类型统一为 `AiStepTraceItem`。
- [ ] 内部工具类型优先使用 `PiToolName`。
- [ ] 检查数据库字段和响应字段中不必要的 `agent` 命名。
- [ ] 保留仍有业务含义的 `generation_mode: "agent"`，后续单独评估是否改名。

## 第三阶段：拆分 jobs-intelligence 大模块

- [ ] 将 `jobs-intelligence` 拆成内部子目录。
- [ ] 新建 `jobs-intelligence/pipeline/`，承接岗位流水线。
- [ ] 新建 `jobs-intelligence/portraits/`，承接岗位画像。
- [ ] 新建 `jobs-intelligence/comics/`，承接岗位漫画。
- [ ] 新建 `jobs-intelligence/career-graph/`，承接职业路径图谱。
- [ ] 新建 `jobs-intelligence/taxonomy/`，承接岗位分类和标准化。
- [ ] 新建 `jobs-intelligence/repository/`，承接 PG / Neo4j adapter。
- [ ] 第一轮只移动函数和类型，保持 API 行为不变。
- [ ] 每拆一步执行 `npm run type-check`。
- [ ] 将图谱生成拆成 `career-graph/manual` 和 `career-graph/agent`。
- [ ] 评估是否把“岗位画像 -> 图谱”的生成流程也封装为 Pi tool。

## 第四阶段：报告、简历、画像生成工具化

- [ ] 报告生成保留在 `report.service.ts`，tool 只做 Pi wrapper。
- [ ] 新增 `pi-tools/report/create-career-report.tool.ts`。
- [ ] 简历生成拆成 `resume/generate-resume-html.tool.ts` 和 `resume/resume-html.runtime.ts`。
- [ ] 如果简历历史记录继续扩展，再新增 `resume/resume-html.repository.ts`。
- [ ] 学生画像落库继续由 `profile.service.ts` 负责。
- [ ] 将简历解析、图片识别、画像生成封装为 Pi tools。
- [ ] 岗位漫画核心逻辑留在 `jobs-intelligence`，tool 只调用对应 service。
- [ ] 新增 `pi-tools/jobs/generate-job-comic.tool.ts`。

## 第五阶段：数据库和文档收尾

- [ ] 新增 `apps/backend/src/scripts/db-cleanup-legacy.ts`。
- [ ] 在清理脚本中幂等删除旧 `agent_tasks`。
- [ ] 在清理脚本中幂等删除旧 Neo4j `CareerRole` / `CAREER_PATH` 数据。
- [ ] 确认是否还有其他 legacy 表需要归档或删除。
- [ ] 更新 `docs/项目技术架构.md`，改成当前 V2-only 架构。
- [ ] 更新 `docs/工程结构与协作规范.md`，补充 `pi-tools` 规则。
- [ ] 更新 `README.md`，去掉旧 Agent/V1 兼容表述。
- [ ] 补齐 OpenAPI 中 `/api/v2/jobs`、`/api/v2/profile`、`/api/v2/knowledge`。

## 第六阶段：验证闭环

- [ ] 每个阶段至少执行 `npm run type-check`。
- [ ] 每个后端结构调整阶段执行 `npm run build -w career-backend`。
- [ ] 完成 `pi-tools` 迁移后执行 `npm run agent:smoke`。
- [ ] 创建一次 `/api/v2/ai/tasks`，验证 Pi 工具链路。
- [ ] 验证 `search_knowledge -> create_match -> create_report` 仍能跑通。
- [ ] 验证学生画像页能加载。
- [ ] 验证岗位列表能加载。
- [ ] 验证匹配分析能创建任务。
- [ ] 验证报告页能润色和保存。
- [ ] 验证职业路径页仍走 `/api/v2/career-paths/*`。

## 推荐下一步

优先执行“第一阶段：收口 AI / Pi 工具边界”。

原因：

- 它能直接落地 Pi call tools 架构。
- 它不需要马上重写核心业务算法。
- 它能解决当前 `ai/tools` 与目标 `tools` 目录的命名和职责冲突。
- 它会为后续拆 `jobs-intelligence`、报告生成、简历生成打好边界。
