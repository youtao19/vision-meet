import type {
  GenerateJobPortraitPictureBookResponse,
  GeneratePictureBookResponse,
  JobPictureBook,
  JobPortraitPictureBookContext,
  ManualJobPortraitListResponse,
} from "@career/contracts/types";

import { requestJson } from "./http";

export async function fetchManualJobPortraits(): Promise<ManualJobPortraitListResponse> {
  return requestJson<ManualJobPortraitListResponse>("/api/v2/job-portraits/manual");
}

export async function generateJobPortraitPictureBook(
  jobName: string,
  input: { force?: boolean; comic_context?: JobPortraitPictureBookContext } = {},
): Promise<GenerateJobPortraitPictureBookResponse> {
  return requestJson<GenerateJobPortraitPictureBookResponse>(
    `/api/v2/job-portraits/manual/${encodeURIComponent(jobName)}/picture-book`,
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

export async function fetchJobPortraitPictureBook(
  jobName: string,
): Promise<{ job_name: string; comic_image_url: string | null }> {
  return requestJson<{ job_name: string; comic_image_url: string | null }>(
    `/api/v2/job-portraits/manual/${encodeURIComponent(jobName)}/picture-book`,
  );
}

export async function generateJobPictureBook(
  jobName: string,
  input: { force?: boolean; comic_context?: JobPortraitPictureBookContext } = {},
): Promise<GeneratePictureBookResponse> {
  return requestJson<GeneratePictureBookResponse>(
    `/api/v2/job-portraits/manual/${encodeURIComponent(jobName)}/picture-book-interactive`,
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

export async function fetchJobPictureBook(jobName: string): Promise<JobPictureBook> {
  return requestJson<JobPictureBook>(
    `/api/v2/job-portraits/manual/${encodeURIComponent(jobName)}/picture-book-interactive`,
  );
}
