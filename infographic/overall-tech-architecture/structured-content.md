# 总体技术架构

## Learning Objective

让观众理解 Career Agent 如何从岗位数据处理出发，经过岗位画像、学生画像、路径图谱，最终生成职业报告。

## Section 1: 展示层

Key concept: 四个核心功能页面。

Content:
- 数据处理 / 岗位画像：任务进度、阶段时间线、岗位画像列表、漫画化岗位画像。
- 学生画像：简历解析结果、能力标签、技能结构、画像维度。
- 路径图谱：岗位节点、晋升路径、转岗路径、技能差距、推荐路线。
- 职业报告：匹配结论、能力短板、行动建议、报告导出。

Visual element:
- 四个横向功能卡片，使用图标和短标签。

Text labels:
- 数据处理 / 岗位画像
- 学生画像
- 路径图谱
- 职业报告

## Section 2: 能力层

Key concept: 功能背后的技术能力。

Content:
- Vue3 + TypeScript 前端展示。
- Express + TypeScript 后端服务。
- Pi Agent 智能生成岗位画像。
- OpenAPI / Contracts 统一接口契约。
- PostgreSQL 数据存储。
- Neo4j 路径图谱。
- 任务流水线 + 失败重试。

Visual element:
- 中间技术能力模块，像系统中枢或服务总线。

Text labels:
- Vue3 + TypeScript
- Express + TypeScript
- Pi Agent
- OpenAPI / Contracts
- PostgreSQL
- Neo4j
- 任务流水线
- 失败重试

## Section 3: 数据层

Key concept: 数据资产流转。

Content:
- 原始岗位数据。
- 清洗后岗位数据。
- 标准岗位画像。
- 学生画像数据。
- 匹配结果。
- 职业报告结果。

Visual element:
- 底部数据资产节点与箭头。

Text labels:
- 原始岗位数据
- 清洗归一
- 岗位画像
- 学生画像匹配
- 路径图谱推理
- 职业报告

## Summary

以统一契约连接前后端，以 Agent 生成能力沉淀岗位画像，以图数据库支撑路径推理，最终形成可展示、可追踪、可导出的职业规划结果。
