import type { CareerReportSection, CareerReportSectionKey } from "@career/contracts/types";

export const REPORT_SECTION_ORDER = [
  "overview",
  "match_analysis",
  "job_recommendations",
  "strengths",
  "gaps_and_actions",
  "career_path",
  "short_term_plan",
  "mid_term_plan",
] as const satisfies CareerReportSectionKey[];

export const REPORT_SECTION_TITLES: Record<CareerReportSectionKey, string> = {
  overview: "报告摘要",
  match_analysis: "匹配分析",
  job_recommendations: "岗位推荐",
  strengths: "优势总结",
  gaps_and_actions: "差距与改进动作",
  career_path: "职业目标与路径规划",
  short_term_plan: "短期行动计划",
  mid_term_plan: "中期行动计划",
};

export function createLegacyReportSection(key: CareerReportSectionKey): CareerReportSection {
  return {
    key,
    title: REPORT_SECTION_TITLES[key],
    content: "当前报告版本尚未包含该章节，请重新生成报告版本以获得完整内容。",
  };
}
