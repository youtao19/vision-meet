import type {
  CreateStudentProfileRequest,
  ListStudentProfilesResponse,
  StudentProfileRecord,
} from "@career/contracts/types";

import { apiBaseUrl } from "./http";

export async function fetchStudentProfiles(): Promise<ListStudentProfilesResponse> {
  const response = await fetch(new URL("/api/v1/profile", apiBaseUrl));
  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`);
  }

  return (await response.json()) as ListStudentProfilesResponse;
}

export async function createStudentProfile(
  payload: CreateStudentProfileRequest,
): Promise<StudentProfileRecord> {
  const response = await fetch(new URL("/api/v1/profile", apiBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`);
  }

  return (await response.json()) as StudentProfileRecord;
}
