import type { Pool } from "pg";

import { createPgMatchingRepository } from "../matching/matching.repository.pg.js";
import type { MatchingRepository } from "../matching/matching.repository.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import { createPgProfileRepository } from "../profile/profile.repository.pg.js";
import { createPlaywrightReportExporter } from "./report.exporter.js";
import { createPgReportRepository } from "./report.repository.pg.js";
import type { ReportRepository } from "./report.repository.js";
import { createReportService } from "./report.service.js";
import { createCareerReportGenerator } from "../pi-tools/report/career-report.generator.js";
import type { AiThinkingLevel } from "../ai/runtime/ai-agent.types.js";

export type ReportServiceDependencies = {
  reportRepository: ReportRepository;
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

/**
 * 文件作用：装配 report 领域依赖，供 app.ts 调用。
 * 依赖关系：统一在此处注入 repository、generator 与 exporter，
 * 避免 route/service 感知具体实现。
 */
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

  return createReportService({
    ...dependencies,
    generator,
    exporter,
    exportDir: options.reportExportDir,
  });
}
