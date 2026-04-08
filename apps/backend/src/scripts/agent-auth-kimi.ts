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
 * 作用：解析当前 Agent 选用的 provider/model。
 * 参数：modelRef 为环境中的 AGENT_MODEL。
 * 返回：provider 与 modelId；未配置时回退到本项目默认的 Kimi Coding 组合。
 * 注意：这里优先服从现有 AGENT_MODEL，避免 auth.json 写进了与运行时不一致的 provider。
 */
function resolveModelRef(modelRef?: string): { provider: string; modelId: string; raw: string } {
  const normalized = modelRef?.trim() || "kimi-coding/k2p5";
  const slashIndex = normalized.indexOf("/");

  if (slashIndex <= 0 || slashIndex === normalized.length - 1) {
    throw new Error("AGENT_MODEL 必须采用 provider/model 格式，例如 kimi-coding/k2p5");
  }

  return {
    provider: normalized.slice(0, slashIndex),
    modelId: normalized.slice(slashIndex + 1),
    raw: normalized,
  };
}

/**
 * 作用：按 openclaw 的 provider 语义解析当前 Agent 应使用的 API key。
 * 参数：provider 为当前 `AGENT_MODEL` 对应的 provider。
 * 返回：可直接写入 auth.json 的真实 API key。
 * 注意：
 * 1. `moonshot` 只认 `MOONSHOT_API_KEY`，并可回退到 OpenClaw 的 `moonshot:default`。
 * 2. `kimi-coding` 只认 `KIMI_API_KEY/KIMICODE_API_KEY`，并可回退到 OpenClaw 的同名 profile。
 * 3. 不再把 `KIMI_API_KEY` 和 `MOONSHOT_API_KEY` 混写到同一个 provider。
 */
function resolveProviderApiKey(provider: string): string {
  if (provider === "moonshot") {
    const apiKey = appEnv.MOONSHOT_API_KEY || resolveLegacyOpenClawApiKey("moonshot");
    if (!apiKey) {
      throw new Error(
        "未找到 Moonshot API Key。请配置 MOONSHOT_API_KEY，或先在 OpenClaw 中完成 moonshot 认证后再导入",
      );
    }
    return apiKey;
  }

  if (provider === "kimi-coding") {
    const apiKey =
      appEnv.KIMI_API_KEY || appEnv.KIMICODE_API_KEY || resolveLegacyOpenClawApiKey("kimi-coding");
    if (!apiKey) {
      throw new Error(
        "未找到 Kimi Coding API Key。请配置 KIMI_API_KEY/KIMICODE_API_KEY，或先在 OpenClaw 中完成 kimi-coding 认证后再导入",
      );
    }
    return apiKey;
  }

  throw new Error(
    `当前脚本仅支持 openclaw 风格的 moonshot 与 kimi-coding provider，收到 ${provider}`,
  );
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
  const modelRef = resolveModelRef(appEnv.AGENT_MODEL);
  const apiKey = resolveProviderApiKey(modelRef.provider);

  ensureDirectory(agentDir);
  ensureCompatibleAgentBootstrap(agentDir);
  ensureMoonshotModelRegistry(modelsPath, modelRef);

  const authFile = readJsonFile<AgentAuthFile>(authPath, {});
  authFile[modelRef.provider] = {
    type: "api_key",
    key: apiKey,
  } satisfies AgentApiKeyCredential;

  writeJsonFile(authPath, authFile);

  console.log("AGENT_AUTH_OK");
  console.log(`agent_dir=${agentDir}`);
  console.log(`provider=${modelRef.provider}`);
  console.log(`model=${modelRef.raw}`);
  console.log("auth_source=auth.json");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`AGENT_AUTH_FAIL: ${message}`);
  process.exit(1);
});
