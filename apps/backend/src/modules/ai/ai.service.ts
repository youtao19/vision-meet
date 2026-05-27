import type {
  AiTaskResponse,
  CreateAiTaskRequest,
  CreateResumeHtmlRequest,
  CreateAiPolishRequest,
  AiPolishResponse,
  ResumeHtmlListResponse,
  ResumeHtmlRecord,
  ResumeHtmlResponse,
} from "@career/contracts/types";

import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { JobComicsService } from "../job-comics/job-comics.service.js";
import type { KnowledgeService } from "../knowledge/knowledge.service.js";
import type { MatchingService } from "../matching/matching.service.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import type { ReportService } from "../report/report.service.js";
import type { AiRepository } from "./ai.repository.js";
import { createAiTaskService } from "./ai-task.service.js";
import { createPolishService } from "./polish.service.js";
import { createResumeHtmlService } from "./resume-html.service.js";
import type { AiThinkingLevel } from "./runtime/ai-agent.types.js";

/**
 * AI 服务依赖。
 *
 * 必填：
 * - aiRepository：AI 任务和简历 HTML 记录的数据访问
 * - profileRepository：学生画像数据访问
 * - jobsRepository：岗位数据访问
 * - knowledgeService：知识库服务
 * - matchingService：岗位匹配服务
 * - reportService：报告生成服务
 * - jobComicsService：岗位绘本生成服务
 *
 * 选填：
 * - piAgentDir：Pi Agent 工作目录
 * - sessionStoreDir：Agent 会话存储目录
 * - model：指定使用的模型
 * - thinkingLevel：模型思考强度
 * - resumeTimeoutMs：简历生成超时时间
 * - cwd：运行命令时的工作目录
 */
type AiServiceDependencies = {
  aiRepository: AiRepository;
  profileRepository: ProfileRepository;
  jobsRepository: JobsRepository;
  knowledgeService: KnowledgeService;
  matchingService: MatchingService;
  reportService: ReportService;
  jobComicsService?: JobComicsService;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel?: AiThinkingLevel;
  resumeTimeoutMs?: number;
  cwd?: string;
};

export type AiTaskRuntimeContext = {
  traceId: string;
};

/**
 * 文件作用：提供 AI 中枢的统一服务入口。
 * 设计说明：这一阶段先复用既有任务型 Agent 执行链路，把“统一入口”与“执行内核继续演进”拆开，降低改造风险。
 */
export interface AiService {
  createTask(input: CreateAiTaskRequest, runtime: AiTaskRuntimeContext): Promise<AiTaskResponse>;
  generateResumeHtml(
    input: CreateResumeHtmlRequest,
    runtime: AiTaskRuntimeContext,
  ): Promise<ResumeHtmlResponse>;
  polishText(
    input: CreateAiPolishRequest,
    runtime: AiTaskRuntimeContext,
  ): Promise<AiPolishResponse>;
  listResumeHtmlRecords(offset: number, limit: number): Promise<ResumeHtmlListResponse>;
  getResumeHtmlRecordById(resumeId: number): Promise<ResumeHtmlRecord>;
  getTask(taskId: number): Promise<AiTaskResponse>;
}

/**
 * 创建 AI 服务。
 * 作用：把任务生成、简历生成、文本润色等子服务组合成统一入口。
 */
export function createAiService(dependencies: AiServiceDependencies): AiService {
  const taskService = createAiTaskService(dependencies);
  const resumeHtmlService = createResumeHtmlService(dependencies);
  const polishService = createPolishService(dependencies);

  return {
    createTask: (input, runtime) => taskService.createTask(input, runtime),
    generateResumeHtml: (input, runtime) => resumeHtmlService.generateResumeHtml(input, runtime),
    listResumeHtmlRecords: (offset, limit) =>
      resumeHtmlService.listResumeHtmlRecords(offset, limit),
    polishText: (input, runtime) => polishService.polishText(input, runtime),
    getResumeHtmlRecordById: (resumeId) => resumeHtmlService.getResumeHtmlRecordById(resumeId),
    getTask: (taskId) => taskService.getTask(taskId),
  };
}
