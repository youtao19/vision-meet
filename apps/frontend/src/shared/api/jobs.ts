import type { JobsListResponse } from "@career/contracts/types";

import { apiBaseUrl } from "./http";

export async function fetchJobs(limit = 20): Promise<JobsListResponse> {
  const url = new URL("/api/v1/jobs", apiBaseUrl);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`);
  }

  return (await response.json()) as JobsListResponse;
}
