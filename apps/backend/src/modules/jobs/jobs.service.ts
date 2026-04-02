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
  importJobs(file: { originalname: string; buffer: Buffer }): Promise<JobImportResponse>;
  listJobs(params: JobsListParams): Promise<JobsListResponse>;
  generateProfile(input: JobProfileGenerateRequest): Promise<JobProfileGenerateResponse>;
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

  async function generateProfile(input: JobProfileGenerateRequest): Promise<JobProfileGenerateResponse> {
    const job = await repository.getJobById(input.job_id);
    if (!job) {
      throw new Error("NOT_FOUND:岗位不存在");
    }

    const latest = await repository.getLatestProfileByJobId(input.job_id);
    if (latest && !input.force_regenerate) {
      return { ...latest, cached: true };
    }

    const generated = generateJobProfile(job);
    const profileVersion = latest ? latest.profile_version + 1 : 1;

    const profile = await repository.createJobProfile({
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
  };
}
