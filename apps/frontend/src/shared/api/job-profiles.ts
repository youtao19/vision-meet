import type {
  CanonicalRolesListResponse,
  GenerateJobPortraitComicResponse,
  JobPortraitComicContext,
  ManualJobPortraitListResponse,
} from "@career/contracts/types";

import { requestJson } from "./http";

export async function fetchCanonicalRoles(params?: {
  keyword?: string;
  job_family?: string;
  level_band?: string;
  offset?: number;
  limit?: number;
}): Promise<CanonicalRolesListResponse> {
  const query = new URLSearchParams();
  if (params?.keyword) {
    query.set("keyword", params.keyword);
  }
  if (params?.job_family) {
    query.set("job_family", params.job_family);
  }
  if (params?.level_band) {
    query.set("level_band", params.level_band);
  }
  query.set("offset", String(params?.offset ?? 0));
  query.set("limit", String(params?.limit ?? 20));

  return requestJson<CanonicalRolesListResponse>("/api/v2/canonical-roles?" + query.toString());
}

export async function fetchManualJobPortraits(): Promise<ManualJobPortraitListResponse> {
  return requestJson<ManualJobPortraitListResponse>("/api/v2/job-portraits/manual");
}

export async function generateJobPortraitComic(
  jobName: string,
  input: { force?: boolean; comic_context?: JobPortraitComicContext } = {},
): Promise<GenerateJobPortraitComicResponse> {
  return requestJson<GenerateJobPortraitComicResponse>(
    `/api/v2/job-portraits/manual/${encodeURIComponent(jobName)}/comic`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        force: input.force ?? false,
        comic_context: input.comic_context,
      }),
    },
  );
}

export async function fetchJobPortraitComic(
  jobName: string,
): Promise<{ job_name: string; comic_image_url: string | null }> {
  return requestJson<{ job_name: string; comic_image_url: string | null }>(
    `/api/v2/job-portraits/manual/${encodeURIComponent(jobName)}/comic`,
  );
}
