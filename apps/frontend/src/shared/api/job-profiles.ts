import type {
  JobProfileV2Record,
  JobProfilesV2ListResponse,
} from "@career/contracts/types";

import { requestJson } from "./http";

export async function fetchJobProfiles(params?: {
  keyword?: string;
  job_family?: string;
  offset?: number;
  limit?: number;
}): Promise<JobProfilesV2ListResponse> {
  const query = new URLSearchParams();
  if (params?.keyword) {
    query.set("keyword", params.keyword);
  }
  if (params?.job_family) {
    query.set("job_family", params.job_family);
  }
  query.set("offset", String(params?.offset ?? 0));
  query.set("limit", String(params?.limit ?? 20));

  return requestJson<JobProfilesV2ListResponse>(`/api/v2/job-profiles?${query.toString()}`);
}

export async function fetchJobProfileDetail(jobId: number): Promise<JobProfileV2Record> {
  return requestJson<JobProfileV2Record>(`/api/v2/job-profiles/${jobId}`);
}
