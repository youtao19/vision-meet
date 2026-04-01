import type {
  CreateStudentProfileRequest,
  ListStudentProfilesResponse,
  StudentProfileDimensionScores,
  StudentProfileExperience,
  StudentProfileRecord,
  StudentProfileSelfAssessment,
} from "@career/contracts/types";

import type { ProfileRepository, StudentProfileCreateInput } from "./profile.repository.js";

export interface ProfileService {
  listProfiles(): ListStudentProfilesResponse;
  createProfile(input: CreateStudentProfileRequest): StudentProfileRecord;
}

const SCORE_WEIGHTS = {
  base_requirements: 0.2,
  professional_skills: 0.45,
  professional_quality: 0.2,
  development_potential: 0.15,
};

const DEFAULT_SELF_ASSESSMENT: StudentProfileSelfAssessment = {
  communication: 3,
  learning: 3,
  stress_tolerance: 3,
  innovation: 3,
};

const EMPTY_EXPERIENCE: StudentProfileExperience = {
  internship_count: 0,
  project_count: 0,
  competition_count: 0,
};

type MissingItemRule = {
  key: string;
  isMissing: boolean;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function levelToScore(level: number): number {
  return level * 20;
}

function uniqueNonEmpty(items: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  items.forEach((item) => {
    const normalized = item.trim();
    if (!normalized) {
      return;
    }
    const lowered = normalized.toLowerCase();
    if (seen.has(lowered)) {
      return;
    }
    seen.add(lowered);
    result.push(normalized);
  });
  return result;
}

function normalizeOptionalText(value?: string): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeExperience(
  input?: Partial<StudentProfileExperience>,
): StudentProfileExperience {
  return {
    internship_count: input?.internship_count ?? EMPTY_EXPERIENCE.internship_count,
    project_count: input?.project_count ?? EMPTY_EXPERIENCE.project_count,
    competition_count: input?.competition_count ?? EMPTY_EXPERIENCE.competition_count,
  };
}

function normalizeSelfAssessment(
  input?: Partial<StudentProfileSelfAssessment>,
): StudentProfileSelfAssessment {
  return {
    communication: input?.communication ?? DEFAULT_SELF_ASSESSMENT.communication,
    learning: input?.learning ?? DEFAULT_SELF_ASSESSMENT.learning,
    stress_tolerance: input?.stress_tolerance ?? DEFAULT_SELF_ASSESSMENT.stress_tolerance,
    innovation: input?.innovation ?? DEFAULT_SELF_ASSESSMENT.innovation,
  };
}

function calculateDimensionScores(params: {
  skills: string[];
  certificates: string[];
  experience: StudentProfileExperience;
  selfAssessment: StudentProfileSelfAssessment;
  educationLevel: string | null;
  graduationYear: number | null;
  personalSummary: string | null;
}): StudentProfileDimensionScores {
  const baseRequirements = clampScore(
    35 +
      Math.min(params.certificates.length * 12, 30) +
      Math.min(params.experience.internship_count * 10, 30) +
      (params.educationLevel ? 5 : 0) +
      (params.graduationYear ? 5 : 0),
  );

  const professionalSkills = clampScore(
    30 +
      Math.min(params.skills.length * 9, 45) +
      Math.min(params.experience.project_count * 8, 16) +
      Math.min(params.certificates.length * 3, 9),
  );

  const professionalQuality = clampScore(
    ((levelToScore(params.selfAssessment.communication) +
      levelToScore(params.selfAssessment.stress_tolerance)) /
      2) *
      0.85 +
      (params.personalSummary ? 15 : 0),
  );

  const developmentPotential = clampScore(
    ((levelToScore(params.selfAssessment.learning) +
      levelToScore(params.selfAssessment.innovation)) /
      2) *
      0.75 +
      Math.min(params.experience.competition_count * 8, 16) +
      Math.min(params.experience.project_count * 4, 8),
  );

  return {
    base_requirements: baseRequirements,
    professional_skills: professionalSkills,
    professional_quality: professionalQuality,
    development_potential: developmentPotential,
  };
}

function calculateCompleteness(input: CreateStudentProfileRequest): {
  completenessScore: number;
  missingItems: string[];
} {
  const checks: MissingItemRule[] = [
    { key: "education_level", isMissing: !input.education_level?.trim() },
    { key: "major", isMissing: !input.major?.trim() },
    { key: "graduation_year", isMissing: input.graduation_year === undefined },
    { key: "certificates", isMissing: !input.certificates || input.certificates.length === 0 },
    {
      key: "experience.internship_count",
      isMissing: !input.experience || input.experience.internship_count === undefined,
    },
    {
      key: "experience.project_count",
      isMissing: !input.experience || input.experience.project_count === undefined,
    },
    {
      key: "experience.competition_count",
      isMissing: !input.experience || input.experience.competition_count === undefined,
    },
    {
      key: "self_assessment.communication",
      isMissing: !input.self_assessment || input.self_assessment.communication === undefined,
    },
    {
      key: "self_assessment.learning",
      isMissing: !input.self_assessment || input.self_assessment.learning === undefined,
    },
    {
      key: "self_assessment.stress_tolerance",
      isMissing: !input.self_assessment || input.self_assessment.stress_tolerance === undefined,
    },
    {
      key: "self_assessment.innovation",
      isMissing: !input.self_assessment || input.self_assessment.innovation === undefined,
    },
    { key: "personal_summary", isMissing: !input.personal_summary?.trim() },
  ];

  const missingItems = checks.filter((check) => check.isMissing).map((check) => check.key);
  const completenessScore = clampScore(((checks.length - missingItems.length) / checks.length) * 100);
  return { completenessScore, missingItems };
}

function calculateCompetitiveness(dimensionScores: StudentProfileDimensionScores): number {
  return clampScore(
    dimensionScores.base_requirements * SCORE_WEIGHTS.base_requirements +
      dimensionScores.professional_skills * SCORE_WEIGHTS.professional_skills +
      dimensionScores.professional_quality * SCORE_WEIGHTS.professional_quality +
      dimensionScores.development_potential * SCORE_WEIGHTS.development_potential,
  );
}

export function createProfileService(repository: ProfileRepository): ProfileService {
  function createProfile(input: CreateStudentProfileRequest): StudentProfileRecord {
    const skills = uniqueNonEmpty(input.skills);
    const certificates = uniqueNonEmpty(input.certificates || []);
    const experience = normalizeExperience(input.experience);
    const selfAssessment = normalizeSelfAssessment(input.self_assessment);
    const educationLevel = normalizeOptionalText(input.education_level);
    const major = normalizeOptionalText(input.major);
    const personalSummary = normalizeOptionalText(input.personal_summary);
    const graduationYear = input.graduation_year ?? null;

    const dimensionScores = calculateDimensionScores({
      skills,
      certificates,
      experience,
      selfAssessment,
      educationLevel,
      graduationYear,
      personalSummary,
    });
    const { completenessScore, missingItems } = calculateCompleteness(input);
    const competitivenessScore = calculateCompetitiveness(dimensionScores);

    const recordInput: StudentProfileCreateInput = {
      name: input.name.trim(),
      target_role: input.target_role.trim(),
      education_level: educationLevel,
      major,
      graduation_year: graduationYear,
      skills,
      certificates,
      experience,
      self_assessment: selfAssessment,
      dimension_scores: dimensionScores,
      completeness_score: completenessScore,
      competitiveness_score: competitivenessScore,
      missing_items: missingItems,
      personal_summary: personalSummary,
      summary: `目标岗位【${input.target_role}】画像已生成：完整度 ${completenessScore}，竞争力 ${competitivenessScore}。`,
    };

    return repository.createStudentProfile(recordInput);
  }

  return {
    listProfiles: repository.listStudentProfiles,
    createProfile,
  };
}
