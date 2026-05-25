import path from "node:path";

import {
  AuthStorage,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";

import { HttpError } from "../../../shared/errors/http-error.js";
import { resolvePiRuntimeModelRef } from "../../../shared/agent/pi-runtime-config.js";
import {
  ensureCompatibleAgentBootstrap,
  ensureDirectory,
  resolveDefaultPiAgentDir,
  summarizeAssistantMessage,
} from "./ai-agent.utils.js";
import type { AiThinkingLevel } from "./ai-agent.types.js";

export type PiSessionImageInput = {
  type: "image";
  data: string;
  mimeType: string;
};
/**
 * Pi 会话运行参数。
 * 必填：链路 ID、运行目录、系统提示词、用户提示词、结果解析函数、会话范围、思考强度、超时时间
 * 选填：Pi Agent 目录、会话目录、模型、工具、日志前缀、错误码、错误消息
 */
type RunPiSessionOptions<T> = {
  traceId: string;
  cwd: string;
  systemPrompt: string;
  userPrompt: string;
  images?: PiSessionImageInput[];
  parseResult: (rawText: string) => T;
  piAgentDir?: string;
  sessionStoreDir?: string;
  sessionScope: string;
  model?: string;
  thinkingLevel: AiThinkingLevel;
  timeoutMs: number;
  tools?: ToolDefinition[];
  logPrefix?: string;
  timeoutErrorCode?: string;
  timeoutErrorMessage?: string;
  agentErrorCode?: string;
  agentErrorMessage?: (message: string) => string;
};
/**
 * Pi 会话运行结果。
 * 作用：返回实际使用的模型和解析后的业务结果。
 */
export type PiSessionRunResult<T> = {
  model: string | null;
  result: T;
};
/**
 * 给异步任务添加超时控制。
 * 作用：超时后抛出 504 错误，避免请求一直等待。
 */
async function withTimeout<T>(
  promise: Promise<T>,
  params: {
    timeoutMs: number;
    errorCode: string;
    errorMessage: string;
  },
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new HttpError(504, params.errorCode, params.errorMessage));
        }, params.timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
/**
 * 运行一次 Pi Agent 会话。
 * 作用：初始化模型、会话、资源加载器，发送提示词，收集模型输出并解析为业务结果。
 */
