/**
 * 文件作用：执行最小 Pi Agent 联通性自检。
 * 职责边界：本脚本只验证 Agent 目录、模型选择和最小提示词调用是否可用，
 * 不覆盖业务工具调用、数据库读写或完整任务编排链路。
 */

import path from "node:path";

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";

import {
  ensureCompatibleAgentBootstrap,
  resolveDefaultPiAgentDir,
} from "../shared/agent/agent-bootstrap.js";
import { appEnv } from "../shared/config/env.js";

/**
 * 作用：把 provider/model 形式的配置解析为模型注册表可查询的引用。
 * 参数：modelRef 为 AGENT_MODEL 配置值。
 * 返回：provider 与 modelId；未配置时返回 null。
 * 注意：格式非法时直接抛错，避免 smoke 结果被“自动回退”掩盖。
 */
function parseModelRef(modelRef?: string): { provider: string; modelId: string } | null {
  if (!modelRef?.trim()) {
    return null;
  }

  const slashIndex = modelRef.indexOf("/");
  if (slashIndex <= 0 || slashIndex === modelRef.length - 1) {
    throw new Error("AGENT_MODEL 必须采用 provider/model 格式，例如 kimi-coding/k2p5");
  }

  return {
    provider: modelRef.slice(0, slashIndex),
    modelId: modelRef.slice(slashIndex + 1),
  };
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

async function main(): Promise<void> {
  const agentDir = appEnv.AGENT_PI_DIR || resolveDefaultPiAgentDir();
  ensureCompatibleAgentBootstrap(agentDir);

  const authStorage = AuthStorage.create(path.join(agentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(agentDir, "models.json"));
  const modelRef = parseModelRef(appEnv.AGENT_MODEL);
  const selectedModel = modelRef
    ? modelRegistry.find(modelRef.provider, modelRef.modelId)
    : undefined;

  if (modelRef && !selectedModel) {
    throw new Error(
      `未找到模型 ${modelRef.provider}/${modelRef.modelId}，请检查 AGENT_MODEL 与 models.json`,
    );
  }

  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    agentsFilesOverride: () => ({
      agentsFiles: [],
    }),
    systemPromptOverride: () => "你是 Career Agent 联通性自检助手，只能回答 ok。",
  });
  await resourceLoader.reload();

  const { session, modelFallbackMessage } = await createAgentSession({
    cwd: process.cwd(),
    agentDir,
    authStorage,
    modelRegistry,
    model: selectedModel,
    thinkingLevel: "off",
    sessionManager: SessionManager.inMemory(),
    resourceLoader,
    tools: [],
    customTools: [],
  });

  if (!session.model) {
    session.dispose();
    throw new Error(modelFallbackMessage || "当前环境没有可用 Agent 模型");
  }

  const assistantMessages: string[] = [];
  let streamBuffer = "";
  let lastTurnError = "";
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "message_update") {
      if (
        (event.message as { role?: unknown }).role === "assistant" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        streamBuffer += event.assistantMessageEvent.delta;
      }
      return;
    }

    if (
      event.type === "message_end" &&
      (event.message as { role?: unknown }).role === "assistant"
    ) {
      const finalText = streamBuffer.trim() || summarizeAssistantMessage(event.message);
      streamBuffer = "";
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
        lastTurnError = String(assistantMessage.errorMessage || "agent smoke 执行失败");
      }
    }
  });

  try {
    await session.prompt("测试连通性，只回答 ok");
    if (lastTurnError) {
      throw new Error(lastTurnError);
    }

    const finalText = (assistantMessages.at(-1) || streamBuffer).trim().toLowerCase();
    if (!finalText) {
      throw new Error("Agent 未返回可用响应");
    }

    console.log("AGENT_OK");
    console.log(`model=${session.model.provider}/${session.model.id}`);
  } finally {
    unsubscribe();
    session.dispose();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`AGENT_FAIL: ${message}`);
  process.exit(1);
});
