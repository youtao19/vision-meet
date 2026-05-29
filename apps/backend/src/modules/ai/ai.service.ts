import type {
  CreateResumeHtmlRequest,
  CreateAiPolishRequest,
  AiPolishResponse,
  ResumeHtmlListResponse,
  ResumeHtmlRecord,
  ResumeHtmlResponse,
} from "@career/contracts/types";

import type { JobComicsService } from "../job-comics/job-comics.service.js";
import type { KnowledgeService } from "../knowledge/knowledge.service.js";
import type { MatchingService } from "../matching/matching.service.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import type { ReportService } from "../report/report.service.js";
import type { AiRepository } from "./ai.repository.js";
import { createPolishService } from "../pi-tools/polish/polish.service.js";
import { createResumeHtmlService } from "../pi-tools/resume/resume-html.service.js";
import type { AiThinkingLevel } from "./runtime/ai-agent.types.js";

type AiServiceDependencies = {
  aiRepository: AiRepository;
  profileRepository: ProfileRepository;
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

export interface AiService {
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
}

export function createAiService(dependencies: AiServiceDependencies): AiService {
  const resumeHtmlService = createResumeHtmlService(dependencies);
  const polishService = createPolishService(dependencies);

  return {
    generateResumeHtml: (input, runtime) => resumeHtmlService.generateResumeHtml(input, runtime),
    listResumeHtmlRecords: (offset, limit) =>
      resumeHtmlService.listResumeHtmlRecords(offset, limit),
    polishText: (input, runtime) => polishService.polishText(input, runtime),
    getResumeHtmlRecordById: (resumeId) => resumeHtmlService.getResumeHtmlRecordById(resumeId),
  };
}
