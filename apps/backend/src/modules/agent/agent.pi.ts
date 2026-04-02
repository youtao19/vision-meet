/**
 * 文件作用：基于 pi-coding-agent SDK 执行职业任务型 Agent。
 * 职责边界：本文件只负责会话装配、工具定义、事件订阅和结果归集；
 * 具体的画像/岗位/知识/匹配/报告业务能力仍然来自各领域 service / repository。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Type } from "@sinclair/typebox";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type AgentSessionEvent,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import type {
  AgentStepTraceItem,
  AgentToolName,
  AgentWarningCode,
  CareerReportRecord,
  JobRecord,
  KnowledgeSearchResultItem,
  MatchResultDetail,
  StudentProfileRecord,
} from "@career/contracts/types";

import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { MatchingService } from "../matching/matching.service.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import type { ReportService } from "../report/report.service.js";
import type { KnowledgeService } from "../knowledge/knowledge.service.js";
import { HttpError } from "../../shared/errors/http-error.js";

type PiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

type PiAgentRuntimeState = {
  profile: StudentProfileRecord;
  job: JobRecord;
  knowledgeHits: KnowledgeSearchResultItem[];
  matchResult: MatchResultDetail | null;
  report: CareerReportRecord | null;
};

type PiAgentDependencies = {
  profileRepository: ProfileRepository;
  jobsRepository: JobsRepository;
  knowledgeService: KnowledgeService;
  matchingService: MatchingService;
  reportService: ReportService;
};

type PiAgentRunOptions = {
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
  thinkingLevel: PiThinkingLevel;
};

export type PiAgentRunResult = {
  model: string | null;
  stepTrace: AgentStepTraceItem[];
  knowledgeHits: KnowledgeSearchResultItem[];
  matchResult: MatchResultDetail | null;
  report: CareerReportRecord | null;
  finalSummary: string | null;
  warnings: AgentWarningCode[];
};

type ToolExecutionSnapshot = {
  tool: AgentToolName;
  title: string;
  startedAt: number;
  inputSummary: string;
};

/**
 * 返回 career-agent 自己的默认 Agent 配置目录。
 * 这里保持项目隔离，不把其他工具目录当作主配置目录。
 */
function resolveDefaultPiAgentDir(): string {
  return path.join(os.homedir(), ".career-agent", "pi-agent");
}

/**
 * 返回仅用于兼容迁移的旧目录。
 * 这里只读取 openclaw 既有的 auth/models 文件，不把运行目录切过去。
 */
function resolveLegacyCompatibleAgentDir(): string {
  return path.join(os.homedir(), ".openclaw", "agents", "main", "agent");
}

function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 用缺省兼容策略补齐独立 Agent 目录中的关键配置文件。
 * 设计取舍：
 * 1. career-agent 仍以自己的目录为准；
 * 2. 仅当独立目录缺少文件时，才从兼容目录复制一次；
 * 3. 复制后后续运行都只使用独立目录，避免长期耦合到外部项目。
 */
function ensureCompatibleAgentBootstrap(targetAgentDir: string): void {
  const legacyAgentDir = resolveLegacyCompatibleAgentDir();
  const compatibleFiles = ["auth.json", "models.json"] as const;

  if (!fs.existsSync(legacyAgentDir)) {
    return;
  }

  for (const fileName of compatibleFiles) {
    const targetPath = path.join(targetAgentDir, fileName);
    if (fs.existsSync(targetPath)) {
      continue;
    }

    const legacyPath = path.join(legacyAgentDir, fileName);
    if (!fs.existsSync(legacyPath)) {
      continue;
    }

    fs.copyFileSync(legacyPath, targetPath);
    fs.chmodSync(targetPath, 0o600);
  }
}

