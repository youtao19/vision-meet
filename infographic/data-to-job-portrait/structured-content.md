# 数据处理到岗位画像生成

## Learning Objective

解释系统如何把原始岗位数据加工成可展示、可匹配、可复用的标准岗位画像。

## Section 1: 主流程

Key concept: 数据处理到岗位画像的端到端链路。

Content:
- 原始岗位数据：岗位表、岗位名称、描述、公司、地点、薪资、行业。
- 清洗归一：清理空值和异常字符，归一岗位名称和岗位族，提取关键词。
- 统计摘要：将全量岗位明细压缩成岗位族、岗位名称、关键词的统计摘要。
- Pi Agent 生成：基于统计摘要生成 10 条结构化岗位画像 JSON。
- 画像入库：写入岗位画像结果表，更新任务状态和生成数量。
- 漫画化展示：岗位画像中心展示画像列表，并支持漫画化岗位画像。

Visual element:
- 横向六阶段流程箭头。

Text labels:
- 原始岗位数据
- 清洗归一
- 统计摘要
- Pi Agent 生成
- 画像入库
- 漫画化展示

## Section 2: 具体技术

Key concept: 每个环节对应的技术组件。

Content:
- 前端：Vue3 + TypeScript，展示任务状态、阶段时间线、进度条。
- 接口：Fetch API，OpenAPI / Contracts 统一请求与响应类型。
- 后端：Express + TypeScript，Zod 参数校验。
- 编排：JobsIntelligenceService 创建任务、执行流水线、更新状态。
- 存储：PostgreSQL Repository Adapter 存储清洗数据和画像结果。
- 智能生成：Pi Agent 输出结构化岗位画像。
- 稳定性：任务流水线和失败重试队列处理异常任务。

Visual element:
- 右侧技术栈卡片。

Text labels:
- Vue3 + TypeScript
- Fetch API
- OpenAPI / Contracts
- Express + Zod
- JobsIntelligenceService
- PostgreSQL Adapter
- Pi Agent
- 失败重试

## Section 3: 输出结果

Key concept: 岗位画像成为后续模块的数据资产。

Content:
- 标准岗位画像：岗位名称、分类、技能、证书、创新、学习、抗压、沟通、经验。
- 后续使用：岗位画像中心、学生岗位匹配、路径图谱、职业报告。

Visual element:
- 底部结果卡片。

Text labels:
- 标准岗位画像
- 支撑匹配分析
- 支撑路径图谱
- 支撑职业报告

## Summary

该模块不是简单导入数据，而是通过任务流水线、Agent 生成和结构化入库，把原始岗位表沉淀为系统后续匹配、图谱和报告的基础资产。
