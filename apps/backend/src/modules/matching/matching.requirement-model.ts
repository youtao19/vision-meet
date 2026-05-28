import type {
  DimensionKey,
  ManualJobPortraitRecord,
  MatchRequirement,
  MatchRequirementEvidenceType,
  MatchRequirementImportance,
} from "@career/contracts/types";

export type MatchingJobProfileSnapshot = {
  profile_version: number;
  hard_skills: string[];
  certificates: string[];
  soft_skills: string[];
  skill_weights: Record<string, number>;
  confidence: number;
};

function sanitizeLabel(value: string): string {
  return value.trim();
}

function requirementId(prefix: string, label: string, index: number): string {
  return `${prefix}-${index + 1}-${label.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")}`;
}

function importanceWeight(importance: MatchRequirementImportance): number {
  if (importance === "must") return 1;
  if (importance === "important") return 0.72;
  return 0.45;
}

function createRequirement(params: {
  id: string;
  dimension: DimensionKey;
  label: string;
  category: MatchRequirement["category"];
  importance: MatchRequirementImportance;
  expectedLevel: number;
  evidenceTypes: MatchRequirementEvidenceType[];
}): MatchRequirement {
  return {
    id: params.id,
    dimension: params.dimension,
    label: params.label,
    category: params.category,
    importance: params.importance,
    expected_level: params.expectedLevel,
    weight: importanceWeight(params.importance),
    evidence_types: params.evidenceTypes,
  };
}

export function mapManualPortraitToMatchingSnapshot(
  portrait: ManualJobPortraitRecord,
): MatchingJobProfileSnapshot {
  const detail = portrait.profile_detail;
  return {
    profile_version: Math.floor(new Date(portrait.updated_at).getTime() / 1000),
    hard_skills: detail.skills,
    certificates: detail.certificates.length > 0 ? detail.certificates : ["无强制证书要求"],
    soft_skills: detail.softSkills.length > 0 ? detail.softSkills : ["沟通", "学习能力", "抗压"],
    skill_weights: {
      基础要求: 0.2,
      职业技能: 0.45,
      职业素养: 0.2,
      发展潜力: 0.15,
    },
    confidence: 0.9,
  };
}

export function buildMatchRequirements(snapshot: MatchingJobProfileSnapshot): MatchRequirement[] {
  const skillRequirements = snapshot.hard_skills
    .map(sanitizeLabel)
    .filter(Boolean)
    .map((label, index) =>
      createRequirement({
        id: requirementId("skill", label, index),
        dimension: "professional_skills",
        label,
        category: "skill",
        importance: index < 3 ? "must" : "important",
        expectedLevel: index < 3 ? 4 : 3,
        evidenceTypes: ["project", "internship"],
      }),
    );

  const certificateRequirements = snapshot.certificates
    .map(sanitizeLabel)
    .filter((label) => label && !label.includes("无强制证书要求"))
    .map((label, index) =>
      createRequirement({
        id: requirementId("certificate", label, index),
        dimension: "base_requirements",
        label,
        category: "certificate",
        importance: "important",
        expectedLevel: 3,
        evidenceTypes: ["certificate"],
      }),
    );

  const softRequirements = snapshot.soft_skills
    .map(sanitizeLabel)
    .filter(Boolean)
    .map((label, index) =>
      createRequirement({
        id: requirementId("quality", label, index),
        dimension: index === 0 ? "professional_quality" : "development_potential",
        label,
        category: "soft_quality",
        importance: index < 2 ? "important" : "bonus",
        expectedLevel: 3,
        evidenceTypes: ["self_assessment", "project", "internship"],
      }),
    );

  return [
    createRequirement({
      id: "base-education-1",
      dimension: "base_requirements",
      label: "教育背景",
      category: "education",
      importance: "important",
      expectedLevel: 3,
      evidenceTypes: ["education"],
    }),
    createRequirement({
      id: "base-experience-1",
      dimension: "base_requirements",
      label: "实习或项目经历",
      category: "experience",
      importance: "important",
      expectedLevel: 3,
      evidenceTypes: ["project", "internship"],
    }),
    ...certificateRequirements,
    ...skillRequirements,
    ...softRequirements,
  ];
}
