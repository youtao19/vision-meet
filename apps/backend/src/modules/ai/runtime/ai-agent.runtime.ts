/**
 * 文件作用：基于 pi-coding-agent SDK 执行职业任务型 Agent。
 * 职责边界：本文件只负责会话装配、工具注册、事件订阅和结果归集；
 * 具体的画像/岗位/知识/匹配/报告业务能力通过 `pi-tools` 和各领域 service 提供。
 */

import path from "node:path";

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { AgentStepTraceItem, AgentWarningCode } from "@career/contracts/types";

import { HttpError } from "../../../shared/errors/http-error.js";
import { createCorePiTools } from "../../pi-tools/pi-tools.registry.js";
import type {
  AiAgentDependencies,
  AiAgentRunOptions,
  AiAgentRunResult,
  AiAgentRuntimeState,
} from "./ai-agent.types.js";
import {
  appendWarning,
  buildCareerAgentSystemPrompt,
  createSessionSubscription,
  ensureCompatibleAgentBootstrap,
  ensureDirectory,
  parseModelRef,
  resolveDefaultPiAgentDir,
  serializeJsonPreview,
} from "./ai-agent.utils.js";

export async function runAiTaskAgent(
  dependencies: AiAgentDependencies,
  options: AiAgentRunOptions,
): Promise<AiAgentRunResult> {
  const profile = await dependencies.profileRepository.getStudentProfileById(
    options.studentProfileId,
  );
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
  const selectedModel = modelRef
    ? modelRegistry.find(modelRef.provider, modelRef.modelId)
    : undefined;

  if (modelRef && !selectedModel) {
    throw new HttpError(
      500,
      "AGENT_MODEL_NOT_FOUND",
      `未在独立 Agent 配置目录中找到模型 ${modelRef.provider}/${modelRef.modelId}`,
    );
  }

  const state: AiAgentRuntimeState = {
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

  const toolContext = {
    dependencies,
    options,
    state,
    warnings,
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
    customTools: createCorePiTools(toolContext),
  });

  if (!session.model) {
    session.dispose();
    throw new HttpError(
      500,
      "AGENT_MODEL_UNAVAILABLE",
      modelFallbackMessage ||
        "当前独立 Agent 配置目录下没有可用模型，请先在 AGENT_PI_DIR 中完成模型与认证配置",
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
      output_summary: finalSummary
        ? `已生成 ${finalSummary.length} 字总结`
        : "模型未返回最终文本，需回退摘要",
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
