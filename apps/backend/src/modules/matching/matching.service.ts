import type {
  CreateMatchRequest,
  DimensionKey,
  DimensionScores,
  MatchExplanationItem,
  MatchGapItem,
  MatchListParams,
  MatchResultDetail,
  MatchResultListResponse,
  StudentProfileRecord,
} from "@career/contracts/types";

import { generateJobProfile } from "../jobs/jobs.profile.js";
import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { createMatchFingerprint } from "../../shared/utils/match-fingerprint.js";
import type {
  MatchResultCreateInput,
  MatchResultUniqueKey,
  MatchingRepository,
} from "./matching.repository.js";

/**
 * 文件作用：实现 matching 领域核心业务逻辑（评分、解释、复现、缓存命中）。
 * 依赖关系：仅依赖 repository 抽象，不直接依赖具体存储 adapter。
 */
export interface MatchingService {
  createMatch(input: CreateMatchRequest): MatchResultDetail;
  listMatches(params: MatchListParams): MatchResultListResponse;
  getMatchDetail(matchId: number): MatchResultDetail;
}

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

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundTo3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function resolveDimensionWeights(skillWeights: Record<string, number>): DimensionScores {
  const merged: DimensionScores = {
    ...DEFAULT_DIMENSION_WEIGHTS,
    base_requirements: skillWeights["基础要求"] ?? DEFAULT_DIMENSION_WEIGHTS.base_requirements,
    professional_skills: skillWeights["职业技能"] ?? DEFAULT_DIMENSION_WEIGHTS.professional_skills,
    professional_quality: skillWeights["职业素养"] ?? DEFAULT_DIMENSION_WEIGHTS.professional_quality,
    development_potential: skillWeights["发展潜力"] ?? DEFAULT_DIMENSION_WEIGHTS.development_potential,
  };

  const total =
    merged.base_requirements +
    merged.professional_skills +
    merged.professional_quality +
    merged.development_potential;

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

function buildTargetDimensions(params: {
  hardSkillsCount: number;
  certificatesCount: number;
  softSkillsCount: number;
  confidence: number;
}): DimensionScores {
  const confidenceRatio = Math.max(0, Math.min(1, params.confidence));

  return {
    base_requirements: clampScore(
      45 + params.certificatesCount * 7 + Math.min(params.hardSkillsCount, 5) * 4 + confidenceRatio * 10,
    ),
    professional_skills: clampScore(40 + params.hardSkillsCount * 8 + confidenceRatio * 15),
    professional_quality: clampScore(45 + params.softSkillsCount * 7 + confidenceRatio * 10),
    development_potential: clampScore(40 + params.softSkillsCount * 4 + confidenceRatio * 20),
  };
}

function buildMatchDimensionScores(
  studentScores: DimensionScores,
  targetScores: DimensionScores,
): DimensionScores {
  return {
    base_requirements: clampScore(100 - Math.max(0, targetScores.base_requirements - studentScores.base_requirements)),
    professional_skills: clampScore(
      100 - Math.max(0, targetScores.professional_skills - studentScores.professional_skills),
    ),
    professional_quality: clampScore(
      100 - Math.max(0, targetScores.professional_quality - studentScores.professional_quality),
    ),
    development_potential: clampScore(
      100 - Math.max(0, targetScores.development_potential - studentScores.development_potential),
    ),
  };
}

function calculateTotalScore(matchScores: DimensionScores, weights: DimensionScores): number {
  return clampScore(
    matchScores.base_requirements * weights.base_requirements +
      matchScores.professional_skills * weights.professional_skills +
      matchScores.professional_quality * weights.professional_quality +
      matchScores.development_potential * weights.development_potential,
  );
}

function buildEvidenceByDimension(
  dimension: DimensionKey,
  profile: StudentProfileRecord,
  missingHardSkills: string[],
): string[] {
  switch (dimension) {
    case "base_requirements": {
      const evidence: string[] = [];
      if (!profile.education_level) {
        evidence.push("教育层次信息缺失");
      }
      if ((profile.certificates || []).length === 0) {
        evidence.push("证书项为 0");
      }
      if ((profile.experience?.internship_count || 0) === 0) {
        evidence.push("缺少实习经历信号");
      }
      return evidence.length > 0 ? evidence : ["基础要求满足度接近岗位目标"];
    }
    case "professional_skills": {
      if (missingHardSkills.length > 0) {
        return [`待补齐技能：${missingHardSkills.slice(0, 5).join("、")}`];
      }
      return ["核心技能命中率较高，但仍有强化空间"];
    }
    case "professional_quality": {
      return [
        `沟通自评 ${profile.self_assessment.communication}/5`,
        `抗压自评 ${profile.self_assessment.stress_tolerance}/5`,
      ];
    }
    case "development_potential": {
      return [
        `项目经历 ${profile.experience.project_count} 项`,
        `竞赛经历 ${profile.experience.competition_count} 项`,
      ];
    }
    default:
      return ["暂无证据项"];
  }
}

function buildActionsByDimension(dimension: DimensionKey): string[] {
  switch (dimension) {
    case "base_requirements":
      return ["补齐教育背景和证书信息", "补充 1 段可量化的实习经历"];
    case "professional_skills":
      return ["围绕目标岗位补充 2-3 项核心技能项目", "通过作品集展示技能深度"];
    case "professional_quality":
      return ["准备 STAR 案例强化沟通表达", "在项目中承担协作角色并沉淀复盘"];
    case "development_potential":
      return ["增加竞赛或开源贡献经历", "设定季度学习路线并形成可验证成果"];
    default:
      return ["持续迭代能力画像并复测"];
  }
}

function buildGapAndExplanation(params: {
  profile: StudentProfileRecord;
  hardSkills: string[];
  targetScores: DimensionScores;
  matchScores: DimensionScores;
}): {
  gaps: MatchGapItem[];
  explanations: MatchExplanationItem[];
  suggestions: string[];
} {
  const profileSkillsLower = new Set(params.profile.skills.map((item) => item.toLowerCase()));
  const missingHardSkills = params.hardSkills.filter(
    (skill) => !profileSkillsLower.has(skill.toLowerCase()),
  );

  const gaps: MatchGapItem[] = [];
  const explanations: MatchExplanationItem[] = [];
  const suggestionPool: string[] = [];

  for (const dimension of DIMENSION_ORDER) {
    const targetScore = params.targetScores[dimension];
    const currentScore = params.profile.dimension_scores[dimension];
    const gap = Math.max(0, targetScore - currentScore);
    const evidence = buildEvidenceByDimension(dimension, params.profile, missingHardSkills);
    const actions = buildActionsByDimension(dimension);

    if (gap > 0) {
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
      reasoning: `该维度匹配分 ${params.matchScores[dimension]}，学生当前能力 ${currentScore}，岗位目标 ${targetScore}。`,
      improvement_actions: actions,
    });
  }

  // 业务约束：即使整体达标，也保留至少一个“可优化项”，便于后续报告模块复用建议。
  if (gaps.length === 0) {
    const weakest = DIMENSION_ORDER.reduce<DimensionKey>((prev, current) => {
      return params.matchScores[current] < params.matchScores[prev] ? current : prev;
    }, DIMENSION_ORDER[0]);

    gaps.push({
      dimension: weakest,
      target_score: params.targetScores[weakest],
      current_score: params.profile.dimension_scores[weakest],
      gap: 0,
      evidence: ["当前维度已达标，建议继续巩固优势"],
    });
    suggestionPool.push(...buildActionsByDimension(weakest));
  }

  const suggestions = Array.from(new Set(suggestionPool)).slice(0, 4);

  return {
    gaps,
    explanations,
    suggestions: suggestions.length > 0 ? suggestions : ["继续保持当前能力结构并定期复测"],
  };
}

