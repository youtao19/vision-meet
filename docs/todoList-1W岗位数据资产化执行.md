# 1W岗位数据资产化执行 TodoList

更新时间：2026-04-04

## 1. 目标与范围

本清单用于把“1W 条岗位招聘记录”沉淀为可复用数据资产，并直接服务以下能力：

1. 岗位画像生成
2. 人岗匹配分析
3. 职业路径规划
4. 职业报告生成

当前执行原则：

1. 第一阶段先跑通 PostgreSQL + pgvector 主链路。
2. 图谱先落关系表，Neo4j 放在第二阶段增强。
3. 每完成一个执行项，立即同步本文档与 `docs/实现跟踪.md`。

## 2. 执行分解

| 编号 | 阶段     | 执行项                                                  | 状态       | 产出物                                                                                                                               | 验收口径                                                  |
| ---- | -------- | ------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| D01  | 数据底座 | 新增岗位资产分层表（raw/normalized/category/graph）     | 已完成     | `apps/backend/src/shared/db/career-schema.ts`                                                                                        | 服务启动后核心表可自动建表                                |
| D02  | 数据处理 | 新增 Python 清洗与标准化脚本（首版）                    | 已完成     | `scripts/job_data_asset_pipeline.py`                                                                                                 | 脚本可对样例数据输出 cleaned/normalized 两类结果          |
| D03  | 任务编排 | 增加根脚本命令，统一触发数据预处理                      | 已完成     | `package.json`                                                                                                                       | 可通过 npm 命令触发 Python 管线                           |
| D04  | 数据验证 | 使用样例数据执行首轮清洗并落盘结果                      | 已完成     | `data/processed/jobs_cleaned.csv`、`data/processed/job_normalized_summary.csv`                                                       | 输出文件存在且记录数 > 0                                  |
| D05  | 画像联动 | 将标准化结果接入 v2 岗位画像流水线输入                  | 已完成首版 | `jobs-intelligence.repository.ts/.pg.ts`、`jobs-intelligence.service.ts`、`jobs-intelligence.profile.ts`、`jobs-intelligence.llm.ts` | 流水线生成时可消费 `job_normalized` 的岗位族/标题提示     |
| D06  | 匹配联动 | 匹配服务消费标准岗位族与画像证据                        | 已完成首版 | `matching.repository.ts/.pg.ts`、`matching.service.ts`                                                                               | 匹配结果 `evidence_refs` 包含岗位族/标准标题/置信度证据   |
| D07  | 报告联动 | 报告模板接入岗位证据和路径建议                          | 已完成首版 | `template-report.generator.ts`                                                                                                       | 报告证据合并匹配证据 + 路径差距证据，路径段落展示关键技能 |
| D08  | 入库闭环 | 清洗结果导入 `job_normalized`（导入脚本 + 幂等 UPSERT） | 已完成首版 | `apps/backend/src/scripts/job-normalized-import.ts`、`package.json`                                                                  | 可通过命令把 `jobs_cleaned.csv` 幂等导入 `job_normalized` |
| D09  | 验收闭环 | 增加端到端验收脚本（岗位族证据一致性）                  | 已完成首版 | `apps/backend/src/scripts/evaluation-normalized-e2e.ts`、`docs/评测结果-岗位标准化证据一致性.md`                                     | 可抽样校验画像/匹配/报告三层岗位族证据一致性              |

## 3. 执行日志

### 2026-04-04

1. 已新增岗位资产分层表首版（`raw_job_posts`、`job_categories`、`job_normalized`、`career_nodes`、`career_edges`）并纳入后端统一建表入口。
2. 已新增 Python 数据处理脚本，覆盖：标题清洗、文本清洗、薪资结构化、岗位标准化归并、结果导出。
3. 已补充根命令 `npm run data:pipeline:prepare`，用于统一触发预处理。
4. 已执行样例数据处理：输入 3 条，清洗去重后 3 条，标准岗位族 3 类。
5. 已验证产出文件：`data/processed/jobs_cleaned.csv`、`data/processed/job_normalized_summary.csv`。
6. 已完成 D05 首版：`jobs-intelligence` 流水线查询会附带 `job_normalized` 提示（标题/岗位族/置信度），并在 Agent 生成画像时优先使用该提示；任务进度日志新增 `normalized_hint` 计数。
7. 已执行 `npm run type-check:backend` 验证 D05 改造可编译通过。
8. 已完成 D06 首版：`matching` 模块可读取岗位标准化提示，并把“岗位族归一/标准标题/归一置信度”写入 `evidence_refs`，用于报告可解释性输出。
9. 已执行 `npm run type-check:backend` 验证 D06 改造可编译通过。
10. 已完成 D07 首版：报告模板会优先合并 `match.evidence_refs` 与路径技能差距证据，`career_path` 章节新增“关键技能”展示，提升报告可解释性。
11. 已执行 `npm run type-check:backend` 验证 D07 改造可编译通过。
12. 已完成数据库污染排查与重导：清理了岗位域旧数据与僵尸流水线任务状态，并从 `data/岗位数据.xls` 重新导入，导入结果 `imported=9958, skipped=0`。
13. 重导后校验通过：`jobs=9958`、重复分组 `0`、`v2_pipeline_tasks=0`，且 `project_doc` 知识库文档保留 `114` 条。
14. 已完成 D08 首版：新增 `job-normalized-import` 脚本，支持读取 `data/processed/jobs_cleaned.csv` 并按 `dedup_key + parse_version` 幂等写入 `job_normalized`（存在则更新，不存在则插入）。
15. 已补充根命令：`npm run data:pipeline:import`（仅导入）与 `npm run data:pipeline:sync`（清洗 + 导入），形成“离线处理 -> 在线服务”闭环。
16. 已完成 D09 首版：新增 `evaluation-normalized-e2e` 抽样验收脚本，默认校验最近 30 条 `match_results`，核对“画像岗位族、匹配证据、报告证据”是否命中 `job_normalized` 的岗位族提示。
17. 已补充空样本兼容：当当前库里暂无匹配/报告样本时，脚本不再报错退出，而是输出告警并生成空样本评测报告，便于持续集成与日常巡检。

执行命令：

```bash
npm run data:pipeline:prepare
npm run data:pipeline:import
npm run data:pipeline:sync
npm run evaluation:normalized:e2e -- --sample-size=10
```

## 4. 下一步（按优先级）

1. 为 `job_categories` 增加人工校准入口，固化 Top20 高频岗位族映射。
2. 为 `job_normalized` 增加导入质量报表（空值率、异常岗位族 TopN、置信度分布）。
3. 打通自动化冒烟：在流水线任务完成后自动触发 `evaluation:normalized:e2e` 并沉淀结果快照。
