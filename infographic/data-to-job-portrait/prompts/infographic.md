Create a professional Chinese PPT infographic page following these specifications:

## Image Specifications

- Type: Infographic / PPT architecture detail page
- Layout: linear-progression
- Style: technical-schematic
- Aspect Ratio: 16:9
- Language: Simplified Chinese

## Page Title

数据处理到岗位画像生成

## Subtitle

从原始岗位表到可展示、可匹配、可复用的标准岗位资产

## Layout Guidelines

Use a clear left-to-right technical process diagram. This is one detailed subpage under the overall technical architecture page.

Main structure:
1. Top title area.
2. Center: six-step horizontal pipeline with arrows.
3. Under each step: concise implementation notes.
4. Right side: “关键技术栈” vertical card.
5. Bottom: “输出与价值” summary band.

Keep the slide readable. Use short labels, not long paragraphs.

## Style Guidelines

Technical schematic style:
- White background with subtle blue grid or faint circuit lines.
- Primary: deep blue #1450A3.
- Secondary: cyan #06B6D4.
- Accent: amber #F59E0B only for “Pi Agent”.
- Clean vector cards, thin arrow lines, consistent stroke weights.
- Professional competition defense PPT style.
- No cartoon characters. The “漫画化展示” step can use a small simple comic-frame icon only.
- Avoid complex gradients. Avoid tiny text.
- Chinese text must be crisp and readable.

## Main Pipeline

Create six connected stages:

1. 原始岗位数据
   Notes: 岗位表 / 名称 / 描述 / 公司 / 地点 / 薪资

2. 清洗归一
   Notes: 字段清洗 / 岗位名称归一 / 岗位族分类 / 关键词提取

3. 统计摘要
   Notes: 压缩全量明细 / 汇总岗位族 / 汇总高频关键词

4. Pi Agent 生成
   Notes: 生成 10 条岗位画像 JSON / 7 类能力维度

5. 画像入库
   Notes: PostgreSQL 写入 / 任务状态更新 / 结果可查询

6. 漫画化展示
   Notes: 岗位画像列表 / 漫画化岗位画像 / 前端可视化呈现

## Key Technology Stack Card

Title: 关键技术栈

Items:
- Vue3 + TypeScript：任务进度与阶段时间线
- Fetch API + Contracts：统一前后端接口字段
- Express + Zod：API 路由与参数校验
- JobsIntelligenceService：流水线业务编排
- PostgreSQL Adapter：清洗数据与画像结果存储
- Pi Agent：结构化岗位画像生成
- 失败重试队列：异常任务闭环处理

## Implementation Callout

Add a small callout near the Pi Agent stage:
“不直接塞入 1W 明细，而是先清洗并压缩为统计摘要，再交给 Agent 生成结构化画像。”

## Output and Value Band

Bottom band title: 输出与价值

Use three concise cards:
- 标准岗位画像：岗位名称、分类、技能、证书、能力维度
- 后续模块复用：岗位画像中心、匹配分析、路径图谱、职业报告
- 工程稳定性：任务状态追踪、失败记录、重试闭环

## Bottom Summary Text

“通过任务流水线、Agent 生成和结构化入库，把原始岗位表沉淀为系统后续匹配、图谱和报告的基础资产。”

## Text Labels

数据处理到岗位画像生成
从原始岗位表到可展示、可匹配、可复用的标准岗位资产
原始岗位数据
清洗归一
统计摘要
Pi Agent 生成
画像入库
漫画化展示
关键技术栈
Vue3 + TypeScript
Fetch API + Contracts
Express + Zod
JobsIntelligenceService
PostgreSQL Adapter
Pi Agent
失败重试队列
输出与价值
标准岗位画像
后续模块复用
工程稳定性