function ensureJobProfileSnapshot(jobId: number, jobsRepository: JobsRepository) {
  const latest = jobsRepository.getLatestProfileByJobId(jobId);
  if (latest) {
    return latest;
  }

  const job = jobsRepository.getJobById(jobId);
  if (!job) {
    throw new HttpError(404, "JOB_NOT_FOUND", "目标岗位不存在或已下线");
  }

  const generated = generateJobProfile(job);
  return jobsRepository.createJobProfile({
    job_id: job.id,
    profile_version: 1,
    hard_skills: generated.hard_skills,
    certificates: generated.certificates,
    soft_skills: generated.soft_skills,
    skill_weights: generated.skill_weights,
    summary: generated.summary,
    confidence: generated.confidence,
  });
}

function buildMatchCreateInput(params: {
  profile: StudentProfileRecord;
  jobProfileVersion: number;
  scoringVersion: string;
  inputFingerprint: string;
  matchScores: DimensionScores;
  totalScore: number;
  gaps: MatchGapItem[];
  explanations: MatchExplanationItem[];
  suggestions: string[];
  jobId: number;
}): MatchResultCreateInput {
  return {
    student_profile_id: params.profile.id,
    job_id: params.jobId,
    job_profile_version: params.jobProfileVersion,
    scoring_version: params.scoringVersion,
    input_fingerprint: params.inputFingerprint,
    from_cache: false,
    dimension_scores: params.matchScores,
    total_score: params.totalScore,
    gaps: params.gaps,
    explanations: params.explanations,
    suggestions: params.suggestions,
  };
}

