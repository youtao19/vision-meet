import type {
  CreateResumeHtmlRequest,
  ResumeHtmlListResponse,
  ResumeHtmlRecord,
  ResumeHtmlResponse,
} from "@career/contracts/types";

import { HttpError } from "../../shared/errors/http-error.js";
import type { PiThinkingLevel } from "../../shared/agent/pi-types.js";
import type { ResumeRepository } from "./resume.repository.js";
import { generateResumeHtmlWithPi } from "../pi-tools/resume/resume-html.generator.js";
import { buildResumeQualityWarnings } from "../pi-tools/resume/resume-html.quality.js";

/**
 * 简历服务依赖。
 * 必填：resumeRepository
 * 选填：Pi Agent 目录、会话目录、模型、思考强度、生成超时时间、运行目录
 */
type ResumeServiceDependencies = {
  resumeRepository: ResumeRepository;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel?: PiThinkingLevel;
  resumeTimeoutMs?: number;
  cwd?: string;
};

/**
 * 简历生成运行时上下文。
 */
type ResumeRuntimeContext = {
  traceId: string;
};

/**
 * 简历服务接口。
 */
export interface ResumeService {
  /**
   * 生成简历 HTML 并保存记录。
   */
  generateResumeHtml(
    input: CreateResumeHtmlRequest,
    runtime: ResumeRuntimeContext,
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
 * 创建简历服务。
 */
export function createResumeService(
  dependencies: ResumeServiceDependencies,
): ResumeService {
  async function generateResumeHtml(
    input: CreateResumeHtmlRequest,
    runtime: ResumeRuntimeContext,
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

    const record = await dependencies.resumeRepository.createResumeHtmlRecord({
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

  async function getResumeHtmlRecordById(resumeId: number): Promise<ResumeHtmlRecord> {
    const record = await dependencies.resumeRepository.getResumeHtmlRecordById(resumeId);
    if (!record) {
      throw new HttpError(404, "RESUME_HTML_NOT_FOUND", "简历记录不存在");
    }
    return record;
  }

  return {
    generateResumeHtml,
    listResumeHtmlRecords: (offset, limit) =>
      dependencies.resumeRepository.listResumeHtmlRecords({ offset, limit }),
    getResumeHtmlRecordById,
  };
}