export async function runPiSession<T>(
  options: RunPiSessionOptions<T>,
): Promise<PiSessionRunResult<T>> {
  const startedAt = Date.now();
  const logPrefix = options.logPrefix || "pi-session";
  const timeoutErrorCode = options.timeoutErrorCode || "PI_SESSION_TIMEOUT";
  const timeoutErrorMessage =
    options.timeoutErrorMessage || `Pi 会话执行超时（>${options.timeoutMs / 1000} 秒），请稍后重试`;
  const agentErrorCode = options.agentErrorCode || "PI_SESSION_AGENT_ERROR";
  const piAgentDir = options.piAgentDir || resolveDefaultPiAgentDir();
  const sessionStoreDir =
    options.sessionStoreDir || path.join(piAgentDir, "sessions", options.sessionScope);
  const taskSessionDir = path.join(sessionStoreDir, options.traceId);

  ensureDirectory(piAgentDir);
  ensureCompatibleAgentBootstrap(piAgentDir);
  ensureDirectory(taskSessionDir);

  const authStorage = AuthStorage.create(path.join(piAgentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(piAgentDir, "models.json"));
  const modelRef = resolvePiRuntimeModelRef(piAgentDir, options.model);
  const selectedModel = modelRef
    ? modelRegistry.find(modelRef.provider, modelRef.modelId)
    : undefined;
  const selectedModelLabel = selectedModel
    ? `${selectedModel.provider}/${selectedModel.id}`
    : modelRef?.raw || "auto";
  if (modelRef && !selectedModel) {
    throw new HttpError(
      500,
      "AGENT_MODEL_NOT_FOUND",
      `未在独立 Agent 配置目录中找到模型 ${modelRef.raw}`,
    );
  }
  if (options.images?.length) {
    if (!modelRef) {
      throw new HttpError(
        500,
        "AGENT_MODEL_REQUIRED",
        "图片简历解析需要先选择 Pi 模型，请运行 npm run agent:auth -- login <provider> 或 npm run agent:auth -- use <provider/model>",
      );
    }
    const supportedInputs = Array.isArray((selectedModel as { input?: unknown } | undefined)?.input)
      ? ((selectedModel as { input?: string[] }).input ?? [])
      : [];
    if (!supportedInputs.includes("image")) {
      throw new HttpError(
        422,
        "AGENT_MODEL_IMAGE_UNSUPPORTED",
        `当前模型 ${selectedModelLabel} 未声明 image 输入能力，无法直接解析图片简历`,
      );
    }
  }

  console.info(
    `[${logPrefix}] start trace_id=${options.traceId} model=${selectedModelLabel} timeout_ms=${options.timeoutMs}`,
  );

  /**
   * 创建资源加载器。
   * 说明：禁用扩展、技能、模板和主题，只使用当前传入的系统提示词。
   */
  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: piAgentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    systemPromptOverride: () => options.systemPrompt,
  });
  await resourceLoader.reload();

  /**
   * 创建 Pi Agent 会话。
   * 说明：内置 tools 为空，自定义工具由 options.tools 传入。
   */
  const { session } = await createAgentSession({
    cwd: options.cwd,
    agentDir: piAgentDir,
    authStorage,
    modelRegistry,
    model: selectedModel,
    thinkingLevel: options.thinkingLevel,
    sessionManager: SessionManager.create(options.cwd, taskSessionDir),
    resourceLoader,
    tools: [],
    customTools: options.tools ?? [],
  });
  if (!session.model) {
    session.dispose();
    throw new HttpError(500, "AGENT_MODEL_UNAVAILABLE", "当前 Pi 登录配置下没有可用模型");
  }

  const assistantMessages: string[] = [];
  let streamingAssistantBuffer = "";
  let lastTurnError = "";

  /**
   * 监听 Agent 输出事件。
   * 作用：收集 assistant 流式文本，并记录模型执行错误。
   */
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "message_update") {
      if (
        (event.message as { role?: unknown }).role === "assistant" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        streamingAssistantBuffer += event.assistantMessageEvent.delta;
      }
      return;
    }

    if (
      event.type === "message_end" &&
      (event.message as { role?: unknown }).role === "assistant"
    ) {
      const finalText = streamingAssistantBuffer.trim() || summarizeAssistantMessage(event.message);
      streamingAssistantBuffer = "";
      if (finalText) {
        assistantMessages.push(finalText);
      }
      return;
    }

    if (event.type === "turn_end") {
      const assistantMessage = event.message as {
        role?: unknown;
        stopReason?: unknown;
        errorMessage?: unknown;
      };
      if (assistantMessage.role === "assistant" && assistantMessage.stopReason === "error") {
        lastTurnError = String(assistantMessage.errorMessage || "Pi 会话执行失败");
      }
    }
  });

  try {
    await withTimeout(session.prompt(options.userPrompt, options.images?.length ? { images: options.images } : undefined), {
      timeoutMs: options.timeoutMs,
      errorCode: timeoutErrorCode,
      errorMessage: timeoutErrorMessage,
    });

    if (lastTurnError) {
      throw new HttpError(
        502,
        agentErrorCode,
        options.agentErrorMessage ? options.agentErrorMessage(lastTurnError) : lastTurnError,
      );
    }

    /**
     * 解析最后一条 assistant 消息。
     * 说明：parseResult 由调用方传入，不同业务可以解析成不同结果。
     */
    const rawText = assistantMessages.at(-1)?.trim() || "";
    const result = options.parseResult(rawText);

    console.info(
      `[${logPrefix}] success trace_id=${options.traceId} duration_ms=${Date.now() - startedAt} raw_text_len=${rawText.length}`,
    );

    return {
      model: session.model ? `${session.model.provider}/${session.model.id}` : null,
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[${logPrefix}] fail trace_id=${options.traceId} duration_ms=${Date.now() - startedAt} message=${message}`,
    );
    throw error;
  } finally {
    unsubscribe();
    session.dispose();
  }
}
