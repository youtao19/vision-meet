import type { Router } from "express";
import type { Pool } from "pg";

import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { MatchingService } from "../matching/matching.service.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import type { ReportService } from "../report/report.service.js";
import type { KnowledgeService } from "../knowledge/knowledge.service.js";
import { createAgentRouter } from "./agent.route.js";
import { createPgAgentRepository } from "./agent.repository.pg.js";
import { createAgentService } from "./agent.service.js";

export type AgentModuleOptions = {
  pool: Pool;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  cwd?: string;
};

export type AgentModuleDependencies = {
  profileRepository: ProfileRepository;
  jobsRepository: JobsRepository;
  knowledgeService: KnowledgeService;
  matchingService: MatchingService;
  reportService: ReportService;
};

/**
 * 文件作用：装配 agent 编排模块依赖。
 * 关键点：agent 只依赖领域 service / repository 抽象，不直接触碰具体 adapter 实现。
 */
export function createAgentModule(
  dependencies: AgentModuleDependencies,
  options: AgentModuleOptions,
): Router {
  const agentRepository = createPgAgentRepository(options.pool);
  const service = createAgentService({
    agentRepository,
    profileRepository: dependencies.profileRepository,
    jobsRepository: dependencies.jobsRepository,
    knowledgeService: dependencies.knowledgeService,
    matchingService: dependencies.matchingService,
    reportService: dependencies.reportService,
    piAgentDir: options.piAgentDir,
    sessionStoreDir: options.sessionStoreDir,
    model: options.model,
    thinkingLevel: options.thinkingLevel,
    cwd: options.cwd,
  });

  return createAgentRouter(service);
}
