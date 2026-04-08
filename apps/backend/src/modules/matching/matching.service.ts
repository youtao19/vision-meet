import type {
  CareerRouteRecommendation,
  CreateMatchRequest,
  DimensionKey,
  DimensionScores,
  JobRecord,
  JobProfileV2Record,
  MatchExplanationItem,
  MatchGapItem,
  MatchListParams,
  MatchResultDetail,
  MatchResultListResponse,
  StudentProfileRecord,
} from "@career/contracts/types";

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
  createMatch(input: CreateMatchRequest): Promise<MatchResultDetail>;
  listMatches(params: MatchListParams): Promise<MatchResultListResponse>;
  getMatchDetail(matchId: number): Promise<MatchResultDetail>;
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
    professional_quality:
      skillWeights["职业素养"] ?? DEFAULT_DIMENSION_WEIGHTS.professional_quality,
    development_potential:
      skillWeights["发展潜力"] ?? DEFAULT_DIMENSION_WEIGHTS.development_potential,
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
      45 +
        params.certificatesCount * 7 +
        Math.min(params.hardSkillsCount, 5) * 4 +
        confidenceRatio * 10,
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
    base_requirements: clampScore(
      100 - Math.max(0, targetScores.base_requirements - studentScores.base_requirements),
    ),
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

/**
 * 作用：把标准岗位提示写入匹配证据，确保报告端能引用“岗位族”这一结构化依据。
 * 参数：hint 为岗位标准化结果，jobTitle 为岗位原始标题。
 * 返回：可直接写入 evidence_refs 的证据片段。
 */
function buildNormalizedHintEvidence(
  hint: {
    normalized_title: string | null;
    normalized_job_family: string | null;
    confidence: number | null;
  } | null,
  jobTitle: string,
): string[] {
  if (!hint || !hint.normalized_job_family) {
    return [];
  }

  const refs = [`岗位族归一：${hint.normalized_job_family}`];
  if (hint.normalized_title) {
    refs.push(`标准岗位标题：${hint.normalized_title}`);
  } else {
    refs.push(`标准岗位标题：${jobTitle}`);
  }
  if (hint.confidence != null) {
    refs.push(`岗位归一置信度：${Math.round(hint.confidence * 100)}%`);
  }
  return refs;
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
  evidenceRefs: string[];
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
      evidence_refs: evidence,
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
    evidenceRefs: Array.from(new Set(gaps.flatMap((item) => item.evidence))).slice(0, 12),
  };
}

type MatchingJobProfileSnapshot = {
  profile_version: number;
  hard_skills: string[];
  certificates: string[];
  soft_skills: string[];
  skill_weights: Record<string, number>;
  confidence: number;
};

function buildFallbackJobProfileSnapshot(jobTitle: string): MatchingJobProfileSnapshot {
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

function buildV2SoftSkills(profile: JobProfileV2Record): string[] {
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

  if (selected.length > 0) {
    return selected;
  }
  // 保底输出，避免后续目标分计算失真。
  return ["沟通", "学习能力", "抗压"];
}

function mapV2ProfileToMatchingSnapshot(profile: JobProfileV2Record): MatchingJobProfileSnapshot {
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

async function ensureJobProfileSnapshot(
  job: JobRecord,
  jobsRepository: JobsRepository,
): Promise<MatchingJobProfileSnapshot> {
  const latestV2 = await jobsRepository.getLatestProfileV2ByJobId(job.id);
  if (latestV2) {
    return mapV2ProfileToMatchingSnapshot(latestV2);
  }
  return buildFallbackJobProfileSnapshot(job.title);
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
  pathRecommendations: CareerRouteRecommendation[];
  evidenceRefs: string[];
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
    path_recommendations: params.pathRecommendations,
    evidence_refs: params.evidenceRefs,
  };
}

export type MatchingServiceOptions = {
  scoringVersion: string;
  careerPathResolver?: (input: {
    job_id: number;
    student_profile_id: number;
    depth: number;
  }) => Promise<{
    promotion_routes: CareerRouteRecommendation[];
    transition_routes: CareerRouteRecommendation[];
  }>;
};

export function createMatchingService(
  matchingRepository: MatchingRepository,
  profileRepository: ProfileRepository,
  jobsRepository: JobsRepository,
  options: MatchingServiceOptions,
): MatchingService {
  async function createMatch(input: CreateMatchRequest): Promise<MatchResultDetail> {
    const profile = await profileRepository.getStudentProfileById(input.student_profile_id);
    if (!profile) {
      throw new HttpError(404, "STUDENT_PROFILE_NOT_FOUND", "学生画像不存在");
    }

    const job = await jobsRepository.getJobById(input.job_id);
    if (!job) {
      throw new HttpError(404, "JOB_NOT_FOUND", "目标岗位不存在或已下线");
    }

    const latestJobProfile = await ensureJobProfileSnapshot(job, jobsRepository);
    const normalizedHint = await matchingRepository.getNormalizedJobHint(job.id);

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
      const reusable = await matchingRepository.findReusableResult(uniqueKey);
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
    const { gaps, explanations, suggestions, evidenceRefs } = buildGapAndExplanation({
      profile,
      hardSkills: latestJobProfile.hard_skills,
      targetScores,
      matchScores,
    });
    const normalizedEvidenceRefs = buildNormalizedHintEvidence(normalizedHint, job.title);
    const mergedEvidenceRefs = Array.from(new Set([...evidenceRefs, ...normalizedEvidenceRefs]));

    let pathRecommendations: CareerRouteRecommendation[] = [];
    if (options.careerPathResolver) {
      try {
        const graph = await options.careerPathResolver({
          job_id: job.id,
          student_profile_id: profile.id,
          depth: 2,
        });
        pathRecommendations = [...graph.promotion_routes, ...graph.transition_routes]
          .sort((left, right) => right.suitability_score - left.suitability_score)
          .slice(0, 4);
      } catch {
        pathRecommendations = [];
      }
    }

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
        pathRecommendations,
        evidenceRefs: mergedEvidenceRefs,
        jobId: job.id,
      }),
    );
  }

  async function listMatches(params: MatchListParams): Promise<MatchResultListResponse> {
    return matchingRepository.listMatchResults(params);
  }

  async function getMatchDetail(matchId: number): Promise<MatchResultDetail> {
    const matched = await matchingRepository.getMatchResultById(matchId);
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
