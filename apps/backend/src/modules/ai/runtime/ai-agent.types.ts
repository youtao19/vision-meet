/**
 * 文件作用：定义 AI 中枢运行时的核心类型。
 * 设计边界：把运行时状态、依赖和返回值集中到独立类型文件，避免它们继续散落在兼容层或工具实现中。
 */

import type {
  AiStepTraceItem,
  PiToolName,
  AiWarningCode,
  CareerReportRecord,
  KnowledgeSearchResultItem,
  MatchResultDetail,
  StudentProfileRecord,
} from "@career/contracts/types";

import type { JobComicsService } from "../../job-comics/job-comics.service.js";
import type { KnowledgeService } from "../../knowledge/knowledge.service.js";
import type { MatchingService } from "../../matching/matching.service.js";
import type { ProfileRepository } from "../../profile/profile.repository.js";
import type { ReportService } from "../../report/report.service.js";

/**
 * Pi Agent 思考强度等级。
 * 实际定义在 shared/agent/pi-types.ts，此处保留再导出以兼容 ai/ 内部引用。
 */
import type { PiThinkingLevel } from "../../../shared/agent/pi-types.js";
export type AiThinkingLevel = PiThinkingLevel;

export type AiAgentRuntimeJob = {
  id: number;
  title: string;
  company_name: string | null;
  location: string | null;
  job_description: string | null;
};

/**
 * AI Agent 运行过程中的状态。
 * 作用：保存学生画像、岗位、知识库结果、匹配结果和报告结果。
 */
export type AiAgentRuntimeState = {
  profile: StudentProfileRecord;
  job: AiAgentRuntimeJob;
  knowledgeHits: KnowledgeSearchResultItem[];
  matchResult: MatchResultDetail | null;
  report: CareerReportRecord | null;
};

/**
 * AI Agent 运行依赖。
 * 作用：统一声明 Agent 执行任务时需要调用的业务服务。
 */
export type AiAgentDependencies = {
  profileRepository: ProfileRepository;
  knowledgeService: KnowledgeService;
  matchingService: MatchingService;
  reportService: ReportService;
  jobComicsService?: JobComicsService;
};

/**

 * AI Agent 运行参数。
 * 必填：运行目录、链路 ID、任务目标、交付物、学生画像 ID、岗位 ID、知识库数量、是否强制重算、思考强度
 * 选填：Pi Agent 目录、会话目录、模型
 */
export type AiAgentRunOptions = {
  cwd: string;
  traceId: string;
  objective: string;
  deliverables: Array<"match_analysis" | "career_report">;
  studentProfileId: number;
  jobId: number;
  jobName: string;
  topK: number;
  forceRecalculate: boolean;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel: AiThinkingLevel;
};

/**
 * AI Agent 运行结果。
 * 作用：返回模型、执行步骤、知识库结果、匹配结果、报告结果、总结和警告信息。
 */
export type AiAgentRunResult = {
  model: string | null;
  stepTrace: AiStepTraceItem[];
  knowledgeHits: KnowledgeSearchResultItem[];
  matchResult: MatchResultDetail | null;
  report: CareerReportRecord | null;
  finalSummary: string | null;
  warnings: AiWarningCode[];
};

/**
 * 工具执行快照。
 * 作用：记录工具调用时的名称、标题、开始时间和输入摘要。
 */
export type ToolExecutionSnapshot = {
  tool: PiToolName;
  title: string;
  startedAt: number;
  inputSummary: string;
};
