import type { Router } from "express";
import type { Pool } from "pg";

import type { JobComicsService } from "../job-comics/job-comics.service.js";
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
  knowledgeService: KnowledgeService;
  matchingService: MatchingService;
  reportService: ReportService;
  jobComicsService?: JobComicsService;
};

export function createAiModule(
  dependencies: AiModuleDependencies,
  options: AiModuleOptions,
): Router {
  const aiRepository = createPgAiRepository(options.pool);
  const service = createAiService({
    aiRepository,
    profileRepository: dependencies.profileRepository,
    knowledgeService: dependencies.knowledgeService,
    matchingService: dependencies.matchingService,
    reportService: dependencies.reportService,
    jobComicsService: dependencies.jobComicsService,
    piAgentDir: options.piAgentDir,
    sessionStoreDir: options.sessionStoreDir,
    model: options.model,
    thinkingLevel: options.thinkingLevel,
    resumeTimeoutMs: options.resumeTimeoutMs,
    cwd: options.cwd,
  });

  return createAiRouter(service);
}
