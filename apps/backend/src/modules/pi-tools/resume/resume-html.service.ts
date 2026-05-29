import type {
  CreateResumeHtmlRequest,
  ResumeHtmlListResponse,
  ResumeHtmlRecord,
  ResumeHtmlResponse,
} from "@career/contracts/types";

import { HttpError } from "../../../shared/errors/http-error.js";
import type { PiThinkingLevel } from "../../../shared/agent/pi-types.js";
import type { AiRepository } from "../../ai/ai.repository.js";
import { generateResumeHtmlWithPi } from "./resume-html.generator.js";
import { buildResumeQualityWarnings } from "./resume-html.quality.js";

/**
 * 简历 HTML 服务依赖。
 * 必填：aiRepository
 * 选填：Pi Agent 目录、会话目录、模型、思考强度、生成超时时间、运行目录
 */
type ResumeHtmlServiceDependencies = {
  aiRepository: AiRepository;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel?: PiThinkingLevel;
  resumeTimeoutMs?: number;
  cwd?: string;
};

/**
 * 简历 HTML 生成运行时上下文。
 * 作用：保存一次请求生成过程中的运行信息。
 */
type ResumeHtmlRuntimeContext = {
  traceId: string;
};

/**
 * 简历 HTML 服务。
 * 作用：负责简历生成、简历记录查询等功能。
 */
export interface ResumeHtmlService {
  /**
   * 生成简历 HTML。
   */
  generateResumeHtml(
    input: CreateResumeHtmlRequest,
    runtime: ResumeHtmlRuntimeContext,
  ): Promise<ResumeHtmlResponse>;

  /**
   * 分页查询简历记录。
   */
  listResumeHtmlRecords(offset: number, limit: number): Promise<ResumeHtmlListResponse>;

  /**
   * 根据简历 ID 查询简历记录。
   */
  getResumeHtmlRecordById(resumeId: number): Promise<ResumeHtmlRecord>;
}

/**
 * 创建简历 HTML 服务。
 * 作用：封装简历生成、简历记录保存、简历记录查询功能。
 */
export function createResumeHtmlService(
  dependencies: ResumeHtmlServiceDependencies,
): ResumeHtmlService {
  /**
   * 生成简历 HTML，并把生成结果保存到数据库。
   */
  async function generateResumeHtml(
    input: CreateResumeHtmlRequest,
    runtime: ResumeHtmlRuntimeContext,
  ): Promise<ResumeHtmlResponse> {
    const generated = await generateResumeHtmlWithPi({
      input,
      traceId: runtime.traceId,
      cwd: dependencies.cwd || process.cwd(),
      piAgentDir: dependencies.piAgentDir,
      sessionStoreDir: dependencies.sessionStoreDir,
      model: dependencies.model,
      thinkingLevel: dependencies.thinkingLevel || "medium",
      timeoutMs: dependencies.resumeTimeoutMs,
    });

    const record = await dependencies.aiRepository.createResumeHtmlRecord({
      trace_id: runtime.traceId,
      model: generated.model,
      basic_name: input.basic.name,
      target_position: input.basic.target_position,
      summary: input.summary || null,
      input_payload: input,
      html: generated.html,
    });

    const qualityWarnings = buildResumeQualityWarnings(input);

    return {
      ...generated,
      resume_id: record.id,
      quality_warnings: qualityWarnings,
    };
  }

  /**
   * 根据简历 ID 查询简历记录。
   * 找不到记录时抛出 404 错误。
   */
  async function getResumeHtmlRecordById(resumeId: number): Promise<ResumeHtmlRecord> {
    const record = await dependencies.aiRepository.getResumeHtmlRecordById(resumeId);
    if (!record) {
      throw new HttpError(404, "AI_RESUME_HTML_NOT_FOUND", "简历记录不存在");
    }
    return record;
  }

  return {
    generateResumeHtml,
    listResumeHtmlRecords: (offset, limit) =>
      dependencies.aiRepository.listResumeHtmlRecords({ offset, limit }),
    getResumeHtmlRecordById,
  };
}
