import type {
  CareerPathV2GenerateRequest,
  CareerPathV2GenerateResponse,
  CareerPathV2GraphResponse,
} from "@career/contracts/types";

import { requestJson } from "./http";

export async function fetchCareerPathGraph(params: {
  job_id: number;
  student_profile_id?: number;
  depth?: number;
  relation_type?: "promotion" | "transition" | "skill_migration" | "all";
  min_score?: number;
}): Promise<CareerPathV2GraphResponse> {
  const query = new URLSearchParams();
  if (params.student_profile_id !== undefined) {
    query.set("student_profile_id", String(params.student_profile_id));
  }
  if (params.depth !== undefined) {
    query.set("depth", String(params.depth));
  }
  if (params.relation_type !== undefined) {
    query.set("relation_type", params.relation_type);
  }
  if (params.min_score !== undefined) {
    query.set("min_score", String(params.min_score));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<CareerPathV2GraphResponse>(
    `/api/v2/career-paths/jobs/${params.job_id}${suffix}`,
  );
}

export async function generateCareerPathGraph(
  payload: CareerPathV2GenerateRequest = {},
): Promise<CareerPathV2GenerateResponse> {
  return requestJson<CareerPathV2GenerateResponse>("/api/v2/career-paths/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
