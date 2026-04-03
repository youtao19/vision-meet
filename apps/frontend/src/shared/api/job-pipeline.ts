import type {
  JobPipelineRunRequest,
  JobPipelineTaskRecord,
} from "@career/contracts/types";

import { requestJson } from "./http";

export async function runJobPipeline(
  payload: JobPipelineRunRequest,
): Promise<JobPipelineTaskRecord> {
  return requestJson<JobPipelineTaskRecord>("/api/v2/jobs/pipeline/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchJobPipelineTask(taskId: number): Promise<JobPipelineTaskRecord> {
  return requestJson<JobPipelineTaskRecord>(`/api/v2/jobs/pipeline/tasks/${taskId}`);
}
