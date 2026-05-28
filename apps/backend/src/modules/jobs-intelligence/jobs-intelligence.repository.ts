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
  ManualJobPortraitRecord,
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

type AgentJobPortraitDimensionInput = {
  level: number;
  weight: number;
  description: string;
};

export type AgentJobPortraitUpsertInput = {
  job_name: string;
  category: string;
  skills: AgentJobPortraitDimensionInput;
  certification: AgentJobPortraitDimensionInput;
  innovation: AgentJobPortraitDimensionInput;
  learning: AgentJobPortraitDimensionInput;
  stress: AgentJobPortraitDimensionInput;
  communication: AgentJobPortraitDimensionInput;
  experience: AgentJobPortraitDimensionInput;
};

export interface JobsIntelligenceRepository {
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
}
