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
  JobPipelineMode,
  JobPipelineTaskRecord,
  JobProfileV2Record,
  JobProfilesV2ListParams,
  JobProfilesV2ListResponse,
  JobRecord,
  PostingProfileFacts,
} from "@career/contracts/types";

export type JobProfileV2CreateInput = Omit<JobProfileV2Record, "id" | "created_at">;
export type JobFactsCreateInput = PostingProfileFacts;

export type PipelineJobRecord = JobRecord & {
  normalized_title_hint: string | null;
  normalized_job_family_hint: string | null;
  normalization_confidence_hint: number | null;
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
  updatePipelineTask(taskId: number, input: PipelineTaskUpdateInput): Promise<JobPipelineTaskRecord>;
  listPipelineJobs(mode: JobPipelineMode): Promise<PipelineJobRecord[]>;
  createJobFacts(input: JobFactsCreateInput): Promise<void>;
  listLatestJobFactsForCanonical(): Promise<PostingProfileFacts[]>;
  listJobFacts(params: JobFactsListParams): Promise<JobFactsListResponse>;
  getLatestJobFactByJobId(jobId: number): Promise<JobFactRecord | null>;
  upsertCanonicalRoleProfile(input: CanonicalRoleProfileDraft): Promise<void>;
  listCanonicalRoles(params: CanonicalRolesListParams): Promise<CanonicalRolesListResponse>;
  getCanonicalRoleByKey(roleKey: string): Promise<CanonicalRoleRecord | null>;
  getLatestProfileByJobId(jobId: number): Promise<JobProfileV2Record | null>;
  createJobProfile(input: JobProfileV2CreateInput): Promise<JobProfileV2Record>;
  listLatestProfiles(params: JobProfilesV2ListParams): Promise<JobProfilesV2ListResponse>;
  listLatestProfilesForGraph(): Promise<JobProfileV2Record[]>;
  listJobsByIds(jobIds: number[]): Promise<JobRecord[]>;
}
