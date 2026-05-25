import { randomUUID } from "node:crypto";

import type { CreateStudentProfileFromResumeRequest } from "@career/contracts/types";

import type { AppEnv } from "../../../shared/config/env.js";
import { HttpError } from "../../../shared/errors/http-error.js";
import type { AiThinkingLevel } from "../../ai/runtime/ai-agent.types.js";
import type {
  PiSessionImageInput,
  PiSessionRunResult,
} from "../../ai/runtime/pi-session.runner.js";
import { runPiSession } from "../../ai/runtime/pi-session.runner.js";
import type { AgentExtractedProfile, ResumeRaw } from "./parse-resume-profile.parser.js";
import {
  parseResumeRawAgentOutput,
  parseStudentProfileAgentOutput,
} from "./parse-resume-profile.parser.js";
import {
  buildResumeRawExtractionPrompt,
  RESUME_RAW_SYSTEM_PROMPT,
} from "./prompts/resume-raw.prompt.js";
import {
  buildStudentProfilePrompt,
  STUDENT_PROFILE_SYSTEM_PROMPT,
} from "./prompts/student-profile.prompt.js";

const RESUME_PROFILE_TIMEOUT_MS = 180000;

type ParseResumeProfileWithPiOptions = {
  input: CreateStudentProfileFromResumeRequest;
  env?: AppEnv;
  cwd?: string;
};

function getValidationIssues(error: unknown): string[] {
  if (
    error instanceof HttpError &&
    error.detail &&
    typeof error.detail === "object" &&
    Array.isArray((error.detail as { issues?: unknown }).issues)
  ) {
    return (error.detail as { issues: string[] }).issues;
  }
  return [error instanceof Error ? error.message : String(error)];
}

async function runValidatedPiSession<T>(params: {
  cwd: string;
  env: AppEnv;
  sessionScope: string;
  logPrefix: string;
  systemPrompt: string;
  userPrompt: string;
  images?: PiSessionImageInput[];
  parseResult: (rawText: string) => T;
  timeoutMs: number;
  timeoutErrorCode: string;
  timeoutErrorMessage: string;
  agentErrorCode: string;
  agentErrorMessage: (message: string) => string;
}): Promise<PiSessionRunResult<T>> {
  const baseOptions = {
    cwd: params.cwd,
    piAgentDir: params.env.AGENT_PI_DIR,
    sessionStoreDir: params.env.AGENT_SESSION_STORE_DIR,
    sessionScope: params.sessionScope,
    thinkingLevel: (params.env.AGENT_THINKING_LEVEL || "medium") as AiThinkingLevel,
    timeoutMs: params.timeoutMs,
    systemPrompt: params.systemPrompt,
    images: params.images,
    tools: [],
    logPrefix: params.logPrefix,
    timeoutErrorCode: params.timeoutErrorCode,
    timeoutErrorMessage: params.timeoutErrorMessage,
    agentErrorCode: params.agentErrorCode,
    agentErrorMessage: params.agentErrorMessage,
    parseResult: params.parseResult,
  };

  try {
    return await runPiSession({
      ...baseOptions,
      traceId: randomUUID(),
      userPrompt: params.userPrompt,
    });
  } catch (error) {
    if (
      !(error instanceof HttpError) ||
      !["RESUME_RAW_AGENT_OUTPUT_INVALID", "STUDENT_PROFILE_AGENT_OUTPUT_INVALID"].includes(
        error.code,
      )
    ) {
      throw error;
    }
    const issues = getValidationIssues(error);
    const retryPrompt = [
      params.userPrompt,
      "",
      "上一次输出未通过后端 Zod 校验，请只重新输出一个合法 JSON 对象。",
      "校验错误：",
      ...issues.map((issue) => `- ${issue}`),
    ].join("\n");

    return runPiSession({
      ...baseOptions,
      traceId: randomUUID(),
      userPrompt: retryPrompt,
    });
  }
}

export async function parseResumeProfileWithPi(
  options: ParseResumeProfileWithPiOptions,
): Promise<{ extracted: AgentExtractedProfile; model: string | null }> {
  const env = options.env;
  if (!env) {
    throw new HttpError(500, "APP_ENV_REQUIRED", "简历画像解析缺少运行环境配置");
  }

  const cwd = options.cwd || process.cwd();
  const timeoutMs = Math.min(env.AGENT_RESUME_TIMEOUT_MS || RESUME_PROFILE_TIMEOUT_MS, 300000);
  const images = options.input.file_images?.map((item) => ({
    type: "image" as const,
    data: item.data,
    mimeType: item.mimeType,
  }));

  const rawResult = await runValidatedPiSession<ResumeRaw>({
    cwd,
    env,
    sessionScope: "resume-raw-runtime",
    logPrefix: "resume-raw-agent",
    timeoutMs,
    systemPrompt: RESUME_RAW_SYSTEM_PROMPT,
    userPrompt: buildResumeRawExtractionPrompt(options.input),
    images,
    timeoutErrorCode: "STUDENT_PROFILE_AGENT_TIMEOUT",
    timeoutErrorMessage: "简历事实抽取超时，请稍后重试",
    agentErrorCode: "RESUME_RAW_AGENT_ERROR",
    agentErrorMessage: (message) => `简历事实抽取失败：${message}`,
    parseResult: parseResumeRawAgentOutput,
  });

  const profileResult = await runValidatedPiSession<AgentExtractedProfile>({
    cwd,
    env,
    sessionScope: "student-profile-runtime",
    logPrefix: "student-profile-agent",
    timeoutMs,
    systemPrompt: STUDENT_PROFILE_SYSTEM_PROMPT,
    userPrompt: buildStudentProfilePrompt({
      resumeRaw: rawResult.result,
      input: options.input,
    }),
    timeoutErrorCode: "STUDENT_PROFILE_AGENT_TIMEOUT",
    timeoutErrorMessage: "学生画像生成超时，请稍后重试",
    agentErrorCode: "STUDENT_PROFILE_AGENT_ERROR",
    agentErrorMessage: (message) => `学生画像生成失败：${message}`,
    parseResult: parseStudentProfileAgentOutput,
  });

  return {
    extracted: profileResult.result,
    model: profileResult.model || rawResult.model,
  };
}
