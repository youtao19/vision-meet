/**
 * 文件作用：保存项目 Pi 运行时选择的模型。
 * 职责边界：这里只管理 Agent 目录内的本项目运行配置，不读取业务环境变量。
 */

import fs from "node:fs";
import path from "node:path";

import type { ModelRegistry } from "@mariozechner/pi-coding-agent";

export type PiRuntimeModelRef = {
  provider: string;
  modelId: string;
  raw: string;
};

type PiRuntimeConfig = {
  active_model?: string;
};

const RUNTIME_CONFIG_FILE = "career-agent-runtime.json";

const providerDefaultModels: Record<string, string[]> = {
  "openai-codex": ["gpt-5.4", "gpt-5.2", "gpt-5", "gpt-4.1"],
  "github-copilot": ["gpt-5.4", "gpt-5.2", "gpt-5", "claude-sonnet-4.5"],
  "kimi-coding": ["k2p5", "kimi-for-coding"],
  moonshot: ["kimi-k2.5", "kimi-k2-0905-preview", "kimi-k2-turbo-preview"],
};

export function getPiRuntimeConfigPath(agentDir: string): string {
  return path.join(agentDir, RUNTIME_CONFIG_FILE);
}

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

function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.chmodSync(filePath, 0o600);
}

export function readPiRuntimeConfig(agentDir: string): PiRuntimeConfig {
  return readJsonFile<PiRuntimeConfig>(getPiRuntimeConfigPath(agentDir), {});
}

export function parsePiModelRef(modelRef?: string): PiRuntimeModelRef | null {
  const normalized = modelRef?.trim();
  if (!normalized) {
    return null;
  }

  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0 || slashIndex === normalized.length - 1) {
    throw new Error("模型必须采用 provider/model 格式，例如 kimi-coding/k2p5");
  }

  return {
    provider: normalized.slice(0, slashIndex),
    modelId: normalized.slice(slashIndex + 1),
    raw: normalized,
  };
}

export function resolvePiRuntimeModelRef(
  agentDir: string,
  explicitModel?: string,
): PiRuntimeModelRef | null {
  return parsePiModelRef(explicitModel || readPiRuntimeConfig(agentDir).active_model);
}

export function writeActivePiModel(agentDir: string, modelRef: string): void {
  parsePiModelRef(modelRef);
  writeJsonFile(getPiRuntimeConfigPath(agentDir), {
    ...readPiRuntimeConfig(agentDir),
    active_model: modelRef.trim(),
  } satisfies PiRuntimeConfig);
}

export function findDefaultModelForProvider(
  modelRegistry: ModelRegistry,
  provider: string,
): string | null {
  const candidates = providerDefaultModels[provider] || [];
  for (const modelId of candidates) {
    if (modelRegistry.find(provider, modelId)) {
      return `${provider}/${modelId}`;
    }
  }

  return null;
}
