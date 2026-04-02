import type {
  CareerReportSection,
  CareerReportSectionKey,
  DimensionKey,
} from "@career/contracts/types";

import type { ReportGenerator, ReportGeneratorInput } from "./report.generator.js";

const SECTION_TITLES: Record<CareerReportSectionKey, string> = {
  overview: "报告摘要",
  match_analysis: "匹配分析",
  strengths: "优势总结",
  gaps_and_actions: "差距与改进动作",
  short_term_plan: "短期行动计划",
  mid_term_plan: "中期行动计划",
};

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  base_requirements: "基础要求",
  professional_skills: "职业技能",
  professional_quality: "职业素养",
  development_potential: "发展潜力",
};

function resolveScoreLevel(totalScore: number): string {
  if (totalScore >= 85) {
    return "整体匹配度较高";
  }
  if (totalScore >= 70) {
    return "整体匹配度良好";
  }
  if (totalScore >= 60) {
    return "当前具备基础匹配条件，但仍需补齐关键短板";
  }
  return "当前与目标岗位仍存在明显差距，需要优先补齐核心能力";
}

function formatDimensionScores(input: ReportGeneratorInput): string {
  const lines = Object.entries(input.match.dimension_scores).map(([key, value]) => {
    const label = DIMENSION_LABELS[key as DimensionKey];
    return `${label} ${value} 分`;
  });

  return lines.join("；");
}

function buildOverview(input: ReportGeneratorInput): string {
  const profileSummary = input.profile.summary || "当前已生成结构化学生画像。";
  const scoreLevel = resolveScoreLevel(input.match.total_score);

  return [
    `${input.profile.name} 当前面向【${input.job.title}】的综合匹配得分为 ${input.match.total_score} 分，${scoreLevel}。`,
    `画像摘要：${profileSummary}`,
    `本报告基于既有匹配结果生成，便于后续持续编辑和版本化沉淀。`,
  ].join("\n");
}

function buildMatchAnalysis(input: ReportGeneratorInput): string {
  const explanations = input.match.explanations.map((item) => {
    const label = DIMENSION_LABELS[item.dimension];
    return `${label}：${item.reasoning}`;
  });

  return [
    `本次分析围绕四个维度展开：${formatDimensionScores(input)}。`,
    ...explanations,
  ].join("\n");
}

function buildStrengths(input: ReportGeneratorInput): string {
  const strongestDimensions = Object.entries(input.match.dimension_scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key, value]) => `${DIMENSION_LABELS[key as DimensionKey]} ${value} 分`);

  const skillPreview = input.profile.skills.slice(0, 5).join("、") || "暂无明确技能标签";
  const certificatePreview = input.profile.certificates.slice(0, 3).join("、") || "暂无证书项";

  return [
    `当前表现较强的维度为：${strongestDimensions.join("；")}。`,
    `已识别的技能亮点：${skillPreview}。`,
    `证书与补充资质：${certificatePreview}。`,
  ].join("\n");
}

function buildGapsAndActions(input: ReportGeneratorInput): string {
  const gapLines = input.match.gaps.map((gap) => {
    const label = DIMENSION_LABELS[gap.dimension];
    const evidence = gap.evidence.join("；");
    return `${label}：当前 ${gap.current_score} / 目标 ${gap.target_score}，差距 ${gap.gap}。依据：${evidence}`;
  });

  return [
    ...gapLines,
    `优先改进动作：${input.match.suggestions.join("；")}。`,
  ].join("\n");
}

function buildShortTermPlan(input: ReportGeneratorInput): string {
  const topSuggestions = input.match.suggestions.slice(0, 3);
  const fallback = ["围绕目标岗位补齐至少 1 个可展示项目", "将薄弱维度转化为可验证成果"];
  const actions = topSuggestions.length > 0 ? topSuggestions : fallback;

  return actions
    .map((action, index) => `${index + 1}. ${action}`)
    .join("\n");
}

function buildMidTermPlan(input: ReportGeneratorInput): string {
  const weakestDimensions = Object.entries(input.match.dimension_scores)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([key]) => DIMENSION_LABELS[key as DimensionKey]);

  return [
    `未来 1-2 个阶段应持续围绕 ${weakestDimensions.join("、")} 建立长期积累。`,
    `建议把学习成果沉淀为项目作品、实习经历或竞赛成果，并在每个阶段结束后重新发起匹配复测。`,
    `若目标岗位要求发生变化，应同步更新学生画像与匹配结果，确保报告结论保持有效。`,
  ].join("\n");
}

function createSection(key: CareerReportSectionKey, content: string): CareerReportSection {
  return {
    key,
    title: SECTION_TITLES[key],
    content,
  };
}

/**
 * 文件作用：提供当前 MVP 使用的规则模板报告生成器。
 * 设计原因：先保证输出稳定、可解释和可编辑，为后续 LLM 生成器预留统一接口。
 */
export function createTemplateReportGenerator(): ReportGenerator {
  return {
    generate(input: ReportGeneratorInput): CareerReportSection[] {
      return [
        createSection("overview", buildOverview(input)),
        createSection("match_analysis", buildMatchAnalysis(input)),
        createSection("strengths", buildStrengths(input)),
        createSection("gaps_and_actions", buildGapsAndActions(input)),
        createSection("short_term_plan", buildShortTermPlan(input)),
        createSection("mid_term_plan", buildMidTermPlan(input)),
      ];
    },
  };
}
