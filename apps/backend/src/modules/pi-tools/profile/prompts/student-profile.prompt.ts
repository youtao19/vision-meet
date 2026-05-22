import type { CreateStudentProfileFromResumeRequest } from "@career/contracts/types";

import type { ResumeRaw } from "../parse-resume-profile.parser.js";

export const STUDENT_PROFILE_SYSTEM_PROMPT =
  "你是 Career Agent 的学生画像生成器，只根据 ResumeRaw 生成学生画像草稿 JSON。";

export function buildStudentProfilePrompt(params: {
  resumeRaw: ResumeRaw;
  input: CreateStudentProfileFromResumeRequest;
}): string {
  return [
    "任务：",
    "把 ResumeRaw 转成 StudentProfileDraft。",
    "",
    "边界：",
    "1. 只能基于 ResumeRaw 中已有事实生成画像。",
    "2. 可以基于技能、项目和教育做有限画像判断。",
    "3. 不允许补造 ResumeRaw 没有的学校、专业、证书、项目和成果。",
    "4. target_role 只在用户明确填写或 ResumeRaw 明确出现求职意向时填写；否则返回空字符串。",
    "5. preferred_industries 只能在 ResumeRaw 有明确行业信号时填写；否则返回空数组。",
    "6. self_assessment 必须给 1-5 整数，依据 ResumeRaw 里的项目复杂度和表述保守估计。",
    "7. summary 必须是画像摘要，不要超过 300 字。",
    "8. 输出必须是合法 JSON，不允许输出 Markdown。",
    "",
    "Skill Normalize：",
    "- Vue.js -> Vue3",
    "- JS -> JavaScript",
    "- TS -> TypeScript",
    "- Node -> Node.js",
    "- Postgres -> PostgreSQL",
    "",
    "字段要求：",
    "- experiences 来源于 ResumeRaw.projects 和 ResumeRaw.competitions。",
    "- projects 映射为 kind=project。",
    "- competitions 映射为 kind=competition。",
    "- responsibilities、outcomes、tech_stack 必须保持数组。",
    "- evidences 只引用画像主体字段，不要写入手机号、邮箱、QQ、微信、身份证。",
    "- evaluation 只输出 warnings；完整度、竞争力和 dimension_scores 由后端 service 计算。",
    "",
    "输出 Schema：",
    JSON.stringify(
      {
        basic_info: { name: "string" },
        preference: {
          target_role: "string",
          preferred_cities: ["string"],
          preferred_industries: ["string"],
        },
        education: {
          school: "string | null",
          level: "string | null",
          major: "string | null",
          graduation_year: 2027,
          evidence_refs: ["string"],
        },
        skills: [
          {
            name: "string",
            category: "frontend | backend | data | ai | testing | tooling | soft | other",
            level: 3,
            evidence_refs: ["string"],
          },
        ],
        certificates: [
          {
            name: "string",
            issuer: "string | null",
            acquired_at: "string | null",
            evidence_refs: ["string"],
          },
        ],
        experiences: [
          {
            kind: "project | internship | competition",
            title: "string",
            organization: "string | null",
            role: "string | null",
            period: "string | null",
            tech_stack: ["string"],
            responsibilities: ["string"],
            outcomes: ["string"],
            evidence_refs: ["string"],
          },
        ],
        self_assessment: {
          communication: 3,
          learning: 3,
          stress_tolerance: 3,
          innovation: 3,
        },
        evidences: [
          {
            id: "ev-1",
            source: "resume_text",
            field_path: "string",
            quote: "string",
            confidence: 0.95,
          },
        ],
        summary: "string",
        confidence: 0.9,
        warnings: ["string"],
      },
      null,
      2,
    ),
    "",
    params.input.target_role
      ? `用户填写的目标岗位候选：${params.input.target_role}`
      : "用户未填写目标岗位候选。",
    params.input.name ? `用户填写的姓名候选：${params.input.name}` : "",
    "",
    "ResumeRaw：",
    JSON.stringify(params.resumeRaw, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}
