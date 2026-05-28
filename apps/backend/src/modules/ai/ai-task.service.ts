import type {
  AiPlanStep,
  AiStepTraceItem,
  AiWarningCode,
  AiTaskResponse,
  AiTaskResult,
  AiTaskStatus,
  CreateAiTaskRequest,
  KnowledgeSearchResultItem,
  MatchResultDetail,
  CareerReportRecord,
} from "@career/contracts/types";

import type { MatchingService } from "../matching/matching.service.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import type { ReportService } from "../report/report.service.js";
import type { KnowledgeService } from "../knowledge/knowledge.service.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type { AiRepository, AiTaskRecord } from "./ai.repository.js";
import { runAiTaskAgent } from "./runtime/ai-agent.runtime.js";

type AiTaskServiceDependencies = {
  aiRepository: AiRepository;
  profileRepository: ProfileRepository;
  knowledgeService: KnowledgeService;
  matchingService: MatchingService;
  reportService: ReportService;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  cwd?: string;
};

type AiTaskRuntimeContext = {
  traceId: string;
};

type AiExecutionState = {
  knowledgeHits: KnowledgeSearchResultItem[];
  matchResult: MatchResultDetail | null;
  report: CareerReportRecord | null;
  warnings: AiWarningCode[];
};

function appendWarning(warnings: AiWarningCode[], warning: AiWarningCode): void {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function normalizeDeliverables(input?: CreateAiTaskRequest["deliverables"]) {
  const normalized: Array<"match_analysis" | "career_report"> = Array.from(
    new Set(input ?? ["match_analysis", "career_report"]),
  );
  if (normalized.includes("career_report") && !normalized.includes("match_analysis")) {
    normalized.unshift("match_analysis");
  }

  return normalized;
}

function normalizeObjective(input: {
  objective?: string;
  deliverables: ReturnType<typeof normalizeDeliverables>;
}): string {
  if (input.objective?.trim()) {
    return input.objective.trim();
  }

  if (input.deliverables.includes("career_report")) {
    return "评估学生与目标岗位的匹配情况，并尽量产出可执行的职业报告。";
  }

  return "评估学生与目标岗位的匹配情况，并给出明确的行动建议。";
}

function buildPlan(input: {
  objective: string;
  deliverables: ReturnType<typeof normalizeDeliverables>;
  topK: number;
}): AiPlanStep[] {
  const steps: AiPlanStep[] = [
    {
      id: "plan",
      tool: "task_planning",
      title: "拆解任务目标",
      purpose: `根据目标“${input.objective}”构造本轮 Pi Agent 提示与工具清单。`,
    },
    {
      id: "context",
      tool: "context_lookup",
      title: "读取任务上下文",
      purpose: "优先确认学生画像与岗位上下文，避免后续结论脱离真实任务输入。",
    },
    {
      id: "knowledge",
      tool: "knowledge_search",
      title: "检索知识证据",
      purpose: `按需补充最多 ${input.topK} 条知识证据，为匹配解释和报告撰写提供依据。`,
    },
    {
      id: "match",
      tool: "match_evaluation",
      title: "生成匹配结论",
      purpose: "通过匹配领域服务生成稳定可复现的人岗匹配结果。",
    },
  ];

  if (input.deliverables.includes("career_report")) {
    steps.push({
      id: "report",
      tool: "report_generation",
      title: "生成职业报告",
      purpose: "在匹配结果与证据上下文的基础上生成职业报告版本。",
    });
  }

  steps.push({
    id: "final",
    tool: "final_answer",
    title: "汇总任务结论",
    purpose: "输出最终中文结论，说明关键依据、报告状态与下一步建议。",
  });

  return steps;
}

function buildFallbackSummary(input: {
  objective: string;
  knowledgeHits: KnowledgeSearchResultItem[];
  matchResult: MatchResultDetail | null;
  report: CareerReportRecord | null;
  warnings: AiWarningCode[];
}): string {
  const parts: string[] = [`任务目标：${input.objective}`];

  if (input.matchResult) {
    parts.push(
      `已产出匹配结果，当前总分 ${input.matchResult.total_score}，建议优先处理 ${
        input.matchResult.gaps[0]?.dimension ?? "低分维度"
      }。`,
    );
  } else {
    parts.push("本次任务未能产出匹配结果。");
  }

  if (input.knowledgeHits.length > 0) {
    parts.push(`已补充 ${input.knowledgeHits.length} 条知识证据。`);
  } else {
    parts.push("当前未检索到稳定知识证据。");
  }

  if (input.report) {
    parts.push(`已生成报告 #${input.report.id}，可进入报告模块继续编辑。`);
  } else {
    parts.push("当前未生成报告产物。");
  }

  if (input.warnings.length > 0) {
    parts.push(`任务存在降级告警：${input.warnings.join("、")}。`);
  }

  return parts.join("");
}

function toTaskResponse(record: AiTaskRecord): AiTaskResponse {
  return {
    task_id: record.id,
    trace_id: record.trace_id,
    status: record.status,
    student_profile_id: record.student_profile_id,
    job_id: record.job_id,
    objective: record.objective,
    deliverables: record.deliverables,
    model: record.model,
    planned_steps: record.planned_steps,
    step_trace: record.step_trace,
    result: record.result,
    created_at: record.created_at,
    finished_at: record.finished_at,
  };
}

function deriveTaskStatus(input: {
  deliverables: ReturnType<typeof normalizeDeliverables>;
  stepTrace: AiStepTraceItem[];
  matchResult: MatchResultDetail | null;
  report: CareerReportRecord | null;
}): AiTaskStatus {
  if (!input.matchResult) {
    return "failed";
  }

  const requestedReport = input.deliverables.includes("career_report");
  const reportReady = !requestedReport || Boolean(input.report);
  const hasErrorTrace = input.stepTrace.some((item) => item.status === "error");

  if (reportReady && !hasErrorTrace) {
    return "success";
  }

  return "partial_success";
}

/**
 * 文件作用：基于 pi-coding-agent 驱动 AI 中枢任务。
 * 整体思路：由 Pi 决定工具调用顺序，后端只负责装配业务工具、持久化步骤轨迹和收敛最终产物。
 */
export interface AiTaskService {
  createTask(input: CreateAiTaskRequest, runtime: AiTaskRuntimeContext): Promise<AiTaskResponse>;
  getTask(taskId: number): Promise<AiTaskResponse>;
}

export function createAiTaskService(dependencies: AiTaskServiceDependencies): AiTaskService {
  async function createTask(
    input: CreateAiTaskRequest,
    runtime: AiTaskRuntimeContext,
  ): Promise<AiTaskResponse> {
    const startedAt = new Date().toISOString();
    const deliverables = normalizeDeliverables(input.deliverables);
    const objective = normalizeObjective({
      objective: input.objective,
      deliverables,
    });
    const topK = input.top_k ?? 5;
    const plannedSteps = buildPlan({
      objective,
      deliverables,
      topK,
    });

    const state: AiExecutionState = {
      knowledgeHits: [],
      matchResult: null,
      report: null,
      warnings: [],
    };
    let stepTrace: AiStepTraceItem[] = [];
    let resolvedModel: string | null = null;

    try {
      const jobName = input.job_name || String(input.job_id);

      const piResult = await runAiTaskAgent(
        {
          profileRepository: dependencies.profileRepository,
          knowledgeService: dependencies.knowledgeService,
          matchingService: dependencies.matchingService,
          reportService: dependencies.reportService,
        },
        {
          cwd: dependencies.cwd || process.cwd(),
          traceId: runtime.traceId,
          objective,
          deliverables,
          studentProfileId: input.student_profile_id,
          jobId: input.job_id,
          jobName,
          topK,
          forceRecalculate: Boolean(input.force_recalculate),
          piAgentDir: dependencies.piAgentDir,
          sessionStoreDir: dependencies.sessionStoreDir,
          model: dependencies.model,
          thinkingLevel: dependencies.thinkingLevel || "medium",
        },
      );

      stepTrace = piResult.stepTrace;
      resolvedModel = piResult.model;
      state.knowledgeHits = piResult.knowledgeHits;
      state.matchResult = piResult.matchResult;
      state.report = piResult.report;
      state.warnings = piResult.warnings;

      if (!piResult.finalSummary) {
        appendWarning(state.warnings, "FINAL_SUMMARY_FALLBACK");
      }

      if (!state.report && deliverables.includes("career_report")) {
        appendWarning(state.warnings, "REPORT_GENERATION_FAILED");
      }

      const result: AiTaskResult = {
        summary:
          piResult.finalSummary ||
          buildFallbackSummary({
            objective,
            knowledgeHits: state.knowledgeHits,
            matchResult: state.matchResult,
            report: state.report,
            warnings: state.warnings,
          }),
        knowledge_hits: state.knowledgeHits,
        match_result: state.matchResult,
        report: state.report,
        warnings: state.warnings,
      };

      const status = deriveTaskStatus({
        deliverables,
        stepTrace,
        matchResult: state.matchResult,
        report: state.report,
      });

      const record = await dependencies.aiRepository.createTask({
        trace_id: runtime.traceId,
        model: resolvedModel,
        status,
        student_profile_id: input.student_profile_id,
        job_id: input.job_id,
        objective,
        deliverables,
        force_recalculate: Boolean(input.force_recalculate),
        top_k: topK,
        planned_steps: plannedSteps,
        step_trace: stepTrace,
        result,
        created_at: startedAt,
        finished_at: new Date().toISOString(),
      });

      return toTaskResponse(record);
    } catch (error) {
      const mappedError =
        error instanceof HttpError
          ? error
          : new HttpError(
              500,
              "AGENT_ORCHESTRATION_FAILED",
              error instanceof Error ? error.message : "Pi Agent 任务执行失败",
            );

      const fallbackResult: AiTaskResult = {
        summary: buildFallbackSummary({
          objective,
          knowledgeHits: state.knowledgeHits,
          matchResult: state.matchResult,
          report: state.report,
          warnings: state.warnings,
        }),
        knowledge_hits: state.knowledgeHits,
        match_result: state.matchResult,
        report: state.report,
        warnings: state.warnings,
      };

      const [profileExists] = await Promise.all([
        dependencies.profileRepository.getStudentProfileById(input.student_profile_id),
      ]);

      // 失败快照表带有 profile 外键。输入本身非法时直接返回原始错误，避免用落库失败掩盖真正原因。
      if (profileExists) {
        await dependencies.aiRepository.createTask({
          trace_id: runtime.traceId,
          model: resolvedModel,
          status: "failed",
          student_profile_id: input.student_profile_id,
          job_id: input.job_id,
          objective,
          deliverables,
          force_recalculate: Boolean(input.force_recalculate),
          top_k: topK,
          planned_steps: plannedSteps,
          step_trace: stepTrace,
          result: fallbackResult,
          error_code: mappedError.code,
          error_message: mappedError.message,
          created_at: startedAt,
          finished_at: new Date().toISOString(),
        });
      }

      throw mappedError;
    }
  }

  async function getTask(taskId: number): Promise<AiTaskResponse> {
    const record = await dependencies.aiRepository.getTaskById(taskId);
    if (!record) {
      throw new HttpError(404, "AI_TASK_NOT_FOUND", "AI 任务不存在");
    }

    return toTaskResponse(record);
  }

  return {
    createTask,
    getTask,
  };
}
