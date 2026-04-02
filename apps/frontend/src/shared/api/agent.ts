import type { AgentAnalyzeRequest, AgentAnalyzeResponse } from "@career/contracts/types";

import { requestJson } from "./http";

export async function runAgentAnalysis(payload: AgentAnalyzeRequest): Promise<AgentAnalyzeResponse> {
  return requestJson<AgentAnalyzeResponse>("/api/v1/agent/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
