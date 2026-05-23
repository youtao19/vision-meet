import type {
  CreateMatchRequest,
  MatchListParams,
  MatchResultDetail,
  MatchResultListResponse,
} from "@career/contracts/types";

import { requestJson } from "./http";

export async function createMatch(payload: CreateMatchRequest): Promise<MatchResultDetail> {
  return requestJson<MatchResultDetail>("/api/v2/matches", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchMatchList(params: MatchListParams): Promise<MatchResultListResponse> {
  const query = new URLSearchParams();
  query.set("offset", String(params.offset));
  query.set("limit", String(params.limit));

  if (params.student_profile_id !== undefined) {
    query.set("student_profile_id", String(params.student_profile_id));
  }

  if (params.job_portrait_name !== undefined) {
    query.set("job_portrait_name", params.job_portrait_name);
  }

  return requestJson<MatchResultListResponse>(`/api/v2/matches?${query.toString()}`);
}

export async function fetchMatchDetail(matchId: number): Promise<MatchResultDetail> {
  return requestJson<MatchResultDetail>(`/api/v2/matches/${matchId}`);
}
