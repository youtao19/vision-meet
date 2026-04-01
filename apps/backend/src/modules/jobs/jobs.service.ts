import type {
  JobImportResponse,
  JobProfileGenerateRequest,
  JobProfileGenerateResponse,
  JobsListParams,
  JobsListResponse,
} from "@career/contracts/types";

import { parseUploadedJobs } from "./jobs.importer.js";
import { generateJobProfile } from "./jobs.profile.js";
import type { JobsRepository } from "./jobs.repository.js";

export interface JobsService {
  importJobs(file: { originalname: string; buffer: Buffer }): JobImportResponse;
  listJobs(params: JobsListParams): JobsListResponse;
  generateProfile(input: JobProfileGenerateRequest): JobProfileGenerateResponse;
  getStorePath(): string;
}

export function createJobsService(repository: JobsRepository): JobsService {
  function importJobs(file: { originalname: string; buffer: Buffer }): JobImportResponse {
    const parsed = parseUploadedJobs(file);
    const { imported } = repository.addJobs(parsed.rows);

    return {
      imported,
      skipped: parsed.skipped,
      message: `导入完成：新增 ${imported} 条，跳过 ${parsed.skipped} 条。`,
    };
  }

  function listJobs(params: JobsListParams): JobsListResponse {
    return repository.listJobs(params);
  }

  function generateProfile(input: JobProfileGenerateRequest): JobProfileGenerateResponse {
    const job = repository.getJobById(input.job_id);
    if (!job) {
      throw new Error("NOT_FOUND:岗位不存在");
    }

    const latest = repository.getLatestProfileByJobId(input.job_id);
    if (latest && !input.force_regenerate) {
      return { ...latest, cached: true };
    }

    const generated = generateJobProfile(job);
    const profileVersion = latest ? latest.profile_version + 1 : 1;

    const profile = repository.createJobProfile({
      job_id: job.id,
      profile_version: profileVersion,
      hard_skills: generated.hard_skills,
      certificates: generated.certificates,
      soft_skills: generated.soft_skills,
      skill_weights: generated.skill_weights,
      summary: generated.summary,
      confidence: generated.confidence,
    });

    return { ...profile, cached: false };
  }

  return {
    importJobs,
    listJobs,
    generateProfile,
    getStorePath: repository.getStorePath,
  };
}
