import type {
  DimensionKey,
  DimensionScores,
  MatchRequirementScore,
  MatchResultLevel,
} from "@career/contracts/types";

import type { StudentMatchSnapshot } from "./matching.student-snapshot.js";

const DIMENSION_ORDER: DimensionKey[] = [
  "base_requirements",
  "professional_skills",
  "professional_quality",
  "development_potential",
];

const DEFAULT_DIMENSION_WEIGHTS: DimensionScores = {
  base_requirements: 0.2,
  professional_skills: 0.45,
  professional_quality: 0.2,
  development_potential: 0.15,
};

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundTo3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function resolveDimensionWeights(skillWeights: Record<string, number>): DimensionScores {
  const merged: DimensionScores = {
    ...DEFAULT_DIMENSION_WEIGHTS,
    base_requirements: skillWeights["基础要求"] ?? DEFAULT_DIMENSION_WEIGHTS.base_requirements,
    professional_skills: skillWeights["职业技能"] ?? DEFAULT_DIMENSION_WEIGHTS.professional_skills,
    professional_quality:
      skillWeights["职业素养"] ?? DEFAULT_DIMENSION_WEIGHTS.professional_quality,
    development_potential:
      skillWeights["发展潜力"] ?? DEFAULT_DIMENSION_WEIGHTS.development_potential,
  };

  const total = DIMENSION_ORDER.reduce((sum, key) => sum + merged[key], 0);
  if (total <= 0) {
    return DEFAULT_DIMENSION_WEIGHTS;
  }

  return {
    base_requirements: roundTo3(merged.base_requirements / total),
    professional_skills: roundTo3(merged.professional_skills / total),
    professional_quality: roundTo3(merged.professional_quality / total),
    development_potential: roundTo3(merged.development_potential / total),
  };
}

function aggregateDimension(scores: MatchRequirementScore[], dimension: DimensionKey): number {
  const items = scores.filter((item) => item.dimension === dimension);
  if (items.length === 0) {
    return 70;
  }

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    return 0;
  }

  const weighted = items.reduce((sum, item) => sum + item.score * item.weight, 0);
  return clampScore(weighted / totalWeight);
}

export function aggregateDimensionScores(scores: MatchRequirementScore[]): DimensionScores {
  return {
    base_requirements: aggregateDimension(scores, "base_requirements"),
    professional_skills: aggregateDimension(scores, "professional_skills"),
    professional_quality: aggregateDimension(scores, "professional_quality"),
    development_potential: aggregateDimension(scores, "development_potential"),
  };
}

export function calculateTotalScore(
  dimensionScores: DimensionScores,
  weights: DimensionScores,
): number {
  return clampScore(
    dimensionScores.base_requirements * weights.base_requirements +
      dimensionScores.professional_skills * weights.professional_skills +
      dimensionScores.professional_quality * weights.professional_quality +
      dimensionScores.development_potential * weights.development_potential,
  );
}

export function calculateEvidenceCoverage(scores: MatchRequirementScore[]): number {
  if (scores.length === 0) {
    return 0;
  }

  const matched = scores.filter((item) => item.matched).length;
  return clampScore((matched / scores.length) * 100);
}

export function calculateConfidence(params: {
  student: StudentMatchSnapshot;
  jobProfileConfidence: number;
  evidenceCoverage: number;
  usedFallbackProfile: boolean;
}): number {
  const fallbackPenalty = params.usedFallbackProfile ? 0.75 : 1;
  const confidence =
    (params.student.completeness_score / 100) * 0.32 +
    params.student.source_confidence * 0.18 +
    params.jobProfileConfidence * 0.3 +
    (params.evidenceCoverage / 100) * 0.2;

  return Math.max(0, Math.min(1, Math.round(confidence * fallbackPenalty * 100) / 100));
}

export function resolveMatchLevel(totalScore: number): MatchResultLevel {
  if (totalScore >= 85) return "highly_matched";
  if (totalScore >= 75) return "matched";
  if (totalScore >= 60) return "basic_match";
  return "needs_improvement";
}
