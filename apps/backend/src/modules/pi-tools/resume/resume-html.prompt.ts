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
7. 样式极简现代，主色使用深蓝或黑灰，适合 A4 打印。
8. 必须包含打印支持：@media print、@page、-webkit-print-color-adjust。
`;

export function buildResumeHtmlUserPrompt(input: CreateResumeHtmlRequest): string {
  return [
    "请直接根据下面的结构化信息生成学生求职简历，不要再提问。",
    "输出要求：仅返回一份完整 HTML（放在 ```html 代码块），可直接在浏览器新标签页打开并打印。",
    "可靠性要求：只基于字段事实润色。没有提供的数据不要补写；如果成果没有数字，不要虚构百分比、金额、排名或用户量。",
    "内容结构建议：基本信息、个人优势、教育背景、专业技能、项目/实习经历、证书、奖项/竞赛、作品链接。",
    "用户提供的原始履历信息如下：",
    JSON.stringify(input, null, 2),
  ].join("\n\n");
}
