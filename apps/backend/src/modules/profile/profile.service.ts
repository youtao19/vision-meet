import type {
  CreateStudentProfileFromResumeRequest,
  CreateStudentProfileRequest,
  DimensionScores,
  ListStudentProfilesResponse,
  StudentProfileExperience,
  StudentProfileRecord,
  StudentProfileSelfAssessment,
} from "@career/contracts/types";

import { HttpError } from "../../shared/errors/http-error.js";
import { buildSha256Digest } from "../../shared/utils/match-fingerprint.js";
import type { ProfileRepository, StudentProfileCreateInput } from "./profile.repository.js";

/**
 * 文件作用：承载学生画像领域核心业务逻辑。
 * 依赖关系：仅依赖 ProfileRepository 抽象，不接触具体存储实现。
 */
export interface ProfileService {
  listProfiles(): Promise<ListStudentProfilesResponse>;
  createProfile(input: CreateStudentProfileRequest): Promise<StudentProfileRecord>;
  createProfileFromResume(
    input: CreateStudentProfileFromResumeRequest,
  ): Promise<StudentProfileRecord>;
}

export type ResumeProfileCreatedHook = (params: {
  profile: StudentProfileRecord;
  resumeInput: CreateStudentProfileFromResumeRequest;
}) => Promise<void> | void;

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

const RESUME_SKILL_KEYWORDS = [
  "typescript",
  "vue",
  "react",
  "node",
  "express",
  "python",
  "java",
  "sql",
  "linux",
  "docker",
  "沟通",
  "协作",
  "测试",
  "算法",
  "数据分析",
  "机器学习",
];

const RESUME_CERTIFICATE_KEYWORDS = [
  "英语六级",
  "英语四级",
  "pmp",
  "软考",
  "教师资格证",
  "计算机二级",
];

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

