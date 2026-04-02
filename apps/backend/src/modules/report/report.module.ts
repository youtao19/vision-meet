import type { Router } from "express";

import { createJsonJobsRepository } from "../jobs/jobs.repository.json.js";
import { createJsonMatchingRepository } from "../matching/matching.repository.json.js";
import { createJsonProfileRepository } from "../profile/profile.repository.json.js";
import { createReportRouter } from "./report.route.js";
import { createJsonReportRepository } from "./report.repository.json.js";
import { createReportService } from "./report.service.js";
import { createTemplateReportGenerator } from "./template-report.generator.js";

export type ReportModuleOptions = {
  dataStorePath?: string;
  profileStorePath?: string;
  matchStorePath?: string;
  reportStorePath?: string;
};

/**
 * 文件作用：装配 report 领域依赖。
 * 依赖关系：统一在 module 中注入 repository 与 generator，避免 route/service 感知具体实现。
 */
export function createReportModule(options: ReportModuleOptions = {}): Router {
  const reportRepository = createJsonReportRepository(options.reportStorePath);
  const matchingRepository = createJsonMatchingRepository(options.matchStorePath);
  const profileRepository = createJsonProfileRepository(options.profileStorePath);
  const jobsRepository = createJsonJobsRepository(options.dataStorePath);
  const generator = createTemplateReportGenerator();
  const service = createReportService(
    reportRepository,
    matchingRepository,
    profileRepository,
    jobsRepository,
    generator,
  );

  return createReportRouter(service);
}
