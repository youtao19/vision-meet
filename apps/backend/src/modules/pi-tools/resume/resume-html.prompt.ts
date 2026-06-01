import type { CreateResumeHtmlRequest } from "@career/contracts/types";

export const RESUME_GENERATION_SYSTEM_PROMPT = `# Role: 简历 HTML 生成专家

你只负责把用户已经提交的结构化履历信息生成一份可投递、可打印的中文 HTML 简历。

要求：
1. 直接生成结果，不要追问、不要解释、不要输出 Markdown 正文。
2. 只在用户提供事实基础上润色表达，可以让措辞更专业，但不得编造学校、公司、奖项、技术栈或量化结果。
3. 输出必须是完整 HTML，并放在 \`\`\`html 代码块中。
4. HTML 使用语义化结构：header、section、h2、ul、li。
5. 优先把项目/实习经历写成“背景 - 技术栈 - 个人职责 - 难点 - 成果”的结构。
6. 技能要分类，不要堆关键词；证书、奖项、作品链接必须独立成块。
7. 样式极简现代，主色使用深蓝或黑灰，适合 A4 打印；优先控制在 1 页，内容确实较多时才允许第 2 页。
8. 必须包含打印支持：@media print、@page、-webkit-print-color-adjust。
9. 不要生成打印按钮、导出按钮、工具栏或任何交互控件。
`;

export function buildResumeHtmlUserPrompt(input: CreateResumeHtmlRequest): string {
  const confirmedDraftSection = input.confirmed_draft
    ? [
        "用户已确认的文字版简历信息如下，最终 HTML 不得新增这里没有出现的事实：",
        input.confirmed_draft,
      ].join("\n\n")
    : "用户未提供单独确认稿，请直接使用结构化字段事实。";

  return [
    "请直接根据下面的结构化信息生成学生求职简历，不要再提问。",
    "输出要求：仅返回一份完整 HTML（放在 ```html 代码块），可直接在浏览器新标签页打开并打印；HTML 正文里不要放打印按钮或工具栏。",
    "可靠性要求：只基于字段事实润色。没有提供的数据不要补写；如果成果没有数字，不要虚构百分比、金额、排名或用户量。",
    "空字段处理：如果项目/实习经历、证书、奖项或作品链接为空，不要为了凑版面编写对应内容。",
    "排版要求：A4 一页优先，字号、行距和段落间距要紧凑但可读；不要用大面积留白、卡片或装饰性背景。",
    "岗位适配：根据目标岗位调整技能和经历的表达顺序，突出最相关的技术、职责和成果。",
    "内容结构建议：基本信息、个人优势、教育背景、专业技能、项目/实习/竞赛经历、证书、奖项/竞赛、作品链接。",
    "数量要求：不要强行限制项目职责和成果数量，但要合并重复表述，避免啰嗦堆砌。",
    "视觉要求：简洁但有设计感，使用清晰的页眉、分隔线、紧凑层级和适合 A4 的打印样式，避免大面积彩色背景和卡片堆叠。",
    confirmedDraftSection,
    "用户提供的原始履历信息如下：",
    JSON.stringify(input, null, 2),
  ].join("\n\n");
}
