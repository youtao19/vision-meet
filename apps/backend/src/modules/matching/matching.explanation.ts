import type {
  DimensionKey,
  MatchExplanationItem,
  MatchGapItem,
  MatchRequirementScore,
} from "@career/contracts/types";

const DIMENSION_ORDER: DimensionKey[] = [
  "base_requirements",
  "professional_skills",
  "professional_quality",
  "development_potential",
];

function dimensionLabel(dimension: DimensionKey): string {
  switch (dimension) {
    case "base_requirements":
      return "基础要求";
    case "professional_skills":
      return "职业技能";
    case "professional_quality":
      return "职业素养";
    case "development_potential":
      return "发展潜力";
  }
}

function actionByDimension(dimension: DimensionKey): string[] {
  switch (dimension) {
    case "base_requirements":
      return ["补齐教育背景、证书和实习证明", "把基础门槛证据写进画像"];
    case "professional_skills":
      return ["围绕必备技能补 2-3 个项目证据", "在项目描述里写清技术栈、职责和结果"];
    case "professional_quality":
      return ["准备沟通协作和抗压相关 STAR 案例", "补充团队协作或交付复盘证据"];
    case "development_potential":
      return ["补充学习路线、竞赛、开源或持续迭代成果", "把成长型项目沉淀为可验证作品"];
  }
}

function buildDimensionEvidence(items: MatchRequirementScore[]): string[] {
  const matched = items.filter((item) => item.matched).map((item) => item.label);
  const weak = items.filter((item) => !item.matched).map((item) => item.label);
  const result: string[] = [];
  if (matched.length > 0) {
    result.push(`已命中要求：${matched.slice(0, 4).join("、")}`);
  }
  if (weak.length > 0) {
    result.push(`待补齐要求：${weak.slice(0, 4).join("、")}`);
  }
  return result.length > 0 ? result : ["暂无明确证据"];
}

export function buildMatchExplanation(params: {
  requirementScores: MatchRequirementScore[];
  evidenceCoverage: number;
  algorithmVersion: string;
}): {
  gaps: MatchGapItem[];
  explanations: MatchExplanationItem[];
  suggestions: string[];
  evidenceRefs: string[];
  blockingGaps: MatchRequirementScore[];
  matchedRequirements: MatchRequirementScore[];
  weakRequirements: MatchRequirementScore[];
} {
  const gaps: MatchGapItem[] = [];
  const explanations: MatchExplanationItem[] = [];
  const suggestionPool: string[] = [];

  for (const dimension of DIMENSION_ORDER) {
    const items = params.requirementScores.filter((item) => item.dimension === dimension);
    const weakItems = items.filter((item) => !item.matched);
    const currentScore =
      items.length > 0
        ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
        : 70;
    const targetScore = weakItems.some((item) => item.importance === "must") ? 85 : 75;
    const gap = Math.max(0, targetScore - currentScore);
    const evidence = buildDimensionEvidence(items);
    const actions = actionByDimension(dimension);

    if (gap > 0 || weakItems.length > 0) {
      gaps.push({
        dimension,
        target_score: targetScore,
        current_score: currentScore,
        gap,
        evidence,
      });
      suggestionPool.push(...actions);
    }

    explanations.push({
      dimension,
      reasoning: `${dimensionLabel(dimension)}当前逐项要求平均分 ${currentScore}，目标参考分 ${targetScore}。`,
      improvement_actions: actions,
      evidence_refs: evidence,
    });
  }

  const weakRequirements = params.requirementScores
    .filter((item) => !item.matched)
    .sort((left, right) => left.score - right.score);
  const blockingGaps = weakRequirements.filter((item) => item.importance === "must");
  const matchedRequirements = params.requirementScores
    .filter((item) => item.matched)
    .sort((left, right) => right.score - left.score);

  return {
    gaps:
      gaps.length > 0
        ? gaps
        : [
            {
              dimension: "professional_skills",
              target_score: 85,
              current_score: 85,
              gap: 0,
              evidence: ["核心要求已基本命中，建议继续巩固证据质量"],
            },
          ],
    explanations,
    suggestions: Array.from(new Set(suggestionPool)).slice(0, 4),
    evidenceRefs: Array.from(
      new Set([
        `匹配算法：${params.algorithmVersion}`,
        `要求项证据覆盖率：${params.evidenceCoverage}%`,
        ...params.requirementScores.flatMap((item) => item.evidence_refs),
      ]),
    ).slice(0, 16),
    blockingGaps,
    matchedRequirements: matchedRequirements.slice(0, 8),
    weakRequirements: weakRequirements.slice(0, 8),
  };
}
