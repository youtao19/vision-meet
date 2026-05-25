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
import type { AiStepTraceItem, AiWarningCode } from "@career/contracts/types";

import { HttpError } from "../../../shared/errors/http-error.js";
import { resolvePiRuntimeModelRef } from "../../../shared/agent/pi-runtime-config.js";
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
  resolveDefaultPiAgentDir,
  serializeJsonPreview,
} from "./ai-agent.utils.js";

/**
 * 运行一次职业规划 Agent 任务。
 *
 * 主要流程：
 * 1. 先校验学生画像和目标岗位是否存在。
 * 2. 准备 Pi Agent 独立运行目录、认证文件、模型配置和会话目录。
 * 3. 创建运行时状态，用于让工具之间共享画像、岗位、知识检索结果、匹配结果和报告。
 * 4. 注册职业规划系统自己的 Pi Tools。
 * 5. 创建 Pi Agent 会话并发送任务提示词。
 * 6. 收集 Agent 执行过程中的步骤轨迹、告警、最终总结和业务结果。
 *
 * @param dependencies Agent 运行需要的外部依赖，例如画像仓库、岗位仓库、知识库服务等。
 * @param options 本次 Agent 任务的运行参数，例如学生画像 ID、岗位 ID、模型、交付物等。
 * @returns 返回 Agent 执行结果，包括步骤轨迹、匹配结果、报告、最终总结和告警。
 */
