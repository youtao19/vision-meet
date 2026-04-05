import type {
  AgentTaskResponse,
  CreateAgentTaskRequest,
  CreateResumeHtmlRequest,
  ResumeHtmlListResponse,
  ResumeHtmlRecord,
  ResumeHtmlResponse,
} from "@career/contracts/types";

import { requestJson } from "./http";

export async function createAgentTask(payload: CreateAgentTaskRequest): Promise<AgentTaskResponse> {
  return requestJson<AgentTaskResponse>("/api/v2/ai/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function createResumeHtml(
  payload: CreateResumeHtmlRequest,
): Promise<ResumeHtmlResponse> {
  return requestJson<ResumeHtmlResponse>("/api/v2/ai/resume-html", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function listResumeHtmlRecords(
  offset = 0,
  limit = 20,
): Promise<ResumeHtmlListResponse> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });

  return requestJson<ResumeHtmlListResponse>(`/api/v2/ai/resume-html?${params.toString()}`);
}

export async function getResumeHtmlRecord(resumeId: number): Promise<ResumeHtmlRecord> {
  return requestJson<ResumeHtmlRecord>(`/api/v2/ai/resume-html/${resumeId}`);
}
