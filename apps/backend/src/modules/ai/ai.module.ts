import type { Router } from "express";
import type { Pool } from "pg";

import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { KnowledgeService } from "../knowledge/knowledge.service.js";
import type { MatchingService } from "../matching/matching.service.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import type { ReportService } from "../report/report.service.js";
import { createPgAiRepository } from "./ai.repository.pg.js";
import { createAiRouter } from "./ai.route.js";
import { createAiService } from "./ai.service.js";

export type AiModuleOptions = {
  pool: Pool;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  resumeTimeoutMs?: number;
  cwd?: string;
};

export type AiModuleDependencies = {
  profileRepository: ProfileRepository;
  jobsRepository: JobsRepository;
  knowledgeService: KnowledgeService;
  matchingService: MatchingService;
  reportService: ReportService;
};

/**
 * 文件作用：装配 AI 中枢模块依赖。
 * 设计说明：该模块是后续统一 AI 能力入口，当前先稳定暴露 `/api/v2/ai`，再逐步把更多能力迁入这一层。
 */
export function createAiModule(
  dependencies: AiModuleDependencies,
  options: AiModuleOptions,
): Router {
  const aiRepository = createPgAiRepository(options.pool);
  const service = createAiService({
    aiRepository,
    profileRepository: dependencies.profileRepository,
    jobsRepository: dependencies.jobsRepository,
    knowledgeService: dependencies.knowledgeService,
    matchingService: dependencies.matchingService,
    reportService: dependencies.reportService,
    piAgentDir: options.piAgentDir,
    sessionStoreDir: options.sessionStoreDir,
    model: options.model,
    thinkingLevel: options.thinkingLevel,
    resumeTimeoutMs: options.resumeTimeoutMs,
    cwd: options.cwd,
  });

  return createAiRouter(service);
}
