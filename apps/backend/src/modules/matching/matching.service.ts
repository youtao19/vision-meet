import type {
  CreateMatchRequest,
  DimensionScores,
  ManualJobPortraitRecord,
  MatchExplanationItem,
  MatchGapItem,
  MatchListParams,
  MatchRequirementScore,
  MatchResultLevel,
  MatchResultDetail,
  MatchResultListResponse,
  StudentProfileRecord,
} from "@career/contracts/types";

import type { ProfileRepository } from "../profile/profile.repository.js";
import { getProfileDimensionScores, getProfileSkillNames } from "../profile/profile.selectors.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { createMatchFingerprint } from "../../shared/utils/match-fingerprint.js";
import type {
  MatchResultCreateInput,
  MatchResultUniqueKey,
  MatchingRepository,
} from "./matching.repository.js";
import {
  buildMatchRequirements,
  type MatchingJobProfileSnapshot,
  mapManualPortraitToMatchingSnapshot,
} from "./matching.requirement-model.js";
import { buildStudentMatchSnapshot } from "./matching.student-snapshot.js";
import { matchAllRequirements } from "./matching.evidence.js";
import {
  aggregateDimensionScores,
  calculateConfidence,
  calculateEvidenceCoverage,
  calculateTotalScore as calculateRequirementTotalScore,
  resolveDimensionWeights as resolveRequirementDimensionWeights,
  resolveMatchLevel,
} from "./matching.scoring.js";
import { buildMatchExplanation } from "./matching.explanation.js";

/**
 * 文件作用：实现 matching 领域核心业务逻辑（评分、解释、复现、缓存命中）。
 * 依赖关系：仅依赖 repository 抽象，不直接依赖具体存储 adapter。
 */
export interface MatchingService {
  createMatch(input: CreateMatchRequest): Promise<MatchResultDetail>;
  listMatches(params: MatchListParams): Promise<MatchResultListResponse>;
  getMatchDetail(matchId: number): Promise<MatchResultDetail>;
}

const MATCHING_ALGORITHM_VERSION = "requirement-evidence-v1";

export type JobPortraitRepository = {
  getManualJobPortraitByName(jobName: string): Promise<ManualJobPortraitRecord | null>;
};

function portraitDisplayName(portrait: ManualJobPortraitRecord): string {
  return portrait.profile_detail.name.trim() || portrait.job_name.trim();
}

function attachJobTitle<T extends { job_title?: string | null }>(record: T, jobTitle: string): T {
  return {
    ...record,
    job_title: jobTitle,
  };
}

async function ensureJobProfileSnapshot(
  portrait: ManualJobPortraitRecord,
): Promise<MatchingJobProfileSnapshot> {
  return mapManualPortraitToMatchingSnapshot(portrait);
}

function buildMatchCreateInput(params: {
  profile: StudentProfileRecord;
  jobProfileVersion: number;
  scoringVersion: string;
  inputFingerprint: string;
  matchScores: DimensionScores;
  totalScore: number;
  confidence: number;
  level: MatchResultLevel;
  gaps: MatchGapItem[];
  explanations: MatchExplanationItem[];
  suggestions: string[];
  evidenceRefs: string[];
  requirementScores: MatchRequirementScore[];
  blockingGaps: MatchRequirementScore[];
  matchedRequirements: MatchRequirementScore[];
  weakRequirements: MatchRequirementScore[];
  scoringSnapshot: MatchResultDetail["scoring_snapshot"];
  jobPortraitName: string;
  jobPortraitSnapshot: ManualJobPortraitRecord;
}): MatchResultCreateInput {
  return {
    student_profile_id: params.profile.id,
    job_portrait_name: params.jobPortraitName,
    job_portrait_snapshot: params.jobPortraitSnapshot,
    job_profile_version: params.jobProfileVersion,
    scoring_version: params.scoringVersion,
    input_fingerprint: params.inputFingerprint,
    from_cache: false,
    dimension_scores: params.matchScores,
    total_score: params.totalScore,
    confidence: params.confidence,
    level: params.level,
    gaps: params.gaps,
    explanations: params.explanations,
    suggestions: params.suggestions,
    path_recommendations: [],
    evidence_refs: params.evidenceRefs,
    requirement_scores: params.requirementScores,
    blocking_gaps: params.blockingGaps,
    matched_requirements: params.matchedRequirements,
    weak_requirements: params.weakRequirements,
    scoring_snapshot: params.scoringSnapshot,
  };
}

export type MatchingServiceOptions = {
  scoringVersion: string;
};

