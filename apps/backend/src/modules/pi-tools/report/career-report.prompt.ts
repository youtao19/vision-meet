import type { ReportGeneratorInput } from "../../report/report.generator.js";
import { REPORT_SECTION_ORDER, REPORT_SECTION_TITLES } from "../../report/report.sections.js";
import {
  getProfileCertificateNames,
  getProfileName,
  getProfileSkillNames,
} from "../../profile/profile.selectors.js";

export const CAREER_REPORT_SYSTEM_PROMPT = [
  "你是职业发展报告生成助手，只能依据用户提供的学生画像、岗位画像、人岗匹配结果和知识证据写报告。",
  "禁止编造学校、经历、证书、岗位、分数、证据或不存在的能力。",
  "必须输出一个 JSON 对象，不要输出 Markdown 代码块以外的解释文字。",
  "报告要中文、具体、可执行，避免空话。",
].join("\n");

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function compactProfile(input: ReportGeneratorInput) {
  return {
    id: input.profile.id,
    name: getProfileName(input.profile),
    summary: input.profile.summary,
    skills: getProfileSkillNames(input.profile),
    certificates: getProfileCertificateNames(input.profile),
    education: input.profile.education,
    experiences: input.profile.experiences.slice(0, 8),
    preference: input.profile.preference,
    evaluation: input.profile.evaluation,
  };
}

function compactMatch(input: ReportGeneratorInput) {
  return {
    id: input.match.id,
    total_score: input.match.total_score,
    dimension_scores: input.match.dimension_scores,
    level: input.match.level,
    confidence: input.match.confidence,
    explanations: input.match.explanations,
    gaps: input.match.gaps,
    suggestions: input.match.suggestions,
    evidence_refs: input.match.evidence_refs,
    requirement_scores: input.match.requirement_scores.slice(0, 12),
    blocking_gaps: input.match.blocking_gaps.slice(0, 6),
    matched_requirements: input.match.matched_requirements.slice(0, 6),
    weak_requirements: input.match.weak_requirements.slice(0, 6),
  };
}

export function buildCareerReportUserPrompt(input: ReportGeneratorInput): string {
  const sectionSpec = REPORT_SECTION_ORDER.map((key) => ({
    key,
    title: REPORT_SECTION_TITLES[key],
  }));

  return [
    "请基于以下上下文生成职业发展评估报告。",
    "",
    "输出要求：",
    "1. 只输出一个 JSON 对象。",
    "2. sections 必须且只能包含 8 个章节，key 和 title 必须与 section_spec 完全一致。",
    "3. 每个章节 content 控制在 120-220 字，内容要具体、可执行。",
    "4. job_recommendations 章节必须说明优先推荐岗位、可拓展岗位方向和投递策略。",
    "5. career_path 章节回答长期路径，不要和岗位推荐混在一起。",
    "6. evidence_refs 只能引用输入中已有证据。",
    "7. action_plan.short_term 与 action_plan.mid_term 必须和对应章节一致。",
    "",
    "JSON 结构：",
    toJson({
      sections: sectionSpec.map((section) => ({
        key: section.key,
        title: section.title,
        content: "章节正文",
      })),
      evidence_refs: ["证据来源"],
      action_plan: {
        short_term: ["0-3 个月行动"],
        mid_term: ["3-12 个月行动"],
      },
    }),
    "",
    "section_spec：",
    toJson(sectionSpec),
    "",
    "学生画像：",
    toJson(compactProfile(input)),
    "",
    "目标岗位画像：",
    toJson(input.job),
    "",
    "人岗匹配结果：",
    toJson(compactMatch(input)),
    "",
    "职业路径上下文：",
    toJson(input.career_path ?? null),
    "",
    "知识库证据：",
    toJson(input.knowledge_hits ?? []),
    "",
    "Agent 摘要：",
    input.agent_summary || "无",
  ].join("\n");
}
