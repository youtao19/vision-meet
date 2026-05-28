import type {
  CareerPathTargetOptionsResponse,
  CareerPathV2GraphResponse,
} from "@career/contracts/types";

import { requestJson } from "./http";

export async function fetchCareerPathGraph(params: {
  portrait_id: number;
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
    `/api/v2/career-paths/portraits/${params.portrait_id}${suffix}`,
  );
}

export async function fetchCareerPathTargets(): Promise<CareerPathTargetOptionsResponse> {
  return requestJson<CareerPathTargetOptionsResponse>("/api/v2/career-paths/targets");
}

export async function seedCareerPathUserData(): Promise<{ seeded: number }> {
  return requestJson<{ seeded: number }>("/api/v2/job-portraits/manual/seed", {
    method: "POST",
  });
}
