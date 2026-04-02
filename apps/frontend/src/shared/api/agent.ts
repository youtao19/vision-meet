import type { AgentTaskResponse, CreateAgentTaskRequest } from "@career/contracts/types";

import { requestJson } from "./http";

export async function createAgentTask(payload: CreateAgentTaskRequest): Promise<AgentTaskResponse> {
  return requestJson<AgentTaskResponse>("/api/v1/agent/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
