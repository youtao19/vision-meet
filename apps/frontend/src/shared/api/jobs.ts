import type { JobsListResponse } from "@career/contracts/types";

import { requestJson } from "./http";

export async function fetchJobs(limit = 20): Promise<JobsListResponse> {
  const query = new URLSearchParams({ limit: String(limit) });
  return requestJson<JobsListResponse>(`/api/v1/jobs?${query.toString()}`);
}
