import { randomUUID } from "node:crypto";

import type { PiThinkingLevel } from "../../../shared/agent/pi-types.js";
import { runPiSession } from "../../../shared/agent/pi-session.runner.js";
import type {
  ReportGenerator,
  ReportGeneratorInput,
  ReportGeneratorResult,
} from "../../report/report.types.js";
import { parseCareerReportAgentOutput } from "./career-report.parser.js";
import {
  buildCareerReportUserPrompt,
  CAREER_REPORT_SYSTEM_PROMPT,
} from "./career-report.prompt.js";

type CareerReportGeneratorOptions = {
  cwd: string;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel: PiThinkingLevel;
  timeoutMs?: number;
};

const REPORT_AGENT_TIMEOUT_MS = 180000;

export function createCareerReportGenerator(
  options: CareerReportGeneratorOptions,
): ReportGenerator {
  return {
    async generate(input: ReportGeneratorInput): Promise<ReportGeneratorResult> {
      const timeoutMs = Math.max(10000, options.timeoutMs ?? REPORT_AGENT_TIMEOUT_MS);
      const result = await runPiSession({
        traceId: input.trace_id || randomUUID(),
        cwd: options.cwd,
        piAgentDir: options.piAgentDir,
        sessionStoreDir: options.sessionStoreDir,
        sessionScope: "career-report-runtime",
        model: options.model,
        thinkingLevel: options.thinkingLevel,
        timeoutMs,
        systemPrompt: CAREER_REPORT_SYSTEM_PROMPT,
        userPrompt: buildCareerReportUserPrompt(input),
        tools: [],
        logPrefix: "career-report-agent",
        timeoutErrorCode: "AI_REPORT_TIMEOUT",
        timeoutErrorMessage: `职业报告生成超时（>${timeoutMs / 1000} 秒），请稍后重试`,
        agentErrorCode: "AI_REPORT_AGENT_ERROR",
        agentErrorMessage: (message) => `职业报告生成失败：${message}`,
        parseResult: parseCareerReportAgentOutput,
      });

      return result.result;
    },
  };
}