function buildCareerAgentSystemPrompt(): string {
  return [
    "你是 Career Agent 的任务执行代理，底层运行在 pi-coding-agent SDK 中。",
    "当前任务不是改代码，而是基于业务工具完成学生画像与目标岗位的职业匹配任务。",
    "你只能依据工具返回的数据下结论，禁止编造任何画像、岗位、证据、评分或报告内容。",
    "建议先调用 load_task_context 理解任务上下文，再根据需要调用其他工具。",
    "生成职业报告前，必须先调用 create_match 产出匹配结果。",
    "若知识检索失败或证据不足，应明确说明，但在仍可继续时继续完成任务。",
    "最终回答必须使用中文，简洁说明：结论、关键依据、是否已生成报告、下一步建议。",
  ].join("\n");
}

function parseModelRef(modelRef?: string): { provider: string; modelId: string } | null {
  if (!modelRef) {
    return null;
  }

  const normalized = modelRef.trim();
  if (!normalized) {
    return null;
  }

  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0 || slashIndex === normalized.length - 1) {
    throw new HttpError(
      500,
      "AGENT_MODEL_INVALID",
      "AGENT_MODEL 必须采用 provider/model 的格式，例如 openai/gpt-5.1",
    );
  }

  return {
    provider: normalized.slice(0, slashIndex),
    modelId: normalized.slice(slashIndex + 1),
  };
}

function serializeJsonPreview(value: unknown, maxLength = 240): string {
  const raw = JSON.stringify(value);
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}...` : raw;
}

function buildDefaultKnowledgeQuery(state: PiAgentRuntimeState): string {
  return [
    `目标岗位 ${state.job.title}`,
    `候选方向 ${state.profile.target_role}`,
    state.profile.skills.length > 0 ? `技能 ${state.profile.skills.slice(0, 8).join(" ")}` : "",
    state.profile.summary,
  ]
    .filter(Boolean)
    .join("；");
}

function summarizeAssistantMessage(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((item) => {
      if (typeof item === "string") {
        return [item];
      }

      if (!item || typeof item !== "object") {
        return [];
      }

      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? [text] : [];
    })
    .join("\n")
    .trim();
}

function extractToolResultText(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? [text] : [];
    })
    .join("\n")
    .trim();
}

function buildToolOutputSummary(tool: AgentToolName, result: unknown): string {
  if (!result || typeof result !== "object") {
    return "工具未返回可摘要内容";
  }

  const details = (result as { details?: unknown }).details;
  if (details && typeof details === "object") {
    if (tool === "context_lookup") {
      const payload = details as {
        profile?: { id?: number; name?: string };
        job?: { id?: number; title?: string };
      };
      if (payload.profile?.id && payload.job?.id) {
        return `已加载画像 #${payload.profile.id} 与岗位 #${payload.job.id}`;
      }
    }

    if (tool === "knowledge_search") {
      const payload = details as { total?: number };
      if (typeof payload.total === "number") {
        return payload.total > 0 ? `命中 ${payload.total} 条知识证据` : "未命中知识证据";
      }
    }

    if (tool === "match_evaluation") {
      const payload = details as { match_result?: { id?: number; total_score?: number } };
      if (payload.match_result?.id) {
        return `match #${payload.match_result.id}，总分 ${payload.match_result.total_score ?? "-"}`;
      }
    }

    if (tool === "report_generation") {
      const payload = details as {
        report?: { id?: number };
        generator_mode?: string;
      };
      if (payload.report?.id) {
        return `report #${payload.report.id}，生成模式 ${payload.generator_mode ?? "unknown"}`;
      }
    }
  }

  const text = extractToolResultText(result);
  return text ? text.slice(0, 120) : "工具执行完成";
}

function mapRuntimeTool(toolName: string): { tool: AgentToolName; title: string } | null {
  switch (toolName) {
    case "load_task_context":
      return {
        tool: "context_lookup",
        title: "加载任务上下文",
      };
    case "search_knowledge":
      return {
        tool: "knowledge_search",
        title: "检索知识证据",
      };
    case "create_match":
      return {
        tool: "match_evaluation",
        title: "生成匹配结果",
      };
    case "create_report":
      return {
        tool: "report_generation",
        title: "生成职业报告",
      };
    default:
      return null;
  }
}

