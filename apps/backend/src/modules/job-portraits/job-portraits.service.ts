import type { ManualJobPortraitRecord } from "@career/contracts/types";

import { HttpError } from "../../shared/errors/http-error.js";
import { MANUAL_JOB_PORTRAITS_SEED } from "./manual-job-portraits.seed.js";
import type { JobPortraitsRepository } from "./job-portraits.repository.js";

export interface JobPortraitsService {
  listManualJobPortraits(): Promise<ManualJobPortraitRecord[]>;
  seedManualJobPortraits(): Promise<{ seeded: number }>;
}

export function createJobPortraitsService(
  repository: JobPortraitsRepository,
): JobPortraitsService {
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
