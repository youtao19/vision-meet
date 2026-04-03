import type { CareerPathV2GraphResponse } from "@career/contracts/types";

import { requestJson } from "./http";

export async function fetchCareerPathGraph(params: {
  job_id: number;
  student_profile_id?: number;
  depth?: number;
}): Promise<CareerPathV2GraphResponse> {
  const query = new URLSearchParams();
  if (params.depth !== undefined) {
    query.set("depth", String(params.depth));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<CareerPathV2GraphResponse>(`/api/v2/career-paths/jobs/${params.job_id}${suffix}`);
}
