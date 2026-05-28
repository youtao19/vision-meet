/**
 * 文件作用：承载岗位智能处理域核心业务逻辑（画像查询）。
 * 设计边界：service 负责业务编排和容错，具体读写由 repository adapter 完成。
 * 当前只保留人工岗位画像方法。
 */

import type { ManualJobPortraitRecord } from "@career/contracts/types";

import { HttpError } from "../../shared/errors/http-error.js";
import { MANUAL_JOB_PORTRAITS_SEED } from "./manual-job-portraits.seed.js";
import type { JobsIntelligenceRepository } from "./jobs-intelligence.repository.js";

export interface JobsIntelligenceService {
  listManualJobPortraits(): Promise<ManualJobPortraitRecord[]>;
  seedManualJobPortraits(): Promise<{ seeded: number }>;
}

export function createJobsIntelligenceService(
  repository: JobsIntelligenceRepository,
): JobsIntelligenceService {
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
    listManualJobPortraits,
    seedManualJobPortraits,
  };
}
