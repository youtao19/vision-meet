import type { JobsListResponse } from "@career/contracts/types";

import { requestJson } from "./http";

/**
 * 文件作用：封装岗位列表查询接口。
 * 说明：支持按关键字检索，供学生画像页复用做岗位建议输入。
 */
export async function fetchJobs(
  options: {
    limit?: number;
    keyword?: string;
  } = {},
): Promise<JobsListResponse> {
  const query = new URLSearchParams({ limit: String(options.limit ?? 20) });
  if (options.keyword?.trim()) {
    query.set("keyword", options.keyword.trim());
  }
  return requestJson<JobsListResponse>(`/api/v2/jobs?${query.toString()}`);
}
