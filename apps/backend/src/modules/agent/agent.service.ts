import { z } from "zod";

import type {
  AgentAnalyzeRequest,
  AgentAnalyzeResponse,
  AgentToolTraceItem,
  AgentWarningCode,
  KnowledgeSearchResultItem,
} from "@career/contracts/types";

import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { MatchingService } from "../matching/matching.service.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import type { ReportService } from "../report/report.service.js";
import type { KnowledgeService } from "../knowledge/knowledge.service.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { LlmClientError, type LlmClient } from "../../shared/llm/llm-client.js";
import type { AgentRepository, AgentRunStatus } from "./agent.repository.js";

const analysisSummarySchema = z.object({
  summary: z.string().trim().min(1),
});

type AgentServiceDependencies = {
  agentRepository: AgentRepository;
  profileRepository: ProfileRepository;
  jobsRepository: JobsRepository;
  knowledgeService: KnowledgeService;
  matchingService: MatchingService;
  reportService: ReportService;
  llmClient: LlmClient;
};

type AnalyzeRuntimeContext = {
  traceId: string;
};

type TraceExecutionResult<T> = {
  value: T;
  trace: AgentToolTraceItem;
};

const MIN_EVIDENCE_COUNT = 2;

function buildKnowledgeQuery(input: {
  targetRole: string;
  jobTitle: string;
  skills: string[];
  summary: string;
}): string {
  return [
    `目标岗位 ${input.jobTitle}`,
    `候选方向 ${input.targetRole}`,
    input.skills.length > 0 ? `技能 ${input.skills.slice(0, 8).join(" ")}` : "",
    input.summary,
  ]
    .filter(Boolean)
    .join("；");
}

function buildKnowledgeOutputSummary(items: KnowledgeSearchResultItem[]): string {
  if (items.length === 0) {
    return "未检索到可用证据";
  }

  return `命中 ${items.length} 条证据，最高分 ${items[0].final_score.toFixed(3)}`;
}

function mapAgentError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof LlmClientError) {
    if (error.code === "LLM_INVALID_RESPONSE") {
      return new HttpError(500, "AGENT_ORCHESTRATION_FAILED", "模型输出无法被系统消费", error.detail);
    }

    return new HttpError(500, "AGENT_MODEL_UNAVAILABLE", "模型调用失败，请检查模型配置或稍后重试", error.detail);
  }

  const message = error instanceof Error ? error.message : "Pi Agent 编排失败";
  return new HttpError(500, "AGENT_ORCHESTRATION_FAILED", message);
}

async function executeWithTrace<T>(
  step: AgentToolTraceItem["step"],
  inputSummary: string,
  run: () => Promise<T> | T,
  outputSummary: (value: T) => string,
): Promise<TraceExecutionResult<T>> {
  const startedAt = Date.now();

  try {
    const value = await run();
    return {
      value,
      trace: {
        step,
        status: "success",
        duration_ms: Date.now() - startedAt,
        input_summary: inputSummary,
        output_summary: outputSummary(value),
      },
    };
  } catch (error) {
    const mapped = mapAgentError(error);
    throw {
      originalError: error,
      mappedError: mapped,
      trace: {
        step,
        status: "error" as const,
        duration_ms: Date.now() - startedAt,
        input_summary: inputSummary,
        output_summary: mapped.message,
        error_code: mapped.code,
      },
    };
  }
}

/**
 * 文件作用：实现 Pi Agent V1 的同步编排主链路。
 * 关键规则：固定执行“校验 -> 检索 -> 匹配 -> LLM 摘要 -> 报告”，并把每一步都写入审计日志。
 */
export interface AgentService {
  analyze(input: AgentAnalyzeRequest, runtime: AnalyzeRuntimeContext): Promise<AgentAnalyzeResponse>;
}