export type MatchingServiceOptions = {
  scoringVersion: string;
};

export function createMatchingService(
  matchingRepository: MatchingRepository,
  profileRepository: ProfileRepository,
  jobsRepository: JobsRepository,
  options: MatchingServiceOptions,
): MatchingService {
  function createMatch(input: CreateMatchRequest): MatchResultDetail {
    const profile = profileRepository.getStudentProfileById(input.student_profile_id);
    if (!profile) {
      throw new HttpError(404, "STUDENT_PROFILE_NOT_FOUND", "学生画像不存在");
    }

    const job = jobsRepository.getJobById(input.job_id);
    if (!job) {
      throw new HttpError(404, "JOB_NOT_FOUND", "目标岗位不存在或已下线");
    }

    const latestJobProfile = ensureJobProfileSnapshot(job.id, jobsRepository);

    const inputFingerprint = createMatchFingerprint({
      student_profile_id: profile.id,
      student_source_digest: profile.source_digest,
      student_dimension_scores: profile.dimension_scores,
      student_skills: [...profile.skills].sort((a, b) => a.localeCompare(b)),
      job_id: job.id,
      job_profile_version: latestJobProfile.profile_version,
      hard_skills: [...latestJobProfile.hard_skills].sort((a, b) => a.localeCompare(b)),
      certificates: [...latestJobProfile.certificates].sort((a, b) => a.localeCompare(b)),
      soft_skills: [...latestJobProfile.soft_skills].sort((a, b) => a.localeCompare(b)),
      skill_weights: latestJobProfile.skill_weights,
      scoring_version: options.scoringVersion,
    });

    const uniqueKey: MatchResultUniqueKey = {
      student_profile_id: profile.id,
      job_id: job.id,
      job_profile_version: latestJobProfile.profile_version,
      scoring_version: options.scoringVersion,
      input_fingerprint: inputFingerprint,
    };

    if (!input.force_recalculate) {
      const reusable = matchingRepository.findReusableResult(uniqueKey);
      if (reusable) {
        return {
          ...reusable,
          from_cache: true,
        };
      }
    }

    const targetScores = buildTargetDimensions({
      hardSkillsCount: latestJobProfile.hard_skills.length,
      certificatesCount: latestJobProfile.certificates.length,
      softSkillsCount: latestJobProfile.soft_skills.length,
      confidence: latestJobProfile.confidence,
    });

    const matchScores = buildMatchDimensionScores(profile.dimension_scores, targetScores);
    const weights = resolveDimensionWeights(latestJobProfile.skill_weights);
    const totalScore = calculateTotalScore(matchScores, weights);
    const { gaps, explanations, suggestions } = buildGapAndExplanation({
      profile,
      hardSkills: latestJobProfile.hard_skills,
      targetScores,
      matchScores,
    });

    return matchingRepository.createMatchResult(
      buildMatchCreateInput({
        profile,
        jobProfileVersion: latestJobProfile.profile_version,
        scoringVersion: options.scoringVersion,
        inputFingerprint,
        matchScores,
        totalScore,
        gaps,
        explanations,
        suggestions,
        jobId: job.id,
      }),
    );
  }

  function listMatches(params: MatchListParams): MatchResultListResponse {
    return matchingRepository.listMatchResults(params);
  }

  function getMatchDetail(matchId: number): MatchResultDetail {
    const matched = matchingRepository.getMatchResultById(matchId);
    if (!matched) {
      throw new HttpError(404, "MATCH_NOT_FOUND", "匹配结果不存在");
    }
    return matched;
  }

  return {
    createMatch,
    listMatches,
    getMatchDetail,
  };
}
