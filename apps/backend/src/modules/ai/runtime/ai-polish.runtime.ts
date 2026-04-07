import path from "node:path";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import { HttpError } from "../../../shared/errors/http-error.js";
import {
  ensureCompatibleAgentBootstrap,
  ensureDirectory,
  parseModelRef,
  resolveDefaultPiAgentDir,
} from "./ai-agent.utils.js";
import type { CreateAiPolishRequest, AiPolishResponse } from "@career/contracts/types";

export type RunPolishAgentOptions = {
  input: CreateAiPolishRequest;
  traceId: string;
  model?: string;
  piAgentDir?: string;
  sessionStoreDir?: string;
  cwd?: string;
};

const POLISH_SYSTEM_PROMPT = `# Role: 润色专家
你是一个专业的文本润色助手，主要负责对职业规划报告章节内容进行润色。
你需要保持原意，提升语言专业度、逻辑性和连贯性。直接输出润色后的文本，不要输出解释性的话。`;

export async function runPolishAgent(options: RunPolishAgentOptions): Promise<AiPolishResponse> {
  const piAgentDir = options.piAgentDir || resolveDefaultPiAgentDir();
  const sessionStoreDir =
    options.sessionStoreDir || path.join(piAgentDir, "sessions", "polish-runtime");
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

  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: piAgentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    systemPromptOverride: () => POLISH_SYSTEM_PROMPT,
  });

  const cwd = options.cwd || process.cwd();
  const { session, modelFallbackMessage } = await createAgentSession({
    cwd,
    agentDir: piAgentDir,
    authStorage,
    modelRegistry,
    model: selectedModel,
    thinkingLevel: "off",
    sessionManager: SessionManager.create(cwd, taskSessionDir),
    resourceLoader,
    tools: [], // No tools needed
  });

  if (!session.model) {
    session.dispose();
    throw new HttpError(
      500,
      "AGENT_MODEL_UNAVAILABLE",
      modelFallbackMessage || "当前独立 Agent 配置目录下没有可用模型",
    );
  }

  const assistantMessages: string[] = [];
  const unsubscribe = session.subscribe((ev) => {
    if (
      ev.type === "message_update" &&
      (ev.message as { role?: unknown }).role === "assistant" &&
      ev.assistantMessageEvent.type === "text_delta"
    ) {
      assistantMessages.push(ev.assistantMessageEvent.delta);
    }
  });

  try {
    let userInput = `请润色如下文本：\n${options.input.content}`;
    if (options.input.section_title) {
      userInput = `背景（本章节标题）：${options.input.section_title}\n\n${userInput}`;
    }

    await session.prompt(userInput);

    let polishedText = assistantMessages.join("").trim();
    if (!polishedText) {
      polishedText = options.input.content; // fallback
    }

    return {
      polished_content: polishedText,
    };
  } finally {
    unsubscribe();
    session.dispose();
  }
}
