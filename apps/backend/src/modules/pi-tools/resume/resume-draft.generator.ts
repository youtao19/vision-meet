import type { CreateResumeDraftRequest, ResumeDraftResponse } from "@career/contracts/types";

import type { PiThinkingLevel } from "../../../shared/agent/pi-types.js";
import { runPiSession } from "../../../shared/agent/pi-session.runner.js";
import { parseResumeDraftAgentOutput } from "./resume-draft.parser.js";
import { buildResumeDraftUserPrompt, RESUME_DRAFT_SYSTEM_PROMPT } from "./resume-draft.prompt.js";

type GenerateResumeDraftWithPiOptions = {
  traceId: string;
  input: CreateResumeDraftRequest;
  cwd: string;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel: PiThinkingLevel;
  timeoutMs?: number;
};

const RESUME_DRAFT_AGENT_TIMEOUT_MS = 180000;

export async function generateResumeDraftWithPi(
  options: GenerateResumeDraftWithPiOptions,
): Promise<ResumeDraftResponse> {
  const timeoutMs = Math.max(10000, options.timeoutMs ?? RESUME_DRAFT_AGENT_TIMEOUT_MS);

  const { model, result } = await runPiSession({
    traceId: options.traceId,
    cwd: options.cwd,
    piAgentDir: options.piAgentDir,
    sessionStoreDir: options.sessionStoreDir,
    sessionScope: "resume-draft-runtime",
    model: options.model,
    thinkingLevel: options.thinkingLevel,
    timeoutMs,
    systemPrompt: RESUME_DRAFT_SYSTEM_PROMPT,
    userPrompt: buildResumeDraftUserPrompt(options.input),
    tools: [],
    logPrefix: "ai-resume-draft",
    timeoutErrorCode: "AI_RESUME_DRAFT_TIMEOUT",
    timeoutErrorMessage: `简历追问超时（>${timeoutMs / 1000} 秒），请稍后重试`,
    agentErrorCode: "AI_RESUME_DRAFT_AGENT_ERROR",
    agentErrorMessage: (message) => `简历追问失败：${message}`,
    parseResult: parseResumeDraftAgentOutput,
  });

  return {
    trace_id: options.traceId,
    model,
    ...result,
  };
}
