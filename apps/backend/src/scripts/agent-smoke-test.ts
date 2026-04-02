/**
 * 文件作用：执行最小 Pi Agent 联通性自检。
 * 职责边界：本脚本只验证 Agent 目录、模型选择和最小提示词调用是否可用，
 * 不覆盖业务工具调用、数据库读写或完整任务编排链路。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";

import { appEnv } from "../shared/config/env.js";

/**
 * 作用：在项目独立 Agent 目录缺少兼容文件时，从旧目录复制一次。
 * 参数：targetAgentDir 为当前项目使用的 Agent 主目录。
 * 返回：无。
 * 注意：这里只做缺失补齐，不覆盖当前目录已有文件。
 */
function ensureCompatibleAgentBootstrap(targetAgentDir: string): void {
  const legacyAgentDir = path.join(os.homedir(), ".openclaw", "agents", "main", "agent");
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
    throw new Error("AGENT_MODEL 必须采用 provider/model 格式，例如 moonshot/kimi-k2.5");
  }

  return {
    provider: modelRef.slice(0, slashIndex),
    modelId: modelRef.slice(slashIndex + 1),
  };
}

async function main(): Promise<void> {
  const agentDir = appEnv.AGENT_PI_DIR;
  fs.mkdirSync(agentDir, { recursive: true });
  ensureCompatibleAgentBootstrap(agentDir);

  const authStorage = AuthStorage.create(path.join(agentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(agentDir, "models.json"));
  const modelRef = parseModelRef(appEnv.AGENT_MODEL);
  const selectedModel = modelRef ? modelRegistry.find(modelRef.provider, modelRef.modelId) : undefined;

  if (modelRef && !selectedModel) {
    throw new Error(`未找到模型 ${modelRef.provider}/${modelRef.modelId}，请检查 AGENT_MODEL 与 models.json`);
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

  try {
    await session.prompt("测试连通性，只回答 ok");
    console.log("AGENT_OK");
    console.log(`model=${session.model.provider}/${session.model.id}`);
  } finally {
    session.dispose();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`AGENT_FAIL: ${message}`);
  process.exit(1);
});
