# Analysis

- Topic: 数据处理到岗位画像生成。
- Data type: 技术流程、架构子链路、功能实现拆解。
- Complexity: 中高，涉及前端展示、接口契约、后端服务、Agent 调用、数据库写入、任务重试。
- Audience: 大学生创新创业大赛评委、项目答辩听众。
- Tone: 技术可信、具体、避免泛泛而谈。
- Language: zh。
- Recommended layout: linear-progression。
- Recommended style: technical-schematic。
- Aspect: 16:9 landscape。

## Visual Strategy

使用“左到右流程图 + 右侧技术栈说明 + 底部结果价值”的结构：

1. 顶部：标题和副标题。
2. 中央主流程：六个阶段节点。
   - 原始岗位数据
   - 清洗归一
   - 统计摘要
   - Pi Agent 生成
   - 画像入库
   - 漫画化展示
3. 每个阶段下方放“技术实现标签”。
4. 右侧放“关键技术栈”卡片。
5. 底部放“为什么这样设计”的总结。

## Key Messages

- 前端负责启动与可视化反馈。
- 后端通过 Express + Zod + Service 编排流水线。
- Contracts 保证接口字段一致。
- Repository Adapter 解耦 PostgreSQL 存储。
- Pi Agent 基于统计摘要生成结构化岗位画像。
- 失败重试保障长任务稳定执行。