function appendWarning(warnings: AgentWarningCode[], warning: AgentWarningCode): void {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function readStringParam(
  params: unknown,
  key: string,
): string | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function readBooleanParam(
  params: unknown,
  key: string,
): boolean | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const value = (params as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

function readIntegerParam(
  params: unknown,
  key: string,
): number | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const value = (params as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function createSessionSubscription(params: {
  stepTrace: AgentStepTraceItem[];
  warnings: AgentWarningCode[];
  assistantMessages: string[];
}) {
  const executionMap = new Map<string, ToolExecutionSnapshot>();
  let streamingAssistantBuffer = "";

  return (event: AgentSessionEvent) => {
    if (event.type === "message_update") {
      if (
        (event.message as { role?: unknown }).role === "assistant" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        streamingAssistantBuffer += event.assistantMessageEvent.delta;
      }
      return;
    }

    if (event.type === "message_end") {
      if ((event.message as { role?: unknown }).role !== "assistant") {
        return;
      }

      const finalText = streamingAssistantBuffer.trim() || summarizeAssistantMessage(event.message);
      streamingAssistantBuffer = "";
      if (finalText) {
        params.assistantMessages.push(finalText);
      }
      return;
    }

    if (event.type === "tool_execution_start") {
      const mapped = mapRuntimeTool(event.toolName);
      if (!mapped) {
        return;
      }

      executionMap.set(event.toolCallId, {
        tool: mapped.tool,
        title: mapped.title,
        startedAt: Date.now(),
        inputSummary: serializeJsonPreview(event.args),
      });
      return;
    }

    if (event.type === "tool_execution_end") {
      const snapshot = executionMap.get(event.toolCallId);
      if (!snapshot) {
        return;
      }

      executionMap.delete(event.toolCallId);
      params.stepTrace.push({
        step_id: `${snapshot.tool}-${params.stepTrace.length + 1}`,
        tool: snapshot.tool,
        title: snapshot.title,
        status: event.isError ? "error" : "success",
        duration_ms: Date.now() - snapshot.startedAt,
        input_summary: snapshot.inputSummary,
        output_summary: event.isError
          ? extractToolResultText(event.result) || "工具执行失败"
          : buildToolOutputSummary(snapshot.tool, event.result),
        error_code: event.isError ? "AGENT_TOOL_EXECUTION_FAILED" : undefined,
      });

      if (event.isError && snapshot.tool === "knowledge_search") {
        appendWarning(params.warnings, "KNOWLEDGE_SEARCH_FAILED");
      }

      if (event.isError && snapshot.tool === "report_generation") {
        appendWarning(params.warnings, "REPORT_GENERATION_FAILED");
      }
    }
  };
}

export async function runPiCareerAgent(
  dependencies: PiAgentDependencies,
  options: PiAgentRunOptions,
): Promise<PiAgentRunResult> {
  const profile = await dependencies.profileRepository.getStudentProfileById(options.studentProfileId);
  if (!profile) {
    throw new HttpError(404, "STUDENT_PROFILE_NOT_FOUND", "学生画像不存在");
  }

  const job = await dependencies.jobsRepository.getJobById(options.jobId);
  if (!job) {
    throw new HttpError(404, "JOB_NOT_FOUND", "目标岗位不存在或已下线");
  }

  const piAgentDir = options.piAgentDir || resolveDefaultPiAgentDir();
  const sessionStoreDir =
    options.sessionStoreDir || path.join(piAgentDir, "sessions", "career-agent-runtime");
  const taskSessionDir = path.join(sessionStoreDir, options.traceId);
  ensureDirectory(piAgentDir);
  ensureCompatibleAgentBootstrap(piAgentDir);
  ensureDirectory(taskSessionDir);

  const authStorage = AuthStorage.create(path.join(piAgentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(piAgentDir, "models.json"));
  const modelRef = parseModelRef(options.model);
  const selectedModel = modelRef ? modelRegistry.find(modelRef.provider, modelRef.modelId) : undefined;

  if (modelRef && !selectedModel) {
    throw new HttpError(
      500,
      "AGENT_MODEL_NOT_FOUND",
      `未在独立 Agent 配置目录中找到模型 ${modelRef.provider}/${modelRef.modelId}`,
    );
  }

  const state: PiAgentRuntimeState = {
    profile,
    job,
    knowledgeHits: [],
    matchResult: null,
    report: null,
  };
  const warnings: AgentWarningCode[] = [];
  const stepTrace: AgentStepTraceItem[] = [
    {
      step_id: "task_planning",
      tool: "task_planning",
      title: "构造 Pi 任务计划",
      status: "success",
      duration_ms: 0,
      input_summary: serializeJsonPreview({
        student_profile_id: options.studentProfileId,
        job_id: options.jobId,
        deliverables: options.deliverables,
        top_k: options.topK,
      }),
      output_summary: "已创建 Pi Agent 会话与业务工具清单",
    },
  ];
  const assistantMessages: string[] = [];

  const loadTaskContextTool: ToolDefinition = {
    name: "load_task_context",
    label: "加载任务上下文",
    description: "读取当前任务绑定的学生画像和目标岗位信息。建议在任务开始时先调用。",
    parameters: Type.Object({}),
    execute: async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              profile: {
                id: state.profile.id,
                name: state.profile.name,
                target_role: state.profile.target_role,
                skills: state.profile.skills,
                summary: state.profile.summary,
              },
              job: {
                id: state.job.id,
                title: state.job.title,
                company_name: state.job.company_name,
                location: state.job.location,
                job_description: state.job.job_description,
              },
            },
            null,
            2,
          ),
        },
      ],
      details: {
        profile: state.profile,
        job: state.job,
      },
    }),
  };

  const searchKnowledgeTool: ToolDefinition = {
    name: "search_knowledge",
    label: "检索知识证据",
    description:
      "围绕当前学生画像和目标岗位检索知识证据。若不传 query，将使用画像摘要、技能和岗位名称自动构造检索语句。",
    parameters: Type.Object({
      query: Type.Optional(Type.String({ minLength: 1, description: "自定义检索 query" })),
      top_k: Type.Optional(
        Type.Integer({ minimum: 1, maximum: 10, description: "返回条数，默认沿用任务 top_k" }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const query = readStringParam(params, "query")?.trim() || buildDefaultKnowledgeQuery(state);
      const limit = readIntegerParam(params, "top_k") ?? options.topK;
      const response = await dependencies.knowledgeService.search({
        query,
        namespace: "career_runtime",
        student_profile_id: state.profile.id,
        limit,
      });
      state.knowledgeHits = response.items;

      if (response.items.length === 0) {
        appendWarning(warnings, "EVIDENCE_INSUFFICIENT");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query,
                total: response.total,
                items: response.items.slice(0, 5).map((item) => ({
                  id: item.id,
                  title: item.title,
                  section_path: item.section_path,
                  final_score: item.final_score,
                  chunk_text: item.chunk_text,
                })),
              },
              null,
              2,
            ),
          },
        ],
        details: {
          query,
          total: response.total,
          items: response.items,
        },
      };
    },
  };

  const createMatchTool: ToolDefinition = {
    name: "create_match",
    label: "生成人岗匹配",
    description: "基于当前任务的学生画像和岗位，生成稳定可复现的匹配结果。",
    parameters: Type.Object({
      force_recalculate: Type.Optional(
        Type.Boolean({ description: "是否忽略缓存并强制重算，默认沿用任务设置" }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const matchResult = await dependencies.matchingService.createMatch({
        student_profile_id: state.profile.id,
        job_id: state.job.id,
        force_recalculate: readBooleanParam(params, "force_recalculate") ?? options.forceRecalculate,
      });
      state.matchResult = matchResult;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: matchResult.id,
                total_score: matchResult.total_score,
                dimension_scores: matchResult.dimension_scores,
                gaps: matchResult.gaps.slice(0, 4),
                suggestions: matchResult.suggestions.slice(0, 5),
              },
              null,
              2,
            ),
          },
        ],
        details: {
          match_result: matchResult,
        },
      };
    },
  };

  const createReportTool: ToolDefinition = {
    name: "create_report",
    label: "生成职业报告",
    description:
      "基于当前匹配结果生成职业报告。会自动复用本轮任务已检索到的知识证据；调用前必须先生成匹配结果。",
    parameters: Type.Object({}),
    execute: async () => {
      if (!state.matchResult) {
        throw new Error("调用 create_report 前必须先执行 create_match");
      }

      const reportResult = await dependencies.reportService.createReportWithContext(
        {
          match_id: state.matchResult.id,
        },
        {
          knowledge_hits: state.knowledgeHits,
        },
      );
      state.report = reportResult.report;

      if (reportResult.generator_mode === "template") {
        appendWarning(warnings, "REPORT_TEMPLATE_FALLBACK");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: reportResult.report.id,
                version: reportResult.report.version,
                total_score: reportResult.report.total_score,
                generator_mode: reportResult.generator_mode,
                sections: reportResult.report.sections.map((section) => ({
                  key: section.key,
                  title: section.title,
                })),
              },
              null,
              2,
            ),
          },
        ],
        details: {
          report: reportResult.report,
          generator_mode: reportResult.generator_mode,
        },
      };
    },
  };

  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: piAgentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    agentsFilesOverride: () => ({
      agentsFiles: [],
    }),
    systemPromptOverride: () => buildCareerAgentSystemPrompt(),
  });
  await resourceLoader.reload();

  const { session, modelFallbackMessage } = await createAgentSession({
    cwd: options.cwd,
    agentDir: piAgentDir,
    authStorage,
    modelRegistry,
    model: selectedModel,
    thinkingLevel: options.thinkingLevel,
    sessionManager: SessionManager.create(options.cwd, taskSessionDir),
    resourceLoader,
    tools: [],
    customTools: [loadTaskContextTool, searchKnowledgeTool, createMatchTool, createReportTool],
  });

  if (!session.model) {
    session.dispose();
    throw new HttpError(
      500,
      "AGENT_MODEL_UNAVAILABLE",
      modelFallbackMessage || "当前独立 Agent 配置目录下没有可用模型，请先在 AGENT_PI_DIR 中完成模型与认证配置",
    );
  }

  const unsubscribe = session.subscribe(
    createSessionSubscription({
      stepTrace,
      warnings,
      assistantMessages,
    }),
  );

  try {
    const runStartedAt = Date.now();
    await session.prompt(
      [
        `任务目标：${options.objective}`,
        `学生画像 ID：${options.studentProfileId}`,
        `岗位 ID：${options.jobId}`,
        `交付物：${options.deliverables.join("、")}`,
        `知识检索上限：${options.topK}`,
        options.deliverables.includes("career_report")
          ? "若要产出职业报告，请在生成匹配结果后再调用 create_report。"
          : "本次不需要生成职业报告，除非工具链明确要求，否则不要调用 create_report。",
      ].join("\n"),
    );

    const finalSummary = assistantMessages.at(-1)?.trim() || null;
    if (!finalSummary) {
      appendWarning(warnings, "FINAL_SUMMARY_FALLBACK");
    }

    stepTrace.push({
      step_id: `final-${stepTrace.length + 1}`,
      tool: "final_answer",
      title: "汇总最终结论",
      status: finalSummary ? "success" : "warning",
      duration_ms: Date.now() - runStartedAt,
      input_summary: serializeJsonPreview({
        objective: options.objective,
        deliverables: options.deliverables,
      }),
      output_summary: finalSummary ? `已生成 ${finalSummary.length} 字总结` : "模型未返回最终文本，需回退摘要",
    });

    return {
      model: `${session.model.provider}/${session.model.id}`,
      stepTrace,
      knowledgeHits: state.knowledgeHits,
      matchResult: state.matchResult,
      report: state.report,
      finalSummary,
      warnings,
    };
  } finally {
    unsubscribe();
    session.dispose();
  }
}
