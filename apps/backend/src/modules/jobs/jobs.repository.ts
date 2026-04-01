import type {
  JobProfileRecord,
  JobRecord,
  JobsListParams,
  JobsListResponse,
} from "@career/contracts/types";

export type JobCreateInput = Omit<JobRecord, "id" | "created_at">;
export type JobProfileCreateInput = Omit<JobProfileRecord, "id" | "created_at">;

export interface JobsRepository {
  addJobs(rows: JobCreateInput[]): { imported: number; insertedJobs: JobRecord[] };
  listJobs(params: JobsListParams): JobsListResponse;
  getJobById(jobId: number): JobRecord | null;
  getLatestProfileByJobId(jobId: number): JobProfileRecord | null;
  createJobProfile(profile: JobProfileCreateInput): JobProfileRecord;
  getStorePath(): string;
}
