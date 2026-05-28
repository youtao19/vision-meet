/**
 * 文件作用：承载岗位智能处理域核心业务逻辑（画像查询）。
 * 设计边界：service 负责业务编排和容错，具体读写由 repository adapter 完成。
 */

import type {
  CanonicalRoleRecord,
  CanonicalRolesListParams,
  CanonicalRolesListResponse,
  JobFactsListParams,
  JobFactsListResponse,
  JobFactRecord,
  ManualJobPortraitRecord,
  PostingProfileFacts,
} from "@career/contracts/types";

import { HttpError } from "../../shared/errors/http-error.js";
import {
  CANONICAL_MIN_CONFIDENCE,
  isPostingFactEligibleForCanonical,
} from "./jobs-intelligence.profile.js";
import { MANUAL_JOB_PORTRAITS_SEED } from "./manual-job-portraits.seed.js";
import type { JobsIntelligenceRepository } from "./jobs-intelligence.repository.js";

type CanonicalEligibilityDiagnostics = {
  totalLatestFacts: number;
  eligibleFacts: number;
  rejectedLowConfidence: number;
  rejectedMissingEvidence: number;
  rejectedBoth: number;
};

type CanonicalGroupingDiagnostics = {
  groupCount: number;
  singleSampleGroupCount: number;
  maxGroupSize: number;
  p50GroupSize: number;
  p90GroupSize: number;
  topGroups: Array<{ roleKey: string; sampleSize: number }>;
};

function analyzeCanonicalEligibility(
  factsList: PostingProfileFacts[],
): CanonicalEligibilityDiagnostics {
  let eligibleFacts = 0;
  let rejectedLowConfidence = 0;
  let rejectedMissingEvidence = 0;
  let rejectedBoth = 0;

  for (const item of factsList) {
    const lowConfidence = item.confidence < CANONICAL_MIN_CONFIDENCE;
    const missingEvidence = item.evidence.length === 0;

    if (isPostingFactEligibleForCanonical(item)) {
      eligibleFacts += 1;
      continue;
    }

    if (lowConfidence) {
      rejectedLowConfidence += 1;
    }
    if (missingEvidence) {
      rejectedMissingEvidence += 1;
    }
    if (lowConfidence && missingEvidence) {
      rejectedBoth += 1;
    }
  }

  return {
    totalLatestFacts: factsList.length,
    eligibleFacts,
    rejectedLowConfidence,
    rejectedMissingEvidence,
    rejectedBoth,
  };
}

function pickPercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const normalized = Math.min(1, Math.max(0, percentile));
  const index = Math.max(0, Math.ceil(sortedValues.length * normalized) - 1);
  return sortedValues[index] ?? 0;
}

function analyzeCanonicalGrouping(
  groupedFacts: Map<string, PostingProfileFacts[]>,
): CanonicalGroupingDiagnostics {
  const groups = Array.from(groupedFacts.entries()).map(([roleKey, items]) => ({
    roleKey,
    sampleSize: items.length,
  }));
  const sortedBySample = [...groups].sort((left, right) => right.sampleSize - left.sampleSize);
  const sortedSampleSizes = sortedBySample.map((item) => item.sampleSize).sort((a, b) => a - b);

  return {
    groupCount: groups.length,
    singleSampleGroupCount: groups.filter((item) => item.sampleSize === 1).length,
    maxGroupSize: sortedBySample[0]?.sampleSize ?? 0,
    p50GroupSize: pickPercentile(sortedSampleSizes, 0.5),
    p90GroupSize: pickPercentile(sortedSampleSizes, 0.9),
    topGroups: sortedBySample.slice(0, 10),
  };
}

export interface JobsIntelligenceService {
  listJobFacts(params: JobFactsListParams): Promise<JobFactsListResponse>;
  getJobFact(jobId: number): Promise<JobFactRecord>;
  listCanonicalRoles(params: CanonicalRolesListParams): Promise<CanonicalRolesListResponse>;
  getCanonicalRole(roleKey: string): Promise<CanonicalRoleRecord>;
  listManualJobPortraits(): Promise<ManualJobPortraitRecord[]>;
  seedManualJobPortraits(): Promise<{ seeded: number }>;
}

export function createJobsIntelligenceService(
  repository: JobsIntelligenceRepository,
): JobsIntelligenceService {
  async function listJobFacts(params: JobFactsListParams): Promise<JobFactsListResponse> {
    return repository.listJobFacts(params);
  }

  async function getJobFact(jobId: number): Promise<JobFactRecord> {
    const fact = await repository.getLatestJobFactByJobId(jobId);
    if (!fact) {
      throw new HttpError(404, "JOB_FACT_NOT_FOUND", "目标岗位事实不存在");
    }
    return fact;
  }

  async function listCanonicalRoles(
    params: CanonicalRolesListParams,
  ): Promise<CanonicalRolesListResponse> {
    return repository.listCanonicalRoles(params);
  }

  async function getCanonicalRole(roleKey: string): Promise<CanonicalRoleRecord> {
    const role = await repository.getCanonicalRoleByKey(roleKey);
    if (!role) {
      throw new HttpError(404, "CANONICAL_ROLE_NOT_FOUND", "目标标准岗位不存在");
    }
    return role;
  }

  async function listManualJobPortraits(): Promise<ManualJobPortraitRecord[]> {
    if (typeof repository.listManualJobPortraits !== "function") {
      throw new HttpError(
        501,
        "MANUAL_JOB_PORTRAITS_UNSUPPORTED",
        "当前仓储未实现人工岗位画像查询",
      );
    }
    return repository.listManualJobPortraits();
  }

  async function seedManualJobPortraits(): Promise<{ seeded: number }> {
    if (typeof repository.replaceManualJobPortraits !== "function") {
      throw new HttpError(
        501,
        "MANUAL_JOB_PORTRAITS_SEED_UNSUPPORTED",
        "当前仓储未实现人工岗位画像写入",
      );
    }
    await repository.replaceManualJobPortraits(MANUAL_JOB_PORTRAITS_SEED);
    return { seeded: MANUAL_JOB_PORTRAITS_SEED.length };
  }

  return {
    listJobFacts,
    getJobFact,
    listCanonicalRoles,
    getCanonicalRole,
    listManualJobPortraits,
    seedManualJobPortraits,
  };
}