export function createMatchingService(
  matchingRepository: MatchingRepository,
  profileRepository: ProfileRepository,
  jobPortraitRepository: JobPortraitRepository,
  options: MatchingServiceOptions,
): MatchingService {
  async function createMatch(input: CreateMatchRequest): Promise<MatchResultDetail> {
    const profile = await profileRepository.getStudentProfileById(input.student_profile_id);
    if (!profile) {
      throw new HttpError(404, "STUDENT_PROFILE_NOT_FOUND", "学生画像不存在");
    }

    const portrait = await jobPortraitRepository.getManualJobPortraitByName(
      input.job_portrait_name,
    );
    if (!portrait) {
      throw new HttpError(404, "JOB_PORTRAIT_NOT_FOUND", "目标岗位画像不存在");
    }
    const jobTitle = portraitDisplayName(portrait);

    const latestJobProfile = await ensureJobProfileSnapshot(portrait);

    const inputFingerprint = createMatchFingerprint({
      algorithm_version: MATCHING_ALGORITHM_VERSION,
      student_profile_id: profile.id,
      student_source_digest: profile.source_digest,
      student_dimension_scores: getProfileDimensionScores(profile),
      student_skills: [...getProfileSkillNames(profile)].sort((a, b) => a.localeCompare(b)),
      job_portrait_name: portrait.job_name,
      job_profile_version: latestJobProfile.profile_version,
      hard_skills: [...latestJobProfile.hard_skills].sort((a, b) => a.localeCompare(b)),
      certificates: [...latestJobProfile.certificates].sort((a, b) => a.localeCompare(b)),
      soft_skills: [...latestJobProfile.soft_skills].sort((a, b) => a.localeCompare(b)),
      skill_weights: latestJobProfile.skill_weights,
      scoring_version: options.scoringVersion,
    });

    const uniqueKey: MatchResultUniqueKey = {
      student_profile_id: profile.id,
      job_portrait_name: portrait.job_name,
      job_profile_version: latestJobProfile.profile_version,
      scoring_version: options.scoringVersion,
      input_fingerprint: inputFingerprint,
    };

    if (!input.force_recalculate) {
      const reusable = await matchingRepository.findReusableResult(uniqueKey);
      if (reusable) {
        return attachJobTitle(
          {
            ...reusable,
            from_cache: true,
          },
          jobTitle,
        );
      }
    }

    const requirements = buildMatchRequirements(latestJobProfile);
    const studentSnapshot = buildStudentMatchSnapshot(profile);
    const requirementScores = matchAllRequirements(requirements, studentSnapshot);
    const matchScores = aggregateDimensionScores(requirementScores);
    const weights = resolveRequirementDimensionWeights(latestJobProfile.skill_weights);
    const totalScore = calculateRequirementTotalScore(matchScores, weights);
    const evidenceCoverage = calculateEvidenceCoverage(requirementScores);
    const confidence = calculateConfidence({
      student: studentSnapshot,
      jobProfileConfidence: latestJobProfile.confidence,
      evidenceCoverage,
      usedFallbackProfile: latestJobProfile.profile_version === 0,
    });
    const level = resolveMatchLevel(totalScore);
    const {
      gaps,
      explanations,
      suggestions,
      evidenceRefs,
      blockingGaps,
      matchedRequirements,
      weakRequirements,
    } = buildMatchExplanation({
      requirementScores,
      evidenceCoverage,
      algorithmVersion: MATCHING_ALGORITHM_VERSION,
    });
    const normalizedEvidenceRefs = [`岗位画像：${jobTitle}`];
    const hardRequirementScores = requirementScores.filter((item) => item.category === "skill");
    const hardSkillCoverage =
      hardRequirementScores.length > 0
        ? Math.round(
            (hardRequirementScores.filter((item) => item.matched).length /
              hardRequirementScores.length) *
              100,
          )
        : 0;
    const mergedEvidenceRefs = Array.from(
      new Set([
        ...evidenceRefs,
        `核心技能覆盖率：${hardSkillCoverage}%`,
        ...normalizedEvidenceRefs,
      ]),
    );

    return attachJobTitle(
      await matchingRepository.createMatchResult(
        buildMatchCreateInput({
          profile,
          jobProfileVersion: latestJobProfile.profile_version,
          scoringVersion: options.scoringVersion,
          inputFingerprint,
          matchScores,
          totalScore,
          confidence,
          level,
          gaps,
          explanations,
          suggestions,
          evidenceRefs: mergedEvidenceRefs,
          requirementScores,
          blockingGaps,
          matchedRequirements,
          weakRequirements,
          scoringSnapshot: {
            algorithm_version: MATCHING_ALGORITHM_VERSION,
            dimension_weights: weights,
            requirement_count: requirements.length,
            evidence_coverage: evidenceCoverage,
          },
          jobPortraitName: portrait.job_name,
          jobPortraitSnapshot: portrait,
        }),
      ),
      jobTitle,
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
