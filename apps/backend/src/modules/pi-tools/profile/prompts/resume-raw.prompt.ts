import type { CreateStudentProfileFromResumeRequest } from "@career/contracts/types";

export const RESUME_RAW_SYSTEM_PROMPT =
  "你是 Career Agent 的 Resume Parser，只负责从简历中提取结构化事实信息。";

export function buildResumeRawExtractionPrompt(
  input: CreateStudentProfileFromResumeRequest,
): string {
  return [
    "任务：",
    "从简历中提取结构化 ResumeRaw 数据。",
    "",
    "要求：",
    "1. 只提取简历中明确存在的信息。",
    "2. 不允许推断。",
    "3. 不允许评分。",
    "4. 不允许生成总结。",
    "5. 不允许编造。",
    "6. 输出必须是合法 JSON。",
    "7. 不允许输出 Markdown。",
    "",
    "字段要求：",
    "- basic_info: 仅包含基础身份信息。",
    "- education: 仅提取教育经历。",
    "- skills: 技能必须拆分。",
    "- projects: 项目必须结构化。",
    "- responsibilities 必须是数组。",
    "- outcomes 必须是数组。",
    "- tech_stack 必须是数组。",
    "",
    "禁止：",
    "- 禁止生成 self_assessment。",
    "- 禁止生成 evaluation。",
    "- 禁止生成 competitiveness_score。",
    "- 禁止生成 summary。",
    "- 禁止推断 preferred_industries。",
    "- 禁止推断 target_role。",
    "",
    "Few-shot 示例：",
    "输入：",
    "酒店管理系统（全栈开发）",
    "Vue3 + Node.js + PostgreSQL",
    "负责订单、房态、账单模块开发。",
    "",
    "输出片段：",
    JSON.stringify(
      {
        projects: [
          {
            name: "酒店管理系统",
            role: "全栈开发",
            description: null,
            tech_stack: ["Vue3", "Node.js", "PostgreSQL"],
            responsibilities: ["负责订单、房态、账单模块开发"],
            outcomes: [],
          },
        ],
      },
      null,
      2,
    ),
    "",
    "输出 Schema：",
    JSON.stringify(
      {
        basic_info: {
          name: "string | null",
          phone: "string | null",
          email: "string | null",
          github: "string | null",
        },
        education: [
          {
            school: "string | null",
            major: "string | null",
            degree: "string | null",
            start_year: 2023,
            end_year: 2027,
          },
        ],
        skills: [
          {
            name: "string",
            category: "frontend | backend | data | ai | testing | tooling | soft | other",
          },
        ],
        projects: [
          {
            name: "string",
            role: "string | null",
            description: "string | null",
            tech_stack: ["string"],
            responsibilities: ["string"],
            outcomes: ["string"],
          },
        ],
        certificates: [],
        competitions: [],
      },
      null,
      2,
    ),
    "",
    input.name ? `用户填写的姓名候选：${input.name}` : "",
    `简历图片共 ${input.file_images?.length ?? 0} 页，请按页面顺序完整阅读。`,
  ]
    .filter(Boolean)
    .join("\n");
}
