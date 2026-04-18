Create a clean professional Chinese PPT infographic page.

## Image Specifications

- Aspect Ratio: 16:9
- Language: Simplified Chinese
- Style: technical-schematic, clean university competition defense PPT
- Background: white / very light blue with subtle grid
- Main colors: deep blue #1450A3, cyan #06B6D4, amber #F59E0B for Pi Agent only
- Use large readable Chinese text, avoid dense paragraphs, avoid tiny text
- Do not invent extra words. Do not create misspelled English terms.

## Page Title

数据处理到岗位画像生成

## Subtitle

从原始岗位表到可展示、可匹配、可复用的标准岗位资产

## Main Layout

Use a left-to-right six-step pipeline in the center, each step as a clean card with icon, title, and two short notes.

Step 1:
Title: 原始岗位数据
Notes:
- 岗位名称、描述、公司
- 地点、薪资、行业

Step 2:
Title: 清洗归一
Notes:
- 字段清洗
- 岗位名称归一

Step 3:
Title: 统计摘要
Notes:
- 汇总岗位族
- 提取高频关键词

Step 4:
Title: Pi Agent 生成
Notes:
- 生成 10 条岗位画像
- 输出结构化 JSON

Step 5:
Title: 画像入库
Notes:
- PostgreSQL 存储
- 任务状态更新

Step 6:
Title: 漫画化展示
Notes:
- 岗位画像列表
- 漫画化岗位画像

## Right Technology Stack Card

Title: 关键技术

List these items with check icons:
- Vue3 + TypeScript
- OpenAPI / Contracts
- Express + Zod
- JobsIntelligenceService
- PostgreSQL Adapter
- Pi Agent
- 失败重试队列

## Callout

Place a small callout near “Pi Agent 生成”:
先清洗并压缩为统计摘要，再交给 Agent 生成岗位画像

## Bottom Band

Title: 输出与价值

Three cards:
1. 标准岗位画像
岗位名称、分类、技能、能力维度

2. 后续模块复用
匹配分析、路径图谱、职业报告

3. 工程稳定性
任务追踪、失败记录、重试闭环

Bottom summary:
通过任务流水线、Agent 生成和结构化入库，把原始岗位表沉淀为后续匹配、图谱和报告的基础资产。
