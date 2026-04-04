import type {
  JobImportResponse,
  JobsListParams,
  JobsListResponse,
} from "@career/contracts/types";

import { parseUploadedJobs } from "./jobs.importer.js";
import type { JobsRepository } from "./jobs.repository.js";

export interface JobsService {
  importJobs(file: { originalname: string; buffer: Buffer }): Promise<JobImportResponse>;
  listJobs(params: JobsListParams): Promise<JobsListResponse>;
}

export function createJobsService(repository: JobsRepository): JobsService {
  async function importJobs(file: { originalname: string; buffer: Buffer }): Promise<JobImportResponse> {
    const parsed = parseUploadedJobs(file);
    const { imported } = await repository.addJobs(parsed.rows);

    return {
      imported,
      skipped: parsed.skipped,
      message: `导入完成：新增 ${imported} 条，跳过 ${parsed.skipped} 条。`,
    };
  }

  async function listJobs(params: JobsListParams): Promise<JobsListResponse> {
    return repository.listJobs(params);
  }

  return {
    importJobs,
    listJobs,
  };
}
