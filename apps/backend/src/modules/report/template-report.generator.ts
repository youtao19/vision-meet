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
  career_path: "职业目标与路径规划",
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

  return [`本次分析围绕四个维度展开：${formatDimensionScores(input)}。`, ...explanations].join(
    "\n",
  );
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

  return [...gapLines, `优先改进动作：${input.match.suggestions.join("；")}。`].join("\n");
}

function buildShortTermPlan(input: ReportGeneratorInput): string {
  const topSuggestions = input.match.suggestions.slice(0, 3);
  const fallback = ["围绕目标岗位补齐至少 1 个可展示项目", "将薄弱维度转化为可验证成果"];
  const actions = topSuggestions.length > 0 ? topSuggestions : fallback;

  return actions.map((action, index) => `${index + 1}. ${action}`).join("\n");
}

function buildCareerPath(input: ReportGeneratorInput): string {
  if (!input.career_path) {
    return [
      `当前岗位【${input.job.title}】尚未命中可用图谱，暂无法输出结构化路径图。`,
      `建议先围绕目标岗位继续沉淀项目、实习与技能证据，待岗位进入图谱覆盖范围后再查看推荐路径。`,
    ].join("\n");
  }

  const promotionLines = input.career_path.promotion_routes.slice(0, 2).map((route, index) => {
    const required = route.steps
      .flatMap((step) => step.required_skills || [])
      .filter(Boolean)
      .slice(0, 4)
      .join("、");
    return `${index + 1}. ${route.title}；适配度 ${route.suitability_score} 分；${route.summary}${required ? `；关键技能：${required}` : ""}`;
  });
  const transitionLines = input.career_path.transition_routes.slice(0, 2).map((route, index) => {
    const required = route.steps
      .flatMap((step) => step.required_skills || [])
      .filter(Boolean)
      .slice(0, 4)
      .join("、");
    return `${index + 1}. ${route.title}；适配度 ${route.suitability_score} 分；${route.summary}${required ? `；关键技能：${required}` : ""}`;
  });

  // 当前图谱不再暴露 canonical_role，直接退回岗位标题，避免报告标题缺失。
  const anchorTitle = input.career_path.canonical_role_title ?? input.job.title;
  return [
    `当前岗位已映射到岗位画像【${anchorTitle}】，图谱深度 ${input.career_path.depth}。`,
    `优先晋升路径：${promotionLines.length > 0 ? promotionLines.join("\n") : "当前暂无更高阶晋升路径，建议先巩固岗位核心能力。"}。`,
    `可选换岗路径：${transitionLines.length > 0 ? transitionLines.join("\n") : "当前暂无推荐换岗路径。"}。`,
  ].join("\n");
}

/**
 * 作用：统一收敛报告证据来源，确保匹配证据与路径证据都可被报告直接引用。
 */
function buildReportEvidenceRefs(input: ReportGeneratorInput): string[] {
  const baseEvidence = input.match.evidence_refs || [];
  const gapEvidence = input.match.gaps.flatMap((item) => item.evidence);
  const routeEvidence = input.career_path
    ? [
        ...input.career_path.promotion_routes.flatMap((route) => route.missing_skills || []),
        ...input.career_path.transition_routes.flatMap((route) => route.missing_skills || []),
      ].map((item) => `路径技能差距：${item}`)
    : [];

  return Array.from(new Set([...baseEvidence, ...gapEvidence, ...routeEvidence])).slice(0, 16);
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
    async generate(input: ReportGeneratorInput) {
      const shortTermPlan = buildShortTermPlan(input).split("\n").filter(Boolean);
      const midTermPlan = buildMidTermPlan(input).split("\n").filter(Boolean);
      return {
        mode: "template" as const,
        sections: [
          createSection("overview", buildOverview(input)),
          createSection("match_analysis", buildMatchAnalysis(input)),
          createSection("strengths", buildStrengths(input)),
          createSection("gaps_and_actions", buildGapsAndActions(input)),
          createSection("career_path", buildCareerPath(input)),
          createSection("short_term_plan", buildShortTermPlan(input)),
          createSection("mid_term_plan", buildMidTermPlan(input)),
        ],
        evidence_refs: buildReportEvidenceRefs(input),
        action_plan: {
          short_term: shortTermPlan,
          mid_term: midTermPlan,
        },
      };
    },
  };
}
