/**
 * 文件作用：把 .env 中的模型服务配置转换为 Pi 可读取的 providers/models 配置。
 * 职责边界：这里只写 API 地址、环境变量名和默认模型，不把 API Key 明文写入 Pi 文件。
 */

import fs from "node:fs";
import path from "node:path";

import { AuthStorage } from "@mariozechner/pi-coding-agent";

import { appEnv } from "../config/env.js";
import { readPiRuntimeConfig, writeActivePiModel } from "./pi-runtime-config.js";

type PiModelConfig = {
  id: string;
  [key: string]: unknown;
};

type PiProviderConfig = {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  models?: PiModelConfig[];
  compat?: Record<string, unknown>;
  [key: string]: unknown;
};

type PiModelsFile = {
  providers?: Record<string, PiProviderConfig>;
  [key: string]: unknown;
};

const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  "kimi-coding": "kimi-for-coding",
  moonshot: "kimi-k2.5",
  deepseek: "deepseek-flash",
};

function readModelsFile(filePath: string): PiModelsFile {
  if (!fs.existsSync(filePath)) {
    return { providers: {} };
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return { providers: {} };
  }

  const parsed = JSON.parse(raw) as PiModelsFile;
  return {
    ...parsed,
    providers: parsed.providers && typeof parsed.providers === "object" ? parsed.providers : {},
  };
}

function mergeProvider(
  providers: Record<string, PiProviderConfig>,
  provider: string,
  config: PiProviderConfig,
): void {
  providers[provider] = {
    ...(providers[provider] || {}),
    ...config,
  };
}

function upsertModel(provider: PiProviderConfig, model: PiModelConfig): PiModelConfig[] {
  const models = Array.isArray(provider.models) ? [...provider.models] : [];
  const existingIndex = models.findIndex((item) => item.id === model.id);
  if (existingIndex < 0) {
    models.push(model);
  } else {
    models[existingIndex] = { ...models[existingIndex], ...model };
  }
  return models;
}

function writeModelsFile(filePath: string, value: PiModelsFile): void {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === serialized) {
    return;
  }

  fs.writeFileSync(filePath, serialized, "utf8");
  fs.chmodSync(filePath, 0o600);
}

/**
 * 作用：根据 .env 配置准备 Pi provider，并在首次运行时选择默认模型。
 * 注意：API Key 仅以环境变量名写入 models.json，实际密钥仍只从 .env 读取。
 */
export function ensurePiProviderConfig(agentDir: string): void {
  const modelsPath = path.join(agentDir, "models.json");
  const modelsFile = readModelsFile(modelsPath);
  const providers = modelsFile.providers || {};
  const configuredModels: string[] = [];
  const envManagedProviders: string[] = [];

  const kimiApiKey = appEnv.KIMI_API_KEY || appEnv.KIMICODE_API_KEY;
  if (kimiApiKey) {
    envManagedProviders.push("kimi-coding");
    const existing = providers["kimi-coding"] || {};
    mergeProvider(providers, "kimi-coding", {
      baseUrl: appEnv.KIMI_BASE_URL,
      api: "openai-completions",
      apiKey: appEnv.KIMI_API_KEY ? "KIMI_API_KEY" : "KIMICODE_API_KEY",
      compat: {
        ...existing.compat,
        reasoningEffortMap: {
          minimal: "low",
          low: "low",
          medium: "low",
          high: "high",
          xhigh: "max",
        },
      },
      models: upsertModel(existing, {
        id: DEFAULT_MODEL_BY_PROVIDER["kimi-coding"],
        name: "Kimi For Coding",
        api: "openai-completions",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 1_000_000,
      }),
    });
    configuredModels.push(`kimi-coding/${DEFAULT_MODEL_BY_PROVIDER["kimi-coding"]}`);
  }

  if (appEnv.MOONSHOT_API_KEY) {
    envManagedProviders.push("moonshot");
    const existing = providers.moonshot || {};
    mergeProvider(providers, "moonshot", {
      baseUrl: appEnv.MOONSHOT_BASE_URL,
      api: "openai-completions",
      apiKey: "MOONSHOT_API_KEY",
      compat: {
        ...existing.compat,
        supportsDeveloperRole: false,
      },
      models: upsertModel(existing, { id: DEFAULT_MODEL_BY_PROVIDER.moonshot }),
    });
    configuredModels.push(`moonshot/${DEFAULT_MODEL_BY_PROVIDER.moonshot}`);
  }

  if (appEnv.DEEPSEEK_API_KEY) {
    envManagedProviders.push("deepseek");
    const existing = providers.deepseek || {};
    mergeProvider(providers, "deepseek", {
      baseUrl: appEnv.DEEPSEEK_BASE_URL,
      api: "openai-completions",
      apiKey: "DEEPSEEK_API_KEY",
      models: upsertModel(existing, {
        id: DEFAULT_MODEL_BY_PROVIDER.deepseek,
        input: ["text", "image"],
      }),
    });
    configuredModels.push(`deepseek/${DEFAULT_MODEL_BY_PROVIDER.deepseek}`);
  }

  modelsFile.providers = providers;
  writeModelsFile(modelsPath, modelsFile);

  const activeModel = readPiRuntimeConfig(agentDir).active_model;
  const activeProvider = activeModel?.split("/", 1)[0];
  const activeModelNeedsUpgrade =
    ["kimi-coding/k2p5", "kimi-coding/kimi-k2-thinking"].includes(activeModel || "") &&
    Boolean(kimiApiKey);
  const currentProviderIsUnavailable =
    activeProvider &&
    Object.keys(DEFAULT_MODEL_BY_PROVIDER).includes(activeProvider) &&
    !envManagedProviders.includes(activeProvider);
  if (
    (!activeModel || activeModelNeedsUpgrade || currentProviderIsUnavailable) &&
    configuredModels.length > 0
  ) {
    writeActivePiModel(agentDir, configuredModels[0]);
  }
}

/**
 * 作用：创建 Pi 认证存储，并让本次进程优先使用 .env 中的 API Key。
 * 注意：运行时覆盖只保存在内存中，不改写 auth.json，也不输出密钥。
 */
export function createPiAuthStorage(agentDir: string): AuthStorage {
  const authStorage = AuthStorage.create(path.join(agentDir, "auth.json"));
  const kimiApiKey = appEnv.KIMI_API_KEY || appEnv.KIMICODE_API_KEY;

  if (kimiApiKey) {
    authStorage.setRuntimeApiKey("kimi-coding", kimiApiKey);
  }
  if (appEnv.MOONSHOT_API_KEY) {
    authStorage.setRuntimeApiKey("moonshot", appEnv.MOONSHOT_API_KEY);
  }
  if (appEnv.DEEPSEEK_API_KEY) {
    authStorage.setRuntimeApiKey("deepseek", appEnv.DEEPSEEK_API_KEY);
  }

  return authStorage;
}