function normalizeExperience(input?: Partial<StudentProfileExperience>): StudentProfileExperience {
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

/**
 * 计算学生画像四维得分。
 * 注意点：评分必须保持确定性，不能引入随机项，否则会破坏后续匹配可复现性。
 */
function calculateDimensionScores(params: {
  skills: string[];
  certificates: string[];
  experience: StudentProfileExperience;
  selfAssessment: StudentProfileSelfAssessment;
  educationLevel: string | null;
  graduationYear: number | null;
  personalSummary: string | null;
}): DimensionScores {
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
  const completenessScore = clampScore(
    ((checks.length - missingItems.length) / checks.length) * 100,
  );
  return { completenessScore, missingItems };
}

function calculateCompetitiveness(dimensionScores: DimensionScores): number {
  return clampScore(
    dimensionScores.base_requirements * SCORE_WEIGHTS.base_requirements +
      dimensionScores.professional_skills * SCORE_WEIGHTS.professional_skills +
      dimensionScores.professional_quality * SCORE_WEIGHTS.professional_quality +
      dimensionScores.development_potential * SCORE_WEIGHTS.development_potential,
  );
}

function extractResumeName(content: string): string | null {
  const match = content.match(/(?:姓名|Name)[:：\s]+([^\n]+)/i);
  return match?.[1]?.trim() || null;
}

function extractResumeMajor(content: string): string | null {
  const match = content.match(/(?:专业|Major)[:：\s]+([^\n]+)/i);
  return match?.[1]?.trim() || null;
}

function extractResumeGraduationYear(content: string): number | undefined {
  const match = content.match(/(20\d{2})\s*(?:届|毕业|graduation)?/i);
  if (!match) {
    return undefined;
  }
  const parsed = Number(match[1]);
  return parsed >= 2000 && parsed <= 2100 ? parsed : undefined;
}

function extractResumeSkills(content: string): string[] {
  const lowered = content.toLowerCase();
  const matched = RESUME_SKILL_KEYWORDS.filter((keyword) =>
    lowered.includes(keyword.toLowerCase()),
  );
  return uniqueNonEmpty(matched);
}

function extractResumeCertificates(content: string): string[] {
  const lowered = content.toLowerCase();
  const matched = RESUME_CERTIFICATE_KEYWORDS.filter((keyword) =>
    lowered.includes(keyword.toLowerCase()),
  );
  return uniqueNonEmpty(matched);
}

function countRegexMatches(content: string, regex: RegExp): number {
  const matched = content.match(regex);
  return matched ? matched.length : 0;
}

/**
 * 将简历文本映射为标准画像输入。
 * 关键点：strict 模式下若无法识别关键技能会直接报 422，避免生成误导性画像。
 */
function buildProfileInputFromResume(
  resumeInput: CreateStudentProfileFromResumeRequest,
): CreateStudentProfileRequest {
  const normalizedContent = resumeInput.file_content.replace(/\r\n/g, "\n");
  const skills = extractResumeSkills(normalizedContent);

  if (resumeInput.parse_mode === "strict" && skills.length === 0) {
    throw new HttpError(422, "RESUME_PARSE_FAILED", "严格模式下未识别到可用技能");
  }

  const certificates = extractResumeCertificates(normalizedContent);
  const projectCount = Math.max(1, countRegexMatches(normalizedContent, /(项目|project)/gi));
  const internshipCount = countRegexMatches(normalizedContent, /(实习|intern)/gi);
  const competitionCount = countRegexMatches(normalizedContent, /(竞赛|比赛|competition)/gi);

  const autoName = extractResumeName(normalizedContent);
  const autoMajor = extractResumeMajor(normalizedContent);
  const autoGraduationYear = extractResumeGraduationYear(normalizedContent);

  const topLines = normalizedContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("；");

  return {
    name: (resumeInput.name || autoName || "匿名候选人").trim(),
    target_role: resumeInput.target_role.trim(),
    major: autoMajor ?? undefined,
    graduation_year: autoGraduationYear,
    skills: skills.length > 0 ? skills : ["学习能力"],
    certificates,
    experience: {
      internship_count: internshipCount,
      project_count: projectCount,
      competition_count: competitionCount,
    },
    self_assessment: {
      communication: 3,
      learning: 4,
      stress_tolerance: 3,
      innovation: 3,
    },
    personal_summary: topLines || undefined,
  };
}

/**
 * 持久化学生画像。
 * 参数：
 * - input: 标准画像输入。
 * - sourceType/sourceDigest: 数据来源标记与可追踪摘要。
 */
function createProfileRecord(
  repository: ProfileRepository,
  input: CreateStudentProfileRequest,
  sourceType: "manual" | "resume",
  sourceDigest: string,
): StudentProfileRecord {
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
    source_type: sourceType,
    source_digest: sourceDigest,
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

export function createProfileService(
  repository: ProfileRepository,
  options: {
    onResumeProfileCreated?: ResumeProfileCreatedHook;
  } = {},
): ProfileService {
  async function createProfile(input: CreateStudentProfileRequest): Promise<StudentProfileRecord> {
    const sourceDigest = buildSha256Digest({
      source_type: "manual",
      payload: input,
    });

    return createProfileRecord(repository, input, "manual", sourceDigest);
  }

  async function createProfileFromResume(
    input: CreateStudentProfileFromResumeRequest,
  ): Promise<StudentProfileRecord> {
    const digest = buildSha256Digest({
      source_type: "resume",
      file_name: input.file_name,
      file_content: input.file_content,
      target_role: input.target_role,
      name: input.name,
      parse_mode: input.parse_mode ?? "tolerant",
    });
    const mappedInput = buildProfileInputFromResume(input);
    const profile = createProfileRecord(repository, mappedInput, "resume", digest);
    if (options.onResumeProfileCreated) {
      await options.onResumeProfileCreated({
        profile,
        resumeInput: input,
      });
    }
    return profile;
  }

  return {
    listProfiles: async () => repository.listStudentProfiles(),
    createProfile,
    createProfileFromResume,
  };
}
