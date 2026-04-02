import type { Router } from "express";
import type { LlmClient } from "../../shared/llm/llm-client.js";

import { createJsonJobsRepository } from "../jobs/jobs.repository.json.js";
import type { JobsRepository } from "../jobs/jobs.repository.js";
import { createJsonMatchingRepository } from "../matching/matching.repository.json.js";
import type { MatchingRepository } from "../matching/matching.repository.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import { createJsonProfileRepository } from "../profile/profile.repository.json.js";
import { createJsonReportExportRepository } from "./report-export.repository.json.js";
import type { ReportExportRepository } from "./report-export.repository.js";
import { createLlmFirstReportGenerator } from "./llm-report.generator.js";
import { createPlaywrightReportExporter } from "./playwright-report.exporter.js";
import { createReportExportDownloadRouter, createReportRouter } from "./report.route.js";
import { createJsonReportRepository } from "./report.repository.json.js";
import type { ReportRepository } from "./report.repository.js";
import { createReportService } from "./report.service.js";
import { createTemplateReportGenerator } from "./template-report.generator.js";

export type ReportModuleOptions = {
  dataStorePath?: string;
  profileStorePath?: string;
  matchStorePath?: string;
  reportStorePath?: string;
  reportExportDir?: string;
  reportExportStorePath?: string;
};

export type ReportServiceDependencies = {
  reportRepository: ReportRepository;
  reportExportRepository: ReportExportRepository;
  matchingRepository: MatchingRepository;
  profileRepository: ProfileRepository;
  jobsRepository: JobsRepository;
  llmClient?: LlmClient | null;
};

export function createReportServiceFromDependencies(
  dependencies: ReportServiceDependencies,
  options: ReportModuleOptions = {},
) {
  const templateGenerator = createTemplateReportGenerator();
  const generator = createLlmFirstReportGenerator(dependencies.llmClient ?? null, templateGenerator);
  const exporter = createPlaywrightReportExporter();

  return createReportService(
    dependencies.reportRepository,
    dependencies.reportExportRepository,
    dependencies.matchingRepository,
    dependencies.profileRepository,
    dependencies.jobsRepository,
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
export function createReportModule(options: ReportModuleOptions = {}): Router {
  const reportRepository = createJsonReportRepository(options.reportStorePath);
  const reportExportRepository = createJsonReportExportRepository(options.reportExportStorePath);
  const matchingRepository = createJsonMatchingRepository(options.matchStorePath);
  const profileRepository = createJsonProfileRepository(options.profileStorePath);
  const jobsRepository = createJsonJobsRepository(options.dataStorePath);
  const service = createReportServiceFromDependencies(
    {
      reportRepository,
      reportExportRepository,
      matchingRepository,
      profileRepository,
      jobsRepository,
    },
    options,
  );

  return createReportRouter(service);
}

export function createReportExportDownloadModule(options: ReportModuleOptions = {}): Router {
  const reportRepository = createJsonReportRepository(options.reportStorePath);
  const reportExportRepository = createJsonReportExportRepository(options.reportExportStorePath);
  const matchingRepository = createJsonMatchingRepository(options.matchStorePath);
  const profileRepository = createJsonProfileRepository(options.profileStorePath);
  const jobsRepository = createJsonJobsRepository(options.dataStorePath);
  const service = createReportServiceFromDependencies(
    {
      reportRepository,
      reportExportRepository,
      matchingRepository,
      profileRepository,
      jobsRepository,
    },
    options,
  );

  return createReportExportDownloadRouter(service);
}
