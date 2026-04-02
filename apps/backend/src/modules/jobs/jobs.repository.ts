import type {
  JobProfileRecord,
  JobRecord,
  JobsListParams,
  JobsListResponse,
} from "@career/contracts/types";

export type JobCreateInput = Omit<JobRecord, "id" | "created_at">;
export type JobProfileCreateInput = Omit<JobProfileRecord, "id" | "created_at">;

export interface JobsRepository {
  addJobs(rows: JobCreateInput[]): Promise<{ imported: number; insertedJobs: JobRecord[] }>;
  listJobs(params: JobsListParams): Promise<JobsListResponse>;
  getJobById(jobId: number): Promise<JobRecord | null>;
  getLatestProfileByJobId(jobId: number): Promise<JobProfileRecord | null>;
  createJobProfile(profile: JobProfileCreateInput): Promise<JobProfileRecord>;
}
