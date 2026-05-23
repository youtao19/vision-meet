import type { MatchRequirement, MatchRequirementScore } from "@career/contracts/types";

import type { StudentMatchSnapshot } from "./matching.student-snapshot.js";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeKeyword(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[（）()【】\[\]\s._-]+/g, "");
}

export function includesKeyword(source: string, target: string): boolean {
  const normalizedSource = normalizeKeyword(source);
  const normalizedTarget = normalizeKeyword(target);
  if (!normalizedSource || !normalizedTarget) {
    return false;
  }

  return normalizedSource.includes(normalizedTarget) || normalizedTarget.includes(normalizedSource);
}

function maxScore(scores: number[]): number {
  return scores.length > 0 ? Math.max(...scores) : 0;
}

function selfAssessmentScore(requirement: MatchRequirement, student: StudentMatchSnapshot): number {
  const label = requirement.label;
  if (includesKeyword(label, "沟通")) return student.self_assessment.communication * 20;
  if (includesKeyword(label, "抗压")) return student.self_assessment.stress_tolerance * 20;
  if (includesKeyword(label, "学习")) return student.self_assessment.learning * 20;
  if (includesKeyword(label, "创新")) return student.self_assessment.innovation * 20;
  if (includesKeyword(label, "实践")) {
    const hasExperience = student.experiences.some(
      (item) => item.kind === "project" || item.kind === "internship",
    );
    return hasExperience ? 80 : 45;
  }
  return 50;
}

function collectEvidenceRefs(refs: string[], fallback: string): string[] {
  const normalized = refs.map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : [fallback];
}

export function matchRequirementEvidence(
  requirement: MatchRequirement,
  student: StudentMatchSnapshot,
): MatchRequirementScore {
  const skillMatches = student.skills.filter((item) =>
    includesKeyword(item.name, requirement.label),
  );
  const certificateMatches = student.certificates.filter((item) =>
    includesKeyword(item.name, requirement.label),
  );
  const experienceMatches = student.experiences.filter(
    (item) =>
      includesKeyword(item.text, requirement.label) ||
      item.tech_stack.some((tech) => includesKeyword(tech, requirement.label)),
  );

  let semanticScore = 0;
  let levelScore = 0;
  let evidenceStrength = 0;
  let experienceScore = 0;
  let evidenceRefs: string[] = [];

  if (requirement.category === "skill") {
    semanticScore = skillMatches.length > 0 ? 100 : experienceMatches.length > 0 ? 72 : 0;
    const bestLevel = maxScore(skillMatches.map((item) => item.level));
    levelScore = bestLevel > 0 ? clampScore((bestLevel / requirement.expected_level) * 100) : 0;
    experienceScore =
      experienceMatches.length > 0 ? Math.min(100, 62 + experienceMatches.length * 12) : 0;
    evidenceStrength = clampScore(semanticScore * 0.45 + levelScore * 0.25 + experienceScore * 0.3);
    evidenceRefs = [
      ...skillMatches.flatMap((item) =>
        collectEvidenceRefs(item.evidence_refs, `技能命中：${item.name}`),
      ),
      ...experienceMatches.flatMap((item) =>
        collectEvidenceRefs(item.evidence_refs, `经历命中：${item.title}`),
      ),
    ];
  } else if (requirement.category === "certificate") {
    semanticScore = certificateMatches.length > 0 ? 100 : 0;
    levelScore = semanticScore;
    experienceScore = 0;
    evidenceStrength = semanticScore;
    evidenceRefs = certificateMatches.flatMap((item) =>
      collectEvidenceRefs(item.evidence_refs, `证书命中：${item.name}`),
    );
  } else if (requirement.category === "education") {
    semanticScore = student.education.level ? 86 : 0;
    levelScore = student.education.major ? 82 : 55;
    experienceScore = 0;
    evidenceStrength = student.education.graduation_year ? 86 : 68;
    evidenceRefs = collectEvidenceRefs(student.education.evidence_refs, "教育背景已填写");
  } else if (requirement.category === "experience") {
    const projectOrInternship = student.experiences.filter(
      (item) => item.kind === "project" || item.kind === "internship",
    );
    semanticScore =
      projectOrInternship.length > 0 ? Math.min(100, 62 + projectOrInternship.length * 12) : 0;
    levelScore = semanticScore;
    experienceScore = semanticScore;
    evidenceStrength = semanticScore;
    evidenceRefs = projectOrInternship.flatMap((item) =>
      collectEvidenceRefs(item.evidence_refs, `经历证明：${item.title}`),
    );
  } else {
    semanticScore = selfAssessmentScore(requirement, student);
    levelScore = semanticScore;
    experienceScore = student.experiences.length > 0 ? 72 : 45;
    evidenceStrength = clampScore(semanticScore * 0.72 + experienceScore * 0.28);
    evidenceRefs = [`${requirement.label}信号：${Math.round(semanticScore / 20)}/5`];
  }

  const score = clampScore(
    semanticScore * 0.35 + levelScore * 0.3 + evidenceStrength * 0.25 + experienceScore * 0.1,
  );
  const matched = score >= 70;

  return {
    ...requirement,
    score,
    matched,
    semantic_score: clampScore(semanticScore),
    level_score: clampScore(levelScore),
    evidence_strength: clampScore(evidenceStrength),
    experience_score: clampScore(experienceScore),
    evidence_refs: Array.from(new Set(evidenceRefs)).slice(0, 6),
    missing_reason: matched ? null : `缺少${requirement.label}的直接证据`,
  };
}

export function matchAllRequirements(
  requirements: MatchRequirement[],
  student: StudentMatchSnapshot,
): MatchRequirementScore[] {
  return requirements.map((requirement) => matchRequirementEvidence(requirement, student));
}
