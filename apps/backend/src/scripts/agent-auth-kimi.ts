/**
 * 文件作用：把 Kimi / Moonshot API 凭证写入本项目独立 Agent 目录的 auth.json。
 * 职责边界：本脚本只负责认证配置落盘与最小模型配置补齐，不负责发起业务请求或创建运行时会话。
 * 依赖关系：复用 ai runtime 的目录初始化工具，确保与主运行时、smoke 脚本使用同一份 Agent 主目录。
 */

import fs from "node:fs";
import path from "node:path";

import { appEnv } from "../shared/config/env.js";
import {
  ensureCompatibleAgentBootstrap,
  ensureDirectory,
  resolveLegacyOpenClawApiKey,
  resolveDefaultPiAgentDir,
} from "../shared/agent/agent-bootstrap.js";
import { readPiRuntimeConfig, writeActivePiModel } from "../shared/agent/pi-runtime-config.js";

type AgentApiKeyCredential = {
  type: "api_key";
  key: string;
};

type AgentAuthFile = Record<string, AgentApiKeyCredential | unknown>;

type AgentModelConfig = {
  id: string;
  name: string;
  reasoning: boolean;
  input: string[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  api: string;
};

type AgentProviderConfig = {
  baseUrl: string;
  api: string;
  models: AgentModelConfig[];
  apiKey?: string;
  compat?: {
    supportsDeveloperRole?: boolean;
  };
};

type AgentModelsFile = {
  providers?: Record<string, AgentProviderConfig | unknown>;
};

/**
 * 作用：安全读取 JSON 文件；文件不存在时返回兜底值。
 * 参数：filePath 为目标 JSON 文件路径；fallback 为读取失败时使用的默认值。
 * 返回：解析成功的对象或 fallback。
 * 注意：若 JSON 内容损坏则直接抛错，避免把非法配置悄悄覆盖掉。
 */
function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return fallback;
  }

  return JSON.parse(raw) as T;
}

/**
 * 作用：把对象稳定写入 JSON 文件并收紧权限。
 * 参数：filePath 为目标路径；value 为要写入的对象。
 * 返回：无。
 * 注意：认证文件会显式设置为 600，避免其他用户读取。
 */
function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.chmodSync(filePath, 0o600);
}

/**
 * 作用：生成与 openclaw Moonshot 文档一致的默认模型清单。
 * 参数：无。
 * 返回：Moonshot Kimi 模型定义列表。
 */
function buildOpenClawStyleMoonshotModels(): AgentModelConfig[] {
  return [
    { id: "kimi-k2.5", name: "Kimi K2.5", reasoning: false },
    { id: "kimi-k2-0905-preview", name: "Kimi K2 0905 Preview", reasoning: false },
    { id: "kimi-k2-turbo-preview", name: "Kimi K2 Turbo", reasoning: false },
    { id: "kimi-k2-thinking", name: "Kimi K2 Thinking", reasoning: true },
    { id: "kimi-k2-thinking-turbo", name: "Kimi K2 Thinking Turbo", reasoning: true },
  ].map((item) => ({
    ...item,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 256000,
    maxTokens: 8192,
    api: "openai-completions",
  }));
}

/**
 * 作用：在 models.json 中补齐 openclaw 风格的 Moonshot provider 配置。
 * 参数：modelsPath 为项目 Agent 目录下的 models.json；modelRef 为当前目标模型。
 * 返回：无。
 * 注意：若 provider 已存在，则只补齐缺失字段和缺失模型，不覆盖已有自定义设置。
 */
function ensureMoonshotModelRegistry(
  modelsPath: string,
  modelRef: { provider: string; modelId: string },
): void {
  const modelsFile = readJsonFile<AgentModelsFile>(modelsPath, { providers: {} });
  const providers = modelsFile.providers || {};

  if (modelRef.provider !== "moonshot") {
    return;
  }

  const existingProvider = providers[modelRef.provider];
  const providerConfig: AgentProviderConfig =
    existingProvider && typeof existingProvider === "object"
      ? (existingProvider as AgentProviderConfig)
      : {
          baseUrl: "",
          api: "openai-completions",
          models: [],
        };

  providerConfig.baseUrl =
    providerConfig.baseUrl || appEnv.MOONSHOT_BASE_URL || "https://api.moonshot.ai/v1";
  providerConfig.api = "openai-completions";
  providerConfig.apiKey = providerConfig.apiKey || "MOONSHOT_API_KEY";
  providerConfig.compat = {
    ...providerConfig.compat,
    supportsDeveloperRole: false,
  };

  const existingModels = Array.isArray(providerConfig.models) ? providerConfig.models : [];
  const modelIds = new Set(existingModels.map((item) => item.id));
  for (const model of buildOpenClawStyleMoonshotModels()) {
    if (!modelIds.has(model.id)) {
      existingModels.push(model);
    }
  }

  if (!modelIds.has(modelRef.modelId)) {
    existingModels.push({
      id: modelRef.modelId,
      name: modelRef.modelId,
      reasoning: false,
      input: ["text"],
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: 256000,
      maxTokens: 8192,
      api: "openai-completions",
    });
  }

  providerConfig.models = existingModels;
  providers[modelRef.provider] = providerConfig;

  modelsFile.providers = providers;
  writeJsonFile(modelsPath, modelsFile);
}

async function main(): Promise<void> {
  const agentDir = appEnv.AGENT_PI_DIR || resolveDefaultPiAgentDir();
  const authPath = path.join(agentDir, "auth.json");
  const modelsPath = path.join(agentDir, "models.json");

  ensureDirectory(agentDir);
  ensureCompatibleAgentBootstrap(agentDir);

  const authFile = readJsonFile<AgentAuthFile>(authPath, {});
  const writtenProviders: string[] = [];

  const kimiApiKey =
    appEnv.KIMI_API_KEY || appEnv.KIMICODE_API_KEY || resolveLegacyOpenClawApiKey("kimi-coding");
  if (kimiApiKey) {
    authFile["kimi-coding"] = {
      type: "api_key",
      key: kimiApiKey,
    } satisfies AgentApiKeyCredential;
    writtenProviders.push("kimi-coding");
  }

  const moonshotApiKey = appEnv.MOONSHOT_API_KEY || resolveLegacyOpenClawApiKey("moonshot");
  if (moonshotApiKey) {
    ensureMoonshotModelRegistry(modelsPath, { provider: "moonshot", modelId: "kimi-k2.5" });
    authFile.moonshot = {
      type: "api_key",
      key: moonshotApiKey,
    } satisfies AgentApiKeyCredential;
    writtenProviders.push("moonshot");
  }

  if (writtenProviders.length === 0) {
    throw new Error(
      "未找到 Kimi/Moonshot API Key。请配置 KIMI_API_KEY/KIMICODE_API_KEY 或 MOONSHOT_API_KEY",
    );
  }

  writeJsonFile(authPath, authFile);

  let activeModel = readPiRuntimeConfig(agentDir).active_model;
  if (!activeModel) {
    activeModel = writtenProviders.includes("kimi-coding")
      ? "kimi-coding/k2p5"
      : "moonshot/kimi-k2.5";
    writeActivePiModel(agentDir, activeModel);
  }

  console.log("AGENT_AUTH_OK");
  console.log(`agent_dir=${agentDir}`);
  console.log(`providers=${writtenProviders.join(",")}`);
  console.log(`active_model=${activeModel}`);
  console.log("auth_source=auth.json");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`AGENT_AUTH_FAIL: ${message}`);
  process.exit(1);
});
