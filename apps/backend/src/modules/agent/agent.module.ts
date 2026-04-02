import type { Router } from "express";

import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { MatchingService } from "../matching/matching.service.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import type { ReportService } from "../report/report.service.js";
import type { KnowledgeService } from "../knowledge/knowledge.service.js";
import type { LlmClient } from "../../shared/llm/llm-client.js";
import { createAgentRouter } from "./agent.route.js";
import { createJsonAgentRepository } from "./agent.repository.json.js";
import { createAgentService } from "./agent.service.js";

export type AgentModuleOptions = {
  runStorePath?: string;
};

export type AgentModuleDependencies = {
  profileRepository: ProfileRepository;
  jobsRepository: JobsRepository;
  knowledgeService: KnowledgeService;
  matchingService: MatchingService;
  reportService: ReportService;
  llmClient: LlmClient;
};

/**
 * 文件作用：装配 agent 编排模块依赖。
 * 关键点：agent 只依赖领域 service / repository 抽象，不直接触碰具体 adapter 实现。
 */
export function createAgentModule(
  dependencies: AgentModuleDependencies,
  options: AgentModuleOptions = {},
): Router {
  const agentRepository = createJsonAgentRepository(options.runStorePath);
  const service = createAgentService({
    agentRepository,
    profileRepository: dependencies.profileRepository,
    jobsRepository: dependencies.jobsRepository,
    knowledgeService: dependencies.knowledgeService,
    matchingService: dependencies.matchingService,
    reportService: dependencies.reportService,
    llmClient: dependencies.llmClient,
  });

  return createAgentRouter(service);
}
