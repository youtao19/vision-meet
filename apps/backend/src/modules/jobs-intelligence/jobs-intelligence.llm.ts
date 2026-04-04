/**
 * 文件作用：封装岗位画像的 Agent 生成逻辑（仅 Agent，无 LLM 回退）。
 * 关键约束：Agent 调用失败必须抛错，由上层按失败记录处理，禁止静默降级。
 */

import fs from "node:fs";
import path from "node:path";

import type { JobRecord } from "@career/contracts/types";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";

import type { AppEnv } from "../../shared/config/env.js";
import {
  ensureCompatibleAgentBootstrap,
  ensureDirectory,
  resolveDefaultPiAgentDir,
} from "../../shared/agent/agent-bootstrap.js";
import type { JobProfileDraft, JobProfileNormalizationHint } from "./jobs-intelligence.profile.js";
import { generateHeuristicJobProfile } from "./jobs-intelligence.profile.js";

type AgentProfilePayload = {
  normalized_title?: string;
  job_family?: string;
  job_level?: number;
  professional_skills?: string[];
  certificate_requirements?: string[];
  innovation_score?: number;
  learning_score?: number;
  stress_tolerance_score?: number;
  communication_score?: number;
  internship_score?: number;
  summary?: string;
  confidence?: number;
};

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  const direct = safeParseJson(trimmed);
  if (direct !== undefined) {
    return direct;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!fenced) {
    return undefined;
  }
  return safeParseJson(fenced[1].trim());
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

function parseModelRef(model?: string): { provider: string; modelId: string } {
  if (!model?.trim()) {
    throw new Error(
      "未配置 AGENT_MODEL。请在 apps/backend/.env 中设置 AGENT_MODEL（或 MOONSHOT_MODEL/KIMI_MODEL）",
    );
  }
  const normalized = model.trim();
  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0 || slashIndex === normalized.length - 1) {
    throw new Error("AGENT_MODEL 格式非法，必须为 provider/model");
  }
  return {
    provider: normalized.slice(0, slashIndex),
    modelId: normalized.slice(slashIndex + 1),
  };
}

function normalizeScore(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const result = value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 20);

  return result.length > 0 ? result : fallback;
}

function buildPrompt(
  job: JobRecord,
  heuristic: JobProfileDraft,
  hint: JobProfileNormalizationHint,
): string {
  return [
    "请根据岗位信息生成结构化岗位画像 JSON。",
    "输出字段必须包含：normalized_title、job_family、job_level、professional_skills、certificate_requirements、innovation_score、learning_score、stress_tolerance_score、communication_score、internship_score、summary、confidence。",
    "约束：job_level 在 1-4；五个 score 在 0-100；confidence 在 0-1。",
    "岗位原始数据：",
    JSON.stringify(
      {
        title: job.title,
        description: job.job_description,
        company_intro: job.company_intro,
        industry: job.industry,
        normalization_hint: {
          normalized_title_hint: hint.normalized_title_hint ?? null,
          normalized_job_family_hint: hint.normalized_job_family_hint ?? null,
          normalization_confidence_hint: hint.normalization_confidence_hint ?? null,
        },
      },
      null,
      2,
    ),
    "规则基线画像（可用于参考与修正）：",
    JSON.stringify(heuristic, null, 2),
  ].join("\n");
}

/**
 * 作用：调用 Pi Agent 生成岗位画像。
 * 参数：job 为岗位原始记录，env 为运行时配置。
 * 返回：返回 agent 生成的岗位画像草稿。
 * 注意：本函数不会降级到 LLM 或规则画像；任意失败都会抛错。
 */
