import type { AiTaskResponse, CreateAiTaskRequest } from "@career/contracts/types";

import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { KnowledgeService } from "../knowledge/knowledge.service.js";
import type { MatchingService } from "../matching/matching.service.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import type { ReportService } from "../report/report.service.js";
import { createAgentService } from "../agent/agent.service.js";
import type { AiRepository } from "./ai.repository.js";

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
  getTask(taskId: number): Promise<AiTaskResponse>;
}

export function createAiService(dependencies: AiServiceDependencies): AiService {
  const agentService = createAgentService({
    agentRepository: dependencies.aiRepository,
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
    createTask: (input, runtime) => agentService.createTask(input, runtime),
    getTask: (taskId) => agentService.getTask(taskId),
  };
}
