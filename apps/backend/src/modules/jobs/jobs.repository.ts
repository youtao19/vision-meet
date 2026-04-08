import type {
  JobProfileV2Record,
  JobRecord,
  JobsListParams,
  JobsListResponse,
} from "@career/contracts/types";

export type JobCreateInput = Omit<JobRecord, "id" | "created_at">;

export interface JobsRepository {
  addJobs(rows: JobCreateInput[]): Promise<{ imported: number; insertedJobs: JobRecord[] }>;
  listJobs(params: JobsListParams): Promise<JobsListResponse>;
  getJobById(jobId: number): Promise<JobRecord | null>;
  getLatestProfileV2ByJobId(jobId: number): Promise<JobProfileV2Record | null>;
}