export async function runAiTaskAgent(
  dependencies: AiAgentDependencies,
  options: AiAgentRunOptions,
): Promise<AiAgentRunResult> {
  /**
   * 先读取学生画像。
   * 如果画像不存在，后面的匹配、报告生成都没有基础数据，所以直接抛出 404。
   */
  const profile = await dependencies.profileRepository.getStudentProfileById(
    options.studentProfileId,
  );
  if (!profile) {
    throw new HttpError(404, "STUDENT_PROFILE_NOT_FOUND", "学生画像不存在");
  }

  /**
   * 读取目标岗位。
   * 岗位不存在时，说明本次职业分析没有目标岗位，也直接终止。
   */
  const job = await dependencies.jobsRepository.getJobById(options.jobId);
  if (!job) {
    throw new HttpError(404, "JOB_NOT_FOUND", "目标岗位不存在或已下线");
  }

  /**
   * 准备 Pi Agent 的运行目录。
   *
   * piAgentDir：
   * - 存放 Pi Agent 的认证文件、模型配置等。
   *
   * sessionStoreDir：
   * - 存放职业规划 Agent 的会话记录。
   *
   * taskSessionDir：
   * - 当前任务独立的会话目录，用 traceId 隔离，方便排查单次任务。
   */
  const piAgentDir = options.piAgentDir || resolveDefaultPiAgentDir();
  const sessionStoreDir =
    options.sessionStoreDir || path.join(piAgentDir, "sessions", "career-agent-runtime");
  const taskSessionDir = path.join(sessionStoreDir, options.traceId);

  /**
   * 确保运行目录存在。
   * ensureCompatibleAgentBootstrap 用来保证 piAgentDir 中有 Pi Agent 运行所需的基础文件结构。
   */
  ensureDirectory(piAgentDir);
  ensureCompatibleAgentBootstrap(piAgentDir);
  ensureDirectory(taskSessionDir);

  /**
   * 创建认证存储和模型注册表。
   *
   * auth.json：
   * - 存放 Pi Agent 登录态或认证信息。
   *
   * models.json：
   * - 存放可用模型配置。
   */
  const authStorage = AuthStorage.create(path.join(piAgentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(piAgentDir, "models.json"));

  /**
   * 解析用户传入的模型配置。
   *
   * options.model 可能类似：
   * - openai/gpt-4.1
   * - anthropic/claude-sonnet
   *
   * 如果传了模型，就从模型注册表中查找；
   * 如果没传，就交给 Pi Agent 自己选择默认可用模型。
   */
  const modelRef = resolvePiRuntimeModelRef(piAgentDir, options.model);
  const selectedModel = modelRef
    ? modelRegistry.find(modelRef.provider, modelRef.modelId)
    : undefined;

  /**
   * 如果用户明确指定了模型，但本地配置中找不到，就直接报错。
   * 这样可以避免静默 fallback 到其他模型，导致结果和用户预期不一致。
   */
  if (modelRef && !selectedModel) {
    throw new HttpError(
      500,
      "AGENT_MODEL_NOT_FOUND",
      `未在独立 Agent 配置目录中找到模型 ${modelRef.raw}`,
    );
  }

  /**
   * Agent 运行时共享状态。
   *
   * 这些数据会被 pi-tools 读写：
   * - profile：学生画像
   * - job：目标岗位
   * - knowledgeHits：知识检索结果
   * - matchResult：岗位匹配结果
   * - report：最终职业报告
   */
  const state: AiAgentRuntimeState = {
    profile,
    job,
    knowledgeHits: [],
    matchResult: null,
    report: null,
  };

  /**
   * warnings 用来收集非致命问题。
   * 例如模型没有返回最终总结，但工具结果已经生成，这类情况不一定要让任务失败。
   */
  const warnings: AiWarningCode[] = [];

  /**
   * stepTrace 用来记录任务执行轨迹。
   * 前端可以用它展示 Agent 每一步做了什么。
   */
  const stepTrace: AiStepTraceItem[] = [
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

  /**
   * 保存 Agent 输出过的助手消息。
   * 最后会取最后一条作为 finalSummary。
   */
  const assistantMessages: string[] = [];

  /**
   * 工具上下文。
   * createCorePiTools 会把这些对象注入到工具里，
   * 让工具可以访问数据库、读取任务参数、修改运行状态、追加告警。
   */
  const toolContext = {
    dependencies,
    options,
    state,
    warnings,
  };

  /**
   * 创建资源加载器。
   *
   * 这里关闭 extensions、skills、prompt templates、themes，
   * 是为了让这个职业规划 Agent 的运行更可控：
   * - 不加载外部扩展
   * - 不加载用户本地 Skills
   * - 不加载额外提示词模板
   * - 只使用当前系统定义的 systemPrompt
   */
  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: piAgentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,

    /**
     * 禁用 AGENTS.md 之类的外部 Agent 文件。
     * 这样可以避免项目目录中的额外提示词影响本次职业规划任务。
     */
    agentsFilesOverride: () => ({
      agentsFiles: [],
    }),

    /**
     * 使用职业规划系统自己的系统提示词。
     * 这里定义 Agent 的角色、工作规则、工具调用顺序等。
     */
    systemPromptOverride: () => buildCareerAgentSystemPrompt(),
  });
  await resourceLoader.reload();

  /**
   * 创建 Pi Agent 会话。
   *
   * tools: []：
   * - 不启用 Pi SDK 默认工具。
   *
   * customTools：
   * - 只启用职业规划系统自己注册的工具。
   *
   * sessionManager：
   * - 使用当前任务独立目录保存会话，便于后续追踪。
   */
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

  /**
   * 创建会话后再次确认模型是否可用。
   * 如果 session.model 为空，说明 Pi Agent 没有找到可用模型或认证不可用。
   */
  if (!session.model) {
    session.dispose();
    throw new HttpError(
      500,
      "AGENT_MODEL_UNAVAILABLE",
      modelFallbackMessage ||
        "当前独立 Agent 配置目录下没有可用模型，请先在 AGENT_PI_DIR 中完成模型与认证配置",
    );
  }

  /**
   * 订阅 Agent 会话事件。
   *
   * createSessionSubscription 会把模型消息、工具调用、错误信息等事件
   * 转成 stepTrace、warnings 和 assistantMessages。
   */
  const unsubscribe = session.subscribe(
    createSessionSubscription({
      stepTrace,
      warnings,
      assistantMessages,
    }),
  );

  try {
    /**
     * 记录任务开始时间。
     * 后面 final_answer 步骤会用它计算总耗时。
     */
    const runStartedAt = Date.now();

    /**
     * 向 Agent 发送本次任务提示词。
     *
     * 这里只传必要任务信息：
     * - 任务目标
     * - 学生画像 ID
     * - 岗位 ID
     * - 交付物
     * - 知识检索数量
     *
     * 具体的数据读取和业务处理交给 customTools 完成。
     */
    await session.prompt(
      [
        `任务目标：${options.objective}`,
        `学生画像 ID：${options.studentProfileId}`,
        `岗位 ID：${options.jobId}`,
        `交付物：${options.deliverables.join("、")}`,
        `知识检索上限：${options.topK}`,

        /**
         * 根据本次交付物要求，约束 Agent 是否需要生成职业报告。
         * 这样可以避免 Agent 在不需要报告时乱调用 create_report。
         */
        options.deliverables.includes("career_report")
          ? "若要产出职业报告，请在生成匹配结果后再调用 create_report。"
          : "本次不需要生成职业报告，除非工具链明确要求，否则不要调用 create_report。",
      ].join("\n"),
    );

    /**
     * 取最后一条助手消息作为最终总结。
     * 如果模型没有输出文本，就记录一个告警，但不直接让任务失败。
     */
    const finalSummary = assistantMessages.at(-1)?.trim() || null;
    if (!finalSummary) {
      appendWarning(warnings, "FINAL_SUMMARY_FALLBACK");
    }

    /**
     * 追加最终汇总步骤。
     * 这一步主要给前端展示：Agent 已经完成最终结论整理。
     */
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

    /**
     * 返回本次 Agent 任务的完整结果。
     *
     * 注意：
     * matchResult、report、knowledgeHits 不是直接由模型返回，
     * 而是在 Agent 调用 customTools 时写入 state 中的。
     */
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
    /**
     * 无论任务成功还是失败，都要取消订阅并释放 session。
     * 避免事件监听器残留、资源泄漏或后续任务互相影响。
     */
    unsubscribe();
    session.dispose();
  }
}
