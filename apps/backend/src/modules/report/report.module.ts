import type { Router } from "express";
import type { Pool } from "pg";

import { createPgMatchingRepository } from "../matching/matching.repository.pg.js";
import type { MatchingRepository } from "../matching/matching.repository.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import { createPgProfileRepository } from "../profile/profile.repository.pg.js";
import { createPgReportExportRepository } from "./report-export.repository.pg.js";
import type { ReportExportRepository } from "./report-export.repository.js";
import { createPlaywrightReportExporter } from "./playwright-report.exporter.js";
import { createReportExportDownloadRouter, createReportRouter } from "./report.route.js";
import { createPgReportRepository } from "./report.repository.pg.js";
import type { ReportRepository } from "./report.repository.js";
import { createReportService } from "./report.service.js";
import { createCareerReportGenerator } from "../pi-tools/report/career-report.generator.js";
import type { AiThinkingLevel } from "../ai/runtime/ai-agent.types.js";

export type ReportModuleOptions = {
  pool: Pool;
  reportExportDir?: string;
};

export type ReportServiceDependencies = {
  reportRepository: ReportRepository;
  reportExportRepository: ReportExportRepository;
  matchingRepository: MatchingRepository;
  profileRepository: ProfileRepository;
};

export type ReportServiceFactoryOptions = {
  reportExportDir?: string;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel?: AiThinkingLevel;
  reportTimeoutMs?: number;
  cwd?: string;
};

export function createReportServiceFromDependencies(
  dependencies: ReportServiceDependencies,
  options: ReportServiceFactoryOptions = {},
) {
  const generator = createCareerReportGenerator({
    cwd: options.cwd || process.cwd(),
    piAgentDir: options.piAgentDir,
    sessionStoreDir: options.sessionStoreDir,
    model: options.model,
    thinkingLevel: options.thinkingLevel || "medium",
    timeoutMs: options.reportTimeoutMs,
  });
  const exporter = createPlaywrightReportExporter();

  return createReportService(
    dependencies.reportRepository,
    dependencies.reportExportRepository,
    dependencies.matchingRepository,
    dependencies.profileRepository,
    generator,
    exporter,
    {
      exportDir: options.reportExportDir,
    },
  );
}

/**
 * 文件作用：装配 report 领域依赖。
 * 依赖关系：统一在 module 中注入 repository 与 generator，避免 route/service 感知具体实现。
 */
export function createReportModule(options: ReportModuleOptions): Router {
  const reportRepository = createPgReportRepository(options.pool);
  const reportExportRepository = createPgReportExportRepository(options.pool);
  const matchingRepository = createPgMatchingRepository(options.pool);
  const profileRepository = createPgProfileRepository(options.pool);
  const service = createReportServiceFromDependencies(
    {
      reportRepository,
      reportExportRepository,
      matchingRepository,
      profileRepository,
    },
    options,
  );

  return createReportRouter(service);
}

export function createReportExportDownloadModule(options: ReportModuleOptions): Router {
  const reportRepository = createPgReportRepository(options.pool);
  const reportExportRepository = createPgReportExportRepository(options.pool);
  const matchingRepository = createPgMatchingRepository(options.pool);
  const profileRepository = createPgProfileRepository(options.pool);
  const service = createReportServiceFromDependencies(
    {
      reportRepository,
      reportExportRepository,
      matchingRepository,
      profileRepository,
    },
    options,
  );

  return createReportExportDownloadRouter(service);
}
