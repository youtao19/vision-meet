import type { CreateResumeHtmlRequest, ResumeHtmlResponse } from "@career/contracts/types";

import { HttpError } from "../../../shared/errors/http-error.js";
import type { PiThinkingLevel } from "../../../shared/agent/pi-types.js";
import { runPiSession } from "../../../shared/agent/pi-session.runner.js";
import { ensurePrintableControls, extractHtmlFromAgentText } from "./resume-html.parser.js";
import {
  buildResumeHtmlUserPrompt,
  RESUME_GENERATION_SYSTEM_PROMPT,
} from "./resume-html.prompt.js";

/**
 * 使用 Pi Agent 生成简历 HTML 的参数。
 * 必填：traceId、input、cwd、thinkingLevel
 * 选填：Pi Agent 目录、会话目录、模型、超时时间
 */
type GenerateResumeHtmlWithPiOptions = {
  traceId: string;
  input: CreateResumeHtmlRequest;
  cwd: string;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel: PiThinkingLevel;
  timeoutMs?: number;
};

/**
 * Agent 生成的简历 HTML 结果。
 * 说明：这里不包含 resume_id，因为数据库保存后才会生成 ID。
 */
export type GeneratedResumeHtml = Omit<ResumeHtmlResponse, "resume_id">;

/**
 * 简历生成默认超时时间。
 */
const RESUME_AGENT_TIMEOUT_MS = 180000;

/**
 * 调用 Pi Agent 生成简历 HTML。
 * 作用：初始化 Agent 会话，发送简历生成提示词，解析模型返回的 HTML。
 */
export async function generateResumeHtmlWithPi(
  options: GenerateResumeHtmlWithPiOptions,
): Promise<GeneratedResumeHtml> {
  const timeoutMs = Math.max(10000, options.timeoutMs ?? RESUME_AGENT_TIMEOUT_MS);

  const { model, result: html } = await runPiSession({
    traceId: options.traceId,
    cwd: options.cwd,
    piAgentDir: options.piAgentDir,
    sessionStoreDir: options.sessionStoreDir,
    sessionScope: "resume-html-runtime",
    model: options.model,
    thinkingLevel: options.thinkingLevel,
    timeoutMs,
    systemPrompt: RESUME_GENERATION_SYSTEM_PROMPT,
    userPrompt: buildResumeHtmlUserPrompt(options.input),
    tools: [],
    logPrefix: "ai-resume",
    timeoutErrorCode: "AI_RESUME_HTML_TIMEOUT",
    timeoutErrorMessage: `简历生成超时（>${timeoutMs / 1000} 秒），请稍后重试`,
    agentErrorCode: "AI_RESUME_HTML_AGENT_ERROR",
    agentErrorMessage: (message) => `简历生成失败：${message}`,
    parseResult: (rawText) => {
      const html = extractHtmlFromAgentText(rawText);
      if (!html) {
        throw new HttpError(502, "AI_RESUME_HTML_OUTPUT_INVALID", "模型未返回可用的 HTML 简历");
      }
      return ensurePrintableControls(html);
    },
  });

  return {
    trace_id: options.traceId,
    model,
    html,
    generated_at: new Date().toISOString(),
  };
}
