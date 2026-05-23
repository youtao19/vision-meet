import type {
  DimensionKey,
  JobProfileV2Record,
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

export function buildV2SoftSkills(profile: JobProfileV2Record): string[] {
  const candidates: Array<{ label: string; score: number }> = [
    { label: "沟通", score: profile.communication_score },
    { label: "学习能力", score: profile.learning_score },
    { label: "抗压", score: profile.stress_tolerance_score },
    { label: "创新", score: profile.innovation_score },
    { label: "实践", score: profile.internship_score },
  ];

  const selected = candidates
    .filter((item) => item.score >= 55)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.label);

  return selected.length > 0 ? selected : ["沟通", "学习能力", "抗压"];
}

export function mapV2ProfileToMatchingSnapshot(
  profile: JobProfileV2Record,
): MatchingJobProfileSnapshot {
  return {
    profile_version: profile.profile_version,
    hard_skills: profile.professional_skills,
    certificates: profile.certificate_requirements,
    soft_skills: buildV2SoftSkills(profile),
    skill_weights: {
      基础要求: 0.2,
      职业技能: 0.45,
      职业素养: 0.2,
      发展潜力: 0.15,
    },
    confidence: profile.confidence,
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

export function buildFallbackJobProfileSnapshot(jobTitle: string): MatchingJobProfileSnapshot {
  const title = jobTitle.toLowerCase();
  if (title.includes("c/c++") || title.includes("c++")) {
    return {
      profile_version: 0,
      hard_skills: ["C/C++", "Linux", "多线程", "网络编程", "数据结构与算法"],
      certificates: ["无强制证书要求"],
      soft_skills: ["沟通", "学习能力", "抗压"],
      skill_weights: { 基础要求: 0.2, 职业技能: 0.5, 职业素养: 0.15, 发展潜力: 0.15 },
      confidence: 0.75,
    };
  }
  if (title.includes("java")) {
    return {
      profile_version: 0,
      hard_skills: ["Java", "Spring", "MySQL", "微服务", "Git"],
      certificates: ["无强制证书要求"],
      soft_skills: ["沟通", "学习能力", "抗压"],
      skill_weights: { 基础要求: 0.2, 职业技能: 0.45, 职业素养: 0.2, 发展潜力: 0.15 },
      confidence: 0.75,
    };
  }
  if (title.includes("前端")) {
    return {
      profile_version: 0,
      hard_skills: ["JavaScript", "TypeScript", "Vue", "HTML/CSS", "前端工程化"],
      certificates: ["无强制证书要求"],
      soft_skills: ["沟通", "学习能力", "创新"],
      skill_weights: { 基础要求: 0.2, 职业技能: 0.45, 职业素养: 0.2, 发展潜力: 0.15 },
      confidence: 0.72,
    };
  }
  if (title.includes("测试")) {
    return {
      profile_version: 0,
      hard_skills: ["测试用例设计", "接口测试", "缺陷定位", "SQL"],
      certificates: ["无强制证书要求"],
      soft_skills: ["沟通", "学习能力", "抗压"],
      skill_weights: { 基础要求: 0.2, 职业技能: 0.45, 职业素养: 0.2, 发展潜力: 0.15 },
      confidence: 0.7,
    };
  }
  if (title.includes("实施") || title.includes("支持")) {
    return {
      profile_version: 0,
      hard_skills: ["系统部署", "问题排查", "客户沟通", "文档能力"],
      certificates: ["无强制证书要求"],
      soft_skills: ["沟通", "抗压", "学习能力"],
      skill_weights: { 基础要求: 0.2, 职业技能: 0.4, 职业素养: 0.25, 发展潜力: 0.15 },
      confidence: 0.68,
    };
  }
  return {
    profile_version: 0,
    hard_skills: ["岗位核心技能", "业务理解", "协作能力"],
    certificates: ["无强制证书要求"],
    soft_skills: ["沟通", "学习能力", "抗压"],
    skill_weights: { 基础要求: 0.2, 职业技能: 0.45, 职业素养: 0.2, 发展潜力: 0.15 },
    confidence: 0.65,
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
