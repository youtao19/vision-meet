import type { CareerPathGraphResponse } from "@career/contracts/types";

import { requestJson } from "./http";

export async function fetchCareerPathGraph(params: {
  job_id: number;
  student_profile_id?: number;
  depth?: number;
}): Promise<CareerPathGraphResponse> {
  const query = new URLSearchParams();
  if (params.student_profile_id !== undefined) {
    query.set("student_profile_id", String(params.student_profile_id));
  }
  if (params.depth !== undefined) {
    query.set("depth", String(params.depth));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<CareerPathGraphResponse>(`/api/v1/career-paths/jobs/${params.job_id}${suffix}`);
}
