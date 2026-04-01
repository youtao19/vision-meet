import type {
  CreateStudentProfileRequest,
  ListStudentProfilesResponse,
  StudentProfileRecord,
} from "@career/contracts/types";

import { requestJson } from "./http";

export async function fetchStudentProfiles(): Promise<ListStudentProfilesResponse> {
  return requestJson<ListStudentProfilesResponse>("/api/v1/profile");
}

export async function createStudentProfile(
  payload: CreateStudentProfileRequest,
): Promise<StudentProfileRecord> {
  return requestJson<StudentProfileRecord>("/api/v1/profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function createStudentProfileFromResume(input: {
  file: File;
  targetRole: string;
  name?: string;
  parseMode?: "strict" | "tolerant";
}): Promise<StudentProfileRecord> {
  const body = new FormData();
  body.set("file", input.file);
  body.set("target_role", input.targetRole);
  if (input.name?.trim()) {
    body.set("name", input.name.trim());
  }
  if (input.parseMode) {
    body.set("parse_mode", input.parseMode);
  }

  return requestJson<StudentProfileRecord>("/api/v1/profile/resume", {
    method: "POST",
    body,
  });
}