export async function generateAgentJobProfile(
  job: JobRecord,
  env: AppEnv,
  hint: JobProfileNormalizationHint = {},
): Promise<JobProfileDraft> {
  const startedAt = Date.now();
  const heuristic = generateHeuristicJobProfile(job, hint);

  const piAgentDir = env.AGENT_PI_DIR || resolveDefaultPiAgentDir();
  const sessionStoreRoot = env.AGENT_SESSION_STORE_DIR || path.join(piAgentDir, "sessions");
  const runtimeSessionDir = path.join(
    sessionStoreRoot,
    "job-profile-v2",
    `${job.id}-${Date.now()}`,
  );

  ensureDirectory(piAgentDir);
  ensureCompatibleAgentBootstrap(piAgentDir);
  ensureDirectory(runtimeSessionDir);

  const authStorage = AuthStorage.create(path.join(piAgentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(piAgentDir, "models.json"));
  const modelRef = parseModelRef(env.AGENT_MODEL);
  const selectedModel = modelRegistry.find(modelRef.provider, modelRef.modelId);

  if (!selectedModel) {
    throw new Error(`AGENT_MODEL 未命中可用模型：${modelRef.provider}/${modelRef.modelId}`);
  }

  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: piAgentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    systemPromptOverride: () => "你是岗位画像分析代理。必须输出 JSON，不得输出解释性文本。",
  });
  await resourceLoader.reload();

  const { session, modelFallbackMessage } = await createAgentSession({
    cwd: process.cwd(),
    agentDir: piAgentDir,
    authStorage,
    modelRegistry,
    model: selectedModel,
    thinkingLevel: env.AGENT_THINKING_LEVEL,
    sessionManager: SessionManager.create(process.cwd(), runtimeSessionDir),
    resourceLoader,
    tools: [],
    customTools: [],
  });

  if (!session.model) {
    session.dispose();
    throw new Error(modelFallbackMessage || "当前环境没有可用 Agent 模型");
  }

  const modelLabel = `${session.model.provider}/${session.model.id}`;
  console.info(`[jobs:agent] start job_id=${job.id} model=${modelLabel}`);

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

    if (event.type === "auto_retry_start") {
      console.warn(
        `[jobs:agent] retry_start job_id=${job.id} attempt=${event.attempt}/${event.maxAttempts}`,
      );
      return;
    }

    if (event.type === "auto_retry_end" && !event.success) {
      lastTurnError = event.finalError || "agent 自动重试失败";
      console.error(`[jobs:agent] retry_end job_id=${job.id} success=false`);
      return;
    }

    if (event.type === "turn_end") {
      const assistantMessage = event.message as {
        role?: unknown;
        stopReason?: unknown;
        errorMessage?: unknown;
      };
      if (assistantMessage.role === "assistant" && assistantMessage.stopReason === "error") {
        lastTurnError = String(assistantMessage.errorMessage || "agent turn 执行失败");
        console.error(
          `[jobs:agent] turn_error job_id=${job.id} reason=${lastTurnError.slice(0, 220)}`,
        );
      }
    }
  });

  try {
    await session.prompt(buildPrompt(job, heuristic, hint));

    const finalText = assistantMessages.at(-1) || streamBuffer.trim();
    const payload = extractJsonFromText(finalText) as AgentProfilePayload | undefined;
    if (!payload) {
      throw new Error("Agent 未返回可解析 JSON");
    }

    const draft: JobProfileDraft = {
      ...heuristic,
      normalized_title:
        String(payload.normalized_title || heuristic.normalized_title).trim() ||
        heuristic.normalized_title,
      job_family: String(payload.job_family || heuristic.job_family).trim() || heuristic.job_family,
      job_level: Math.max(1, Math.min(4, Number(payload.job_level || heuristic.job_level))),
      professional_skills: normalizeStringArray(
        payload.professional_skills,
        heuristic.professional_skills,
      ),
      certificate_requirements: normalizeStringArray(
        payload.certificate_requirements,
        heuristic.certificate_requirements,
      ),
      innovation_score: normalizeScore(payload.innovation_score, heuristic.innovation_score),
      learning_score: normalizeScore(payload.learning_score, heuristic.learning_score),
      stress_tolerance_score: normalizeScore(
        payload.stress_tolerance_score,
        heuristic.stress_tolerance_score,
      ),
      communication_score: normalizeScore(
        payload.communication_score,
        heuristic.communication_score,
      ),
      internship_score: normalizeScore(payload.internship_score, heuristic.internship_score),
      summary: String(payload.summary || heuristic.summary).trim() || heuristic.summary,
      confidence: Math.max(0, Math.min(1, Number(payload.confidence || heuristic.confidence))),
      generation_model: modelLabel,
      generation_mode: "agent",
      extracted_features: {
        ...heuristic.extracted_features,
        generated_by: "pi-agent",
      },
    };

    console.info(
      `[jobs:agent] success job_id=${job.id} elapsed_ms=${Date.now() - startedAt} model=${modelLabel}`,
    );
    return draft;
  } catch (error) {
    const baseMessage = error instanceof Error ? error.message : String(error);
    const finalMessage = lastTurnError ? `${baseMessage}; ${lastTurnError}` : baseMessage;
    console.error(
      `[jobs:agent] fail job_id=${job.id} elapsed_ms=${Date.now() - startedAt} reason=${finalMessage.slice(0, 320)}`,
    );
    throw new Error(finalMessage);
  } finally {
    unsubscribe();
    session.dispose();
  }
}
