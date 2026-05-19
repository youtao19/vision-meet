import type {
  AiTaskResponse,
  CreateAiTaskRequest,
  CreateResumeHtmlRequest,
  CreateAiPolishRequest,
  AiPolishResponse,
  ResumeHtmlListResponse,
  ResumeHtmlRecord,
  ResumeHtmlResponse,
} from "@career/contracts/types";

import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { KnowledgeService } from "../knowledge/knowledge.service.js";
import type { MatchingService } from "../matching/matching.service.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import type { ReportService } from "../report/report.service.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type { AiRepository } from "./ai.repository.js";
import { createAiTaskService } from "./ai-task.service.js";
import { runResumeHtmlAgent } from "./runtime/ai-resume.runtime.js";

type AiServiceDependencies = {
  aiRepository: AiRepository;
  profileRepository: ProfileRepository;
  jobsRepository: JobsRepository;
  knowledgeService: KnowledgeService;
  matchingService: MatchingService;
  reportService: ReportService;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  resumeTimeoutMs?: number;
  cwd?: string;
};

export type AiTaskRuntimeContext = {
  traceId: string;
};

/**
 * 文件作用：提供 AI 中枢的统一服务入口。
 * 设计说明：这一阶段先复用既有任务型 Agent 执行链路，把“统一入口”与“执行内核继续演进”拆开，降低改造风险。
 */
export interface AiService {
  createTask(input: CreateAiTaskRequest, runtime: AiTaskRuntimeContext): Promise<AiTaskResponse>;
  generateResumeHtml(
    input: CreateResumeHtmlRequest,
    runtime: AiTaskRuntimeContext,
  ): Promise<ResumeHtmlResponse>;
  polishText(
    input: CreateAiPolishRequest,
    runtime: AiTaskRuntimeContext,
  ): Promise<AiPolishResponse>;
  listResumeHtmlRecords(offset: number, limit: number): Promise<ResumeHtmlListResponse>;
  getResumeHtmlRecordById(resumeId: number): Promise<ResumeHtmlRecord>;
  getTask(taskId: number): Promise<AiTaskResponse>;
}

export function createAiService(dependencies: AiServiceDependencies): AiService {
  const taskService = createAiTaskService({
    aiRepository: dependencies.aiRepository,
    profileRepository: dependencies.profileRepository,
    jobsRepository: dependencies.jobsRepository,
    knowledgeService: dependencies.knowledgeService,
    matchingService: dependencies.matchingService,
    reportService: dependencies.reportService,
    piAgentDir: dependencies.piAgentDir,
    sessionStoreDir: dependencies.sessionStoreDir,
    model: dependencies.model,
    thinkingLevel: dependencies.thinkingLevel,
    cwd: dependencies.cwd,
  });

  return {
    createTask: (input, runtime) => taskService.createTask(input, runtime),
    generateResumeHtml: async (input, runtime) => {
      const generated = await runResumeHtmlAgent({
        input,
        traceId: runtime.traceId,
        cwd: dependencies.cwd || process.cwd(),
        piAgentDir: dependencies.piAgentDir,
        sessionStoreDir: dependencies.sessionStoreDir,
        model: dependencies.model,
        thinkingLevel: dependencies.thinkingLevel || "medium",
        timeoutMs: dependencies.resumeTimeoutMs,
      });

      const record = await dependencies.aiRepository.createResumeHtmlRecord({
        trace_id: runtime.traceId,
        model: generated.model,
        basic_name: input.basic.name,
        target_position: input.basic.target_position,
        summary: input.summary || null,
        input_payload: input,
        html: generated.html,
      });

      return {
        ...generated,
        resume_id: record.id,
      };
    },
    listResumeHtmlRecords: (offset, limit) =>
      dependencies.aiRepository.listResumeHtmlRecords({ offset, limit }),
    polishText: async (input, runtime) => {
      const { runPolishAgent } = await import("./runtime/ai-polish.runtime.js");
      return runPolishAgent({
        input,
        traceId: runtime.traceId,
        piAgentDir: dependencies.piAgentDir,
        sessionStoreDir: dependencies.sessionStoreDir,
        model: dependencies.model,
        cwd: dependencies.cwd || process.cwd(),
      });
    },
    getResumeHtmlRecordById: async (resumeId) => {
      const record = await dependencies.aiRepository.getResumeHtmlRecordById(resumeId);
      if (!record) {
        throw new HttpError(404, "AI_RESUME_HTML_NOT_FOUND", "简历记录不存在");
      }
      return record;
    },
    getTask: (taskId) => taskService.getTask(taskId),
  };
}
