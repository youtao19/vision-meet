import type {
  MatchListParams,
  MatchResultDetail,
  MatchResultListResponse,
  MatchResultSummary,
} from "@career/contracts/types";

/**
 * 文件作用：定义 matching 领域仓储抽象。
 * 设计约束：service 只依赖该抽象，具体存储细节由 adapter 实现。
 */
export type MatchResultCreateInput = Omit<MatchResultDetail, "id" | "created_at" | "from_cache"> & {
  from_cache?: boolean;
};

export type MatchResultUniqueKey = Pick<
  MatchResultSummary,
  "student_profile_id" | "job_id" | "job_profile_version" | "scoring_version" | "input_fingerprint"
>;

export type NormalizedJobHint = {
  normalized_title: string | null;
  normalized_job_family: string | null;
  confidence: number | null;
};

export interface MatchingRepository {
  createMatchResult(input: MatchResultCreateInput): Promise<MatchResultDetail>;
  getMatchResultById(matchId: number): Promise<MatchResultDetail | null>;
  listMatchResults(params: MatchListParams): Promise<MatchResultListResponse>;
  findReusableResult(uniqueKey: MatchResultUniqueKey): Promise<MatchResultDetail | null>;
  getNormalizedJobHint(jobId: number): Promise<NormalizedJobHint | null>;
}