export function createAgentService(dependencies: AgentServiceDependencies): AgentService {
  async function analyze(
    input: AgentAnalyzeRequest,
    runtime: AnalyzeRuntimeContext,
  ): Promise<AgentAnalyzeResponse> {
    const toolTrace: AgentToolTraceItem[] = [];
    const warnings: AgentWarningCode[] = [];
    let status: AgentRunStatus = "success";
    let knowledgeHits: KnowledgeSearchResultItem[] = [];
    let matchResultId: number | null = null;
    let reportId: number | null = null;

    try {
      const contextTrace = await executeWithTrace(
        "validate_context",
        `student_profile_id=${input.student_profile_id}, job_id=${input.job_id}`,
        async () => {
          const profile = dependencies.profileRepository.getStudentProfileById(input.student_profile_id);
          if (!profile) {
            throw new HttpError(404, "STUDENT_PROFILE_NOT_FOUND", "学生画像不存在");
          }

          const job = dependencies.jobsRepository.getJobById(input.job_id);
          if (!job) {
            throw new HttpError(404, "JOB_NOT_FOUND", "目标岗位不存在或已下线");
          }

          return {
            profile,
            job,
          };
        },
        ({ profile, job }) => `已校验画像 ${profile.id} 和岗位 ${job.id}`,
      );
      toolTrace.push(contextTrace.trace);

      const knowledgeQuery = buildKnowledgeQuery({
        targetRole: contextTrace.value.profile.target_role,
        jobTitle: contextTrace.value.job.title,
        skills: contextTrace.value.profile.skills,
        summary: contextTrace.value.profile.summary,
      });

      const firstTopK = input.top_k ?? 5;
      const firstSearch = await executeWithTrace(
        "knowledge_search",
        `top_k=${firstTopK}, query=${knowledgeQuery.slice(0, 120)}`,
        async () =>
          dependencies.knowledgeService.search({
            query: knowledgeQuery,
            namespace: "career_runtime",
            student_profile_id: contextTrace.value.profile.id,
            limit: firstTopK,
          }),
        (response) => buildKnowledgeOutputSummary(response.items),
      );
      toolTrace.push(firstSearch.trace);
      knowledgeHits = firstSearch.value.items;

      if (knowledgeHits.length < MIN_EVIDENCE_COUNT && firstTopK < 10) {
        const retrySearch = await executeWithTrace(
          "knowledge_search",
          `retry top_k=10, query=${knowledgeQuery.slice(0, 120)}`,
          async () =>
            dependencies.knowledgeService.search({
              query: knowledgeQuery,
              namespace: "career_runtime",
              student_profile_id: contextTrace.value.profile.id,
              limit: 10,
            }),
          (response) => `重试后 ${buildKnowledgeOutputSummary(response.items)}`,
        );
        toolTrace.push(retrySearch.trace);
        knowledgeHits = retrySearch.value.items;
      }

      const matchTrace = await executeWithTrace(
        "matching",
        `student_profile_id=${input.student_profile_id}, job_id=${input.job_id}, force_recalculate=${Boolean(input.force_recalculate)}`,
        async () =>
          dependencies.matchingService.createMatch({
            student_profile_id: input.student_profile_id,
            job_id: input.job_id,
            force_recalculate: input.force_recalculate,
          }),
        (result) => `match_id=${result.id}, from_cache=${result.from_cache}, total_score=${result.total_score}`,
      );
      toolTrace.push(matchTrace.trace);
      matchResultId = matchTrace.value.id;

      if (knowledgeHits.length === 0) {
        warnings.push("EVIDENCE_INSUFFICIENT");
        status = "partial_success";
        toolTrace.push({
          step: "llm_analysis",
          status: "skipped",
          duration_ms: 0,
          input_summary: "因缺少知识证据，跳过模型摘要",
          output_summary: "未执行",
        });
        toolTrace.push({
          step: "report_generation",
          status: "skipped",
          duration_ms: 0,
          input_summary: "因缺少知识证据，跳过证据型报告生成",
          output_summary: "未执行",
        });

        const run = dependencies.agentRepository.createRun({
          trace_id: runtime.traceId,
          model: dependencies.llmClient.model,
          student_profile_id: input.student_profile_id,
          job_id: input.job_id,
          force_recalculate: Boolean(input.force_recalculate),
          top_k: firstTopK,
          status,
          knowledge_hit_count: knowledgeHits.length,
          match_result_id: matchTrace.value.id,
          report_id: null,
          warnings,
          tool_trace: toolTrace,
        });

        return {
          agent_run_id: run.id,
          trace_id: runtime.traceId,
          model: dependencies.llmClient.model,
          knowledge_hits: knowledgeHits,
          match_result: matchTrace.value,
          report: null,
          warnings,
          tool_trace: toolTrace,
        };
      }

      const summaryTrace = await executeWithTrace(
        "llm_analysis",
        `evidence_count=${knowledgeHits.length}, model=${dependencies.llmClient.model ?? "unconfigured"}`,
        async () => {
          const payload = await dependencies.llmClient.completeStructuredJson<unknown>({
            messages: [
              {
                role: "system",
                content: [
                  "你是 Career Agent 的匹配分析助手。",
                  "请基于给定学生画像、岗位信息、匹配结果和证据片段输出 JSON。",
                  "顶层只允许包含 summary 字段。",
                  "summary 必须概括当前匹配结论、关键优势、关键差距和建议重点。",
                ].join("\n"),
              },
              {
                role: "user",
                content: JSON.stringify(
                  {
                    profile: {
                      id: contextTrace.value.profile.id,
                      name: contextTrace.value.profile.name,
                      target_role: contextTrace.value.profile.target_role,
                      skills: contextTrace.value.profile.skills,
                      summary: contextTrace.value.profile.summary,
                    },
                    job: {
                      id: contextTrace.value.job.id,
                      title: contextTrace.value.job.title,
                      description: contextTrace.value.job.job_description,
                    },
                    match_result: matchTrace.value,
                    knowledge_hits: knowledgeHits.slice(0, 5).map((item) => ({
                      title: item.title,
                      section_path: item.section_path,
                      chunk_text: item.chunk_text,
                    })),
                  },
                  null,
                  2,
                ),
              },
            ],
            maxTokens: 1200,
          });

          return analysisSummarySchema.parse(payload);
        },
        (result) => `已生成 ${result.summary.length} 字摘要`,
      );
      toolTrace.push(summaryTrace.trace);

      const reportTrace = await executeWithTrace(
        "report_generation",
        `match_id=${matchTrace.value.id}, evidence_count=${knowledgeHits.length}`,
        async () =>
          dependencies.reportService.createReportWithContext(
            {
              match_id: matchTrace.value.id,
            },
            {
              knowledge_hits: knowledgeHits,
              agent_summary: summaryTrace.value.summary,
            },
          ),
        (result) => `report_id=${result.report.id}, mode=${result.generator_mode}`,
      );
      toolTrace.push(reportTrace.trace);
      reportId = reportTrace.value.report.id;

      if (reportTrace.value.generator_mode === "template") {
        warnings.push("REPORT_TEMPLATE_FALLBACK");
        status = "partial_success";
      }

      const run = dependencies.agentRepository.createRun({
        trace_id: runtime.traceId,
        model: dependencies.llmClient.model,
        student_profile_id: input.student_profile_id,
        job_id: input.job_id,
        force_recalculate: Boolean(input.force_recalculate),
        top_k: firstTopK,
        status,
        knowledge_hit_count: knowledgeHits.length,
        match_result_id: matchTrace.value.id,
        report_id: reportTrace.value.report.id,
        warnings,
        tool_trace: toolTrace,
      });

      return {
        agent_run_id: run.id,
        trace_id: runtime.traceId,
        model: dependencies.llmClient.model,
        knowledge_hits: knowledgeHits,
        match_result: matchTrace.value,
        report: reportTrace.value.report,
        warnings,
        tool_trace: toolTrace,
      };
    } catch (wrappedError) {
      const traceWrapper =
        wrappedError &&
        typeof wrappedError === "object" &&
        "trace" in wrappedError &&
        "mappedError" in wrappedError
          ? (wrappedError as {
              trace: AgentToolTraceItem;
              mappedError: HttpError;
              originalError: unknown;
            })
          : null;

      if (traceWrapper) {
        toolTrace.push(traceWrapper.trace);
        dependencies.agentRepository.createRun({
          trace_id: runtime.traceId,
          model: dependencies.llmClient.model,
          student_profile_id: input.student_profile_id,
          job_id: input.job_id,
          force_recalculate: Boolean(input.force_recalculate),
          top_k: input.top_k ?? 5,
          status: "failed",
          knowledge_hit_count: knowledgeHits.length,
          match_result_id: matchResultId,
          report_id: reportId,
          warnings,
          tool_trace: toolTrace,
          error_code: traceWrapper.mappedError.code,
          error_message: traceWrapper.mappedError.message,
        });
        throw traceWrapper.mappedError;
      }

      const mappedError = mapAgentError(wrappedError);
      dependencies.agentRepository.createRun({
        trace_id: runtime.traceId,
        model: dependencies.llmClient.model,
        student_profile_id: input.student_profile_id,
        job_id: input.job_id,
        force_recalculate: Boolean(input.force_recalculate),
        top_k: input.top_k ?? 5,
        status: "failed",
        knowledge_hit_count: knowledgeHits.length,
        match_result_id: matchResultId,
        report_id: reportId,
        warnings,
        tool_trace: toolTrace,
        error_code: mappedError.code,
        error_message: mappedError.message,
      });
      throw mappedError;
    }
  }

  return {
    analyze,
  };
}
