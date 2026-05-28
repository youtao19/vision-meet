/**
 * 文件作用：定义岗位智能处理域的仓储抽象。
 * 设计约束：service 只依赖该抽象，具体数据库实现在 adapter 中完成。
 * 当前只保留人工岗位画像和 v2_job_profiles 方法。
 */

import type {
  ManualJobPortraitRecord,
  JobProfileV2Record,
  JobProfilesV2ListParams,
  JobProfilesV2ListResponse,
} from "@career/contracts/types";

export type JobProfileV2CreateInput = Omit<JobProfileV2Record, "id" | "created_at">;
export type ManualJobPortraitUpsertInput = Omit<
  ManualJobPortraitRecord,
  "created_at" | "updated_at"
>;

export interface JobsIntelligenceRepository {
  listManualJobPortraits?(): Promise<ManualJobPortraitRecord[]>;
  getManualJobPortraitByName?(jobName: string): Promise<ManualJobPortraitRecord | null>;
  replaceManualJobPortraits?(input: ManualJobPortraitUpsertInput[]): Promise<void>;
  getLatestProfileByJobId?(jobId: number): Promise<JobProfileV2Record | null>;
  createJobProfile?(input: JobProfileV2CreateInput): Promise<JobProfileV2Record>;
  listLatestProfiles?(params: JobProfilesV2ListParams): Promise<JobProfilesV2ListResponse>;
}
