/**
 * 文件作用：定义岗位智能处理域的仓储抽象。
 * 设计约束：service 只依赖该抽象，具体数据库实现在 adapter 中完成。
 */

import type {
  CanonicalRoleRecord,
  CanonicalRoleProfileDraft,
  CanonicalRolesListParams,
  CanonicalRolesListResponse,
  JobFactRecord,
  JobFactsListParams,
  JobFactsListResponse,
  JobPipelineFailureListResponse,
  JobPipelineMode,
  JobPipelineRetryQueueListResponse,
  ManualJobPortraitRecord,
  JobPipelineTaskRecord,
  JobProfileV2Record,
  JobProfilesV2ListParams,
  JobProfilesV2ListResponse,
  JobRecord,
  PostingProfileFacts,
} from "@career/contracts/types";

export type JobProfileV2CreateInput = Omit<JobProfileV2Record, "id" | "created_at">;
export type JobFactsCreateInput = PostingProfileFacts;
export type ManualJobPortraitUpsertInput = Omit<
  ManualJobPortraitRecord,
  "created_at" | "updated_at"
>;

export type PipelineFailureCreateInput = {
  task_id: number;
  job_id: number;
  stage: string;
  error_code: string;
  error_message: string;
  attempts: number;
  retryable: boolean;
};

export type PipelineRetryQueueCreateInput = {
  task_id: number;
  job_id: number;
  stage: string;
  attempts: number;
  next_run_at: string;
  last_error: string | null;
};

export type PipelineRetryQueueClaimRecord = {
  id: number;
  task_id: number;
  job_id: number;
  stage: string;
  attempts: number;
};

export type PipelineJobRecord = JobRecord & {
  normalized_title_hint: string | null;
  normalized_job_family_hint: string | null;
  normalization_confidence_hint: number | null;
};

export type PipelineCleanedJobCreateInput = {
  task_id: number;
  job_id: number;
  source_row_id: string | null;
  title: string;
  normalized_title: string;
  job_family: string;
  location: string | null;
  salary_range: string | null;
  company_name: string | null;
  industry: string | null;
  normalization_confidence: number;
  keywords: string[];
  cleaned_text: string;
  source_payload: Record<string, unknown>;
};

export type AgentJobPortraitUpsertInput = Omit<
  ManualJobPortraitRecord,
  "created_at" | "updated_at"
>;

export type ManualJobPortraitComicUpdateInput = {
  job_name: string;
  comic_image_url: string;
  comic_generated_at: string;
};

export type PipelineTaskUpdateInput = Partial<
  Pick<
    JobPipelineTaskRecord,
    | "status"
    | "total_jobs"
    | "processed_jobs"
    | "success_profiles"
    | "failed_profiles"
    | "graph_nodes"
    | "graph_edges"
    | "graph_covered_jobs"
    | "graph_isolated_ratio"
    | "family_count"
    | "message"
    | "error_message"
    | "started_at"
    | "finished_at"
  >
>;

export interface JobsIntelligenceRepository {
  createPipelineTask(mode: JobPipelineMode): Promise<JobPipelineTaskRecord>;
  getPipelineTask(taskId: number): Promise<JobPipelineTaskRecord | null>;
  updatePipelineTask(
    taskId: number,
    input: PipelineTaskUpdateInput,
  ): Promise<JobPipelineTaskRecord>;
  listPipelineJobs(mode: JobPipelineMode): Promise<PipelineJobRecord[]>;
  replacePipelineCleanedJobs?(
    taskId: number,
    input: PipelineCleanedJobCreateInput[],
  ): Promise<void>;
  createJobFacts(input: JobFactsCreateInput): Promise<void>;
  listLatestJobFactsForCanonical(): Promise<PostingProfileFacts[]>;
  listJobFacts(params: JobFactsListParams): Promise<JobFactsListResponse>;
  getLatestJobFactByJobId(jobId: number): Promise<JobFactRecord | null>;
  deleteCanonicalRolesNotInKeys?(roleKeys: string[]): Promise<void>;
  upsertCanonicalRoleProfile(input: CanonicalRoleProfileDraft): Promise<void>;
  listCanonicalRoles(params: CanonicalRolesListParams): Promise<CanonicalRolesListResponse>;
  getCanonicalRoleByKey(roleKey: string): Promise<CanonicalRoleRecord | null>;
  listManualJobPortraits?(): Promise<ManualJobPortraitRecord[]>;
  getManualJobPortraitByName?(jobName: string): Promise<ManualJobPortraitRecord | null>;
  listManualJobPortraitsFromTable?(): Promise<ManualJobPortraitRecord[]>;
  updateManualJobPortraitComic?(
    input: ManualJobPortraitComicUpdateInput,
  ): Promise<ManualJobPortraitRecord>;
  replaceAgentJobPortraits?(
    taskId: number,
    input: AgentJobPortraitUpsertInput[],
    metadata: { source_model: string | null; source_trace_id: string },
  ): Promise<void>;
  replaceManualJobPortraits?(input: ManualJobPortraitUpsertInput[]): Promise<void>;
  getLatestProfileByJobId(jobId: number): Promise<JobProfileV2Record | null>;
  createJobProfile(input: JobProfileV2CreateInput): Promise<JobProfileV2Record>;
  listLatestProfiles(params: JobProfilesV2ListParams): Promise<JobProfilesV2ListResponse>;
  listLatestProfilesForGraph(): Promise<JobProfileV2Record[]>;
  listJobsByIds(jobIds: number[]): Promise<JobRecord[]>;
  getPipelineJobById?(jobId: number): Promise<PipelineJobRecord | null>;
  createPipelineFailure?(input: PipelineFailureCreateInput): Promise<void>;
  enqueuePipelineRetry?(input: PipelineRetryQueueCreateInput): Promise<void>;
  claimPipelineRetryQueue?(limit: number): Promise<PipelineRetryQueueClaimRecord[]>;
  updatePipelineRetryQueueStatus?(params: {
    id: number;
    status: "pending" | "processing" | "done" | "failed";
    attempts?: number;
    next_run_at?: string;
    last_error?: string | null;
  }): Promise<void>;
  listPipelineFailures?(
    taskId: number,
    params: { offset: number; limit: number },
  ): Promise<JobPipelineFailureListResponse>;
  listPipelineRetryQueue?(params: {
    task_id?: number;
    status?: "pending" | "processing" | "done" | "failed";
    offset: number;
    limit: number;
  }): Promise<JobPipelineRetryQueueListResponse>;
}
