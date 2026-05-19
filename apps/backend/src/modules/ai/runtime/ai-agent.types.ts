/**
 * 文件作用：定义 AI 中枢运行时的核心类型。
 * 设计边界：把运行时状态、依赖和返回值集中到独立类型文件，避免它们继续散落在兼容层或工具实现中。
 */

import type {
  AiStepTraceItem,
  PiToolName,
  AiWarningCode,
  CareerReportRecord,
  JobRecord,
  KnowledgeSearchResultItem,
  MatchResultDetail,
  StudentProfileRecord,
} from "@career/contracts/types";

import type { JobsRepository } from "../../jobs/jobs.repository.js";
import type { KnowledgeService } from "../../knowledge/knowledge.service.js";
import type { MatchingService } from "../../matching/matching.service.js";
import type { ProfileRepository } from "../../profile/profile.repository.js";
import type { ReportService } from "../../report/report.service.js";

export type AiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type AiAgentRuntimeState = {
  profile: StudentProfileRecord;
  job: JobRecord;
  knowledgeHits: KnowledgeSearchResultItem[];
  matchResult: MatchResultDetail | null;
  report: CareerReportRecord | null;
};

export type AiAgentDependencies = {
  profileRepository: ProfileRepository;
  jobsRepository: JobsRepository;
  knowledgeService: KnowledgeService;
  matchingService: MatchingService;
  reportService: ReportService;
};

export type AiAgentRunOptions = {
  cwd: string;
  traceId: string;
  objective: string;
  deliverables: Array<"match_analysis" | "career_report">;
  studentProfileId: number;
  jobId: number;
  topK: number;
  forceRecalculate: boolean;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel: AiThinkingLevel;
};

export type AiAgentRunResult = {
  model: string | null;
  stepTrace: AiStepTraceItem[];
  knowledgeHits: KnowledgeSearchResultItem[];
  matchResult: MatchResultDetail | null;
  report: CareerReportRecord | null;
  finalSummary: string | null;
  warnings: AiWarningCode[];
};

export type ToolExecutionSnapshot = {
  tool: PiToolName;
  title: string;
  startedAt: number;
  inputSummary: string;
};
