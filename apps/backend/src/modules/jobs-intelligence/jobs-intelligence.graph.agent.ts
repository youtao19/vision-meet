/**
 * 文件作用：基于 Pi Agent 推理生成职业路径图谱（节点 + 关系边）。
 * 设计边界：该文件只负责 Agent 调用与结果解析，不直接读写数据库。
 * 依赖关系：复用 ai/runtime 的 Agent 装配能力，输出与 jobs-intelligence.graph.manual.ts 相同的 CareerGraphSnapshot 结构。
 *
 * 性能关键点：
 *   - 输入数据必须精简，只保留岗位名、类别、技能关键词，省略原始维度描述。
 *   - 提示词要求 Agent 只输出 JSON，不要解释，避免多余 token 消耗。
 *   - 超时 120s，超出后调用方 fallback 到规则引擎。
 */

import { randomUUID } from "node:crypto";

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";

import type {
  CareerGraphEdgeRecord,
  CareerGraphSnapshot,
  ManualJobPortraitRecord,
} from "@career/contracts/types";

import type { AppEnv } from "../../shared/config/env.js";
import {
  ensureCompatibleAgentBootstrap,
  ensureDirectory,
  parseModelRef,
  resolveDefaultPiAgentDir,
  summarizeAssistantMessage,
} from "../ai/runtime/ai-agent.utils.js";

const GRAPH_VERSION = "v2.3-agent";

/**
 * Agent 图谱生成超时 120s。
 * 考虑到图谱分析需要一定的时间且基于精简指令，120s 为安全阈值。
 */
const GRAPH_AGENT_TIMEOUT_MS = 120_000;

// ─── 类型定义 ───────────────────────────────────────────

type AgentGraphNode = {
  id: string;
  job_id: number;
  title: string;
  family: string;
  level: number;
  skills: string[];
  summary: string;
};

type AgentGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation_type: "promotion" | "transition" | "skill_migration";
  reason: string;
  required_skills: string[];
  gap_skills: string[];
  transition_cost: "low" | "medium" | "high";
  direction_label: string;
  score: number;
};

type AgentGraphOutput = {
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
};

export type AgentCareerGraphResult = {
  snapshot: CareerGraphSnapshot;
  model: string | null;
  traceId: string;
  stats: {
    candidate_pairs: number;
    validated_pairs: number;
    promotion_edges: number;
    transition_edges: number;
    skill_migration_edges: number;
    transition_jobs_with_paths: number;
  };
};

// ─── 岗位画像精简摘要 ───────────────────────────────────

/**
 * 作用：将人工岗位画像转为极简格式，大幅降低 token 消耗。
 * 关键设计：只保留 job_name / category / 技能关键词 / 综合等级。
 */
function buildCompactPortraitInput(portraits: ManualJobPortraitRecord[]): string {
  const items = portraits.map((p, i) => {
    const skillTokens = extractSkillKeywords([
      p.skills.description,
      p.certification.description,
      p.experience.description,
    ]);

    const weightedLevel =
      p.skills.level * 0.32 +
      p.certification.level * 0.08 +
      p.innovation.level * 0.12 +
      p.learning.level * 0.12 +
      p.stress.level * 0.1 +
      p.communication.level * 0.14 +
      p.experience.level * 0.12;
    const level = Math.max(1, Math.min(5, Math.round(weightedLevel)));

    return `${i + 1}. ${p.job_name}（${p.category}）L${level} 技能：${skillTokens.join("、")}`;
  });

  return items.join("\n");
}

function extractSkillKeywords(descriptions: string[]): string[] {
  const tokens = new Set<string>();
  for (const desc of descriptions) {
    if (!desc) {
      continue;
    }
    const parts = desc.split(/[，,、；;。/\s]+/g);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length >= 2 && trimmed.length <= 12 && !isStopWord(trimmed)) {
        tokens.add(trimmed);
      }
    }
  }
  return Array.from(tokens).slice(0, 8);
}

function isStopWord(word: string): boolean {
  const stops = new Set([
    "需要",
    "具备",
    "能力",
    "要求",
    "以上",
    "相关",
    "工作",
    "经验",
    "熟悉",
    "了解",
    "掌握",
    "具有",
    "良好的",
    "优秀的",
    "较强的",
  ]);
  return stops.has(word);
}

// ─── Agent 提示词（精简版） ─────────────────────────────

function buildGraphAgentSystemPrompt(): string {
  return `你是岗位关系图谱建模专家。根据岗位数据输出 JSON，只返回 JSON 不要解释。

输出格式：{"nodes":[...],"edges":[...]}

nodes 示例：{"id":"job-1","job_id":1,"title":"Java开发","family":"software","level":2,"skills":["Java","Spring","MySQL"],"summary":"负责后端系统开发"}
edges 示例：{"id":"promotion-1-2","source":"job-1","target":"job-2","relation_type":"promotion","reason":"掌握 Java 后可晋升架构方向","required_skills":["系统设计"],"gap_skills":["分布式"],"transition_cost":"medium","direction_label":"晋升","score":75}

relation_type 取值：promotion（同族晋升）、transition（跨族换岗）、skill_migration（技能迁移）。
transition_cost 取值：low/medium/high。direction_label 用中文：晋升/换岗/技能迁移。
score 范围 1-100。reason 必须中文且含具体技能依据。

约束：
1. 每个岗位至少 1 条 promotion 边
2. 至少 5 个岗位有 transition 边，每个至少 2 条
3. 禁止 Markdown 包裹`;
}

function buildGraphAgentUserPrompt(compactInput: string): string {
  return `根据以下 ${compactInput.split("\n").length} 个岗位数据生成图谱 JSON。
只返回 {"nodes":[...],"edges":[...]}，不要解释。

岗位列表：
${compactInput}`;
}

// ─── JSON 解析 ──────────────────────────────────────────

function extractJsonObjectFromText(rawText: string): string | null {
  const fenced = rawText.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const genericFenced = rawText.match(/```\s*([\s\S]*?)```/);
  if (genericFenced?.[1]) {
    const content = genericFenced[1].trim();
    if (content.startsWith("{")) {
      return content;
    }
  }

  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }

  return rawText.slice(start, end + 1).trim();
}

// ─── 结果校验与修复 ──────────────────────────────────────

function sanitizeText(input: string | null | undefined): string {
  if (!input) {
    return "";
  }
  return input
    .replaceAll(/\u0000/g, "")
    .replaceAll(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 50;
  }
  return Math.max(1, Math.min(100, Math.round(value)));
}

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 2;
  }
  return Math.max(1, Math.min(5, Math.round(value)));
}

function normalizeRelationType(raw: string): CareerGraphEdgeRecord["relation_type"] {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "promotion") {
    return "promotion";
  }
  if (normalized === "transition") {
    return "transition";
  }
  if (normalized === "skill_migration") {
    return "skill_migration";
  }
  if (normalized.includes("晋升")) {
    return "promotion";
  }
  if (normalized.includes("换岗") || normalized.includes("转岗")) {
    return "transition";
  }
  return "skill_migration";
}

function normalizeTransitionCost(raw: string): CareerGraphEdgeRecord["transition_cost"] {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "low" || normalized === "低") {
    return "low";
  }
  if (normalized === "high" || normalized === "高") {
    return "high";
  }
  return "medium";
}

function normalizeDirectionLabel(relationType: CareerGraphEdgeRecord["relation_type"]): string {
  if (relationType === "promotion") {
    return "晋升";
  }
  if (relationType === "transition") {
    return "换岗";
  }
  return "技能迁移";
}

function validateAndNormalizeAgentOutput(parsed: unknown): AgentGraphOutput {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AGENT_GRAPH_JSON_INVALID: 输出不是对象");
  }

  const raw = parsed as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    throw new Error("AGENT_GRAPH_NODES_EMPTY: nodes 数组为空或缺失");
  }
  if (!Array.isArray(raw.edges) || raw.edges.length === 0) {
    throw new Error("AGENT_GRAPH_EDGES_EMPTY: edges 数组为空或缺失");
  }

  const nodes: AgentGraphNode[] = [];
  const nodeIds = new Set<string>();
  for (const item of raw.nodes) {
    if (!item || typeof item !== "object") continue;

    const node = item as Partial<AgentGraphNode>;
    const id = String(node.id || `job-${nodes.length + 1}`);
    nodes.push({
      id,
      job_id: Number.isFinite(node.job_id) ? Number(node.job_id) : nodes.length + 1,
      title: sanitizeText(node.title) || `岗位${nodes.length + 1}`,
      family: sanitizeText(node.family) || "other",
      level: clampLevel(Number(node.level)),
      skills: Array.isArray(node.skills) ? node.skills.map(String).filter(Boolean) : [],
      summary: sanitizeText(node.summary) || "待补充",
    });
    nodeIds.add(id);
  }

  const edges: AgentGraphEdge[] = [];
  for (const item of raw.edges) {
    if (!item || typeof item !== "object") continue;

    const edge = item as Partial<AgentGraphEdge>;
    const source = String(edge.source || "");
    const target = String(edge.target || "");
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    if (source === target) continue;

    const relationType = normalizeRelationType(String(edge.relation_type || ""));
    edges.push({
      id: String(edge.id || `${relationType}-${source}-${target}`),
      source,
      target,
      relation_type: relationType,
      reason: sanitizeText(edge.reason) || "Agent 推理关系",
      required_skills: Array.isArray(edge.required_skills)
        ? edge.required_skills.map(String).filter(Boolean)
        : [],
      gap_skills: Array.isArray(edge.gap_skills) ? edge.gap_skills.map(String).filter(Boolean) : [],
      transition_cost: normalizeTransitionCost(String(edge.transition_cost || "medium")),
      direction_label: edge.direction_label
        ? sanitizeText(edge.direction_label)
        : normalizeDirectionLabel(relationType),
      score: clampScore(Number(edge.score)),
    });
  }

  if (edges.length === 0) {
    throw new Error("AGENT_GRAPH_EDGES_ALL_FILTERED: 所有边校验后均被过滤");
  }

  return { nodes, edges };
}

// ─── 统计辅助 ────────────────────────────────────────────

function computeGraphStats(edges: AgentGraphEdge[]): AgentCareerGraphResult["stats"] {
  const promotionEdges = edges.filter((edge) => edge.relation_type === "promotion").length;
  const transitionEdges = edges.filter((edge) => edge.relation_type === "transition").length;
  const skillMigrationEdges = edges.filter(
    (edge) => edge.relation_type === "skill_migration",
  ).length;

  const transitionSources = new Set(
    edges
      .filter(
        (edge) => edge.relation_type === "transition" || edge.relation_type === "skill_migration",
      )
      .map((edge) => edge.source),
  );

  return {
    candidate_pairs: edges.length,
    validated_pairs: edges.length,
    promotion_edges: promotionEdges,
    transition_edges: transitionEdges,
    skill_migration_edges: skillMigrationEdges,
    transition_jobs_with_paths: transitionSources.size,
  };
}

// ─── 超时包装 ────────────────────────────────────────────

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`AGENT_GRAPH_TIMEOUT:${timeoutMs}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

// ─── 核心入口 ────────────────────────────────────────────

/**
 * 作用：调用 Pi Agent 基于岗位画像数据智能生成职业路径图谱。
 * 参数：portraits 为 v2_manual_job_portraits 中的岗位画像列表，env 提供 Agent 配置。
 * 返回：包含图谱快照、统计信息和 Agent 追踪 ID 的结果对象。
 * 注意：
 *   - Agent 超时或输出不合法时会直接抛异常，调用方应做 fallback 处理。
 *   - 所有 Agent 输出都经过防御性校验与修复，不依赖 Agent 输出的格式正确性。
 */
export async function generateCareerGraphByAgent(params: {
  portraits: ManualJobPortraitRecord[];
  env: AppEnv;
  cwd: string;
}): Promise<AgentCareerGraphResult> {
  const traceId = randomUUID();
  const piAgentDir = params.env.AGENT_PI_DIR || resolveDefaultPiAgentDir();
  const sessionStoreDir = params.env.AGENT_SESSION_STORE_DIR;
  const taskSessionDir = `${sessionStoreDir}/career-graph-agent/${traceId}`;

  ensureDirectory(piAgentDir);
  ensureCompatibleAgentBootstrap(piAgentDir);
  ensureDirectory(taskSessionDir);

  const authStorage = AuthStorage.create(`${piAgentDir}/auth.json`);
  const modelRegistry = ModelRegistry.create(authStorage, `${piAgentDir}/models.json`);
  const modelRef = parseModelRef(params.env.AGENT_MODEL);
  if (!modelRef) {
    throw new Error("AGENT_MODEL_REQUIRED: 图谱 Agent 生成需要配置 AGENT_MODEL");
  }

  const selectedModel = modelRegistry.find(modelRef.provider, modelRef.modelId);
  if (!selectedModel) {
    throw new Error(`AGENT_MODEL_NOT_FOUND:${modelRef.provider}/${modelRef.modelId}`);
  }

  // 装配无工具的 Agent 会话（纯文本推理，不需要业务工具）
  const resourceLoader = new DefaultResourceLoader({
    cwd: params.cwd,
    agentDir: piAgentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    systemPromptOverride: () => buildGraphAgentSystemPrompt(),
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: params.cwd,
    agentDir: piAgentDir,
    authStorage,
    modelRegistry,
    model: selectedModel,
    thinkingLevel: params.env.AGENT_THINKING_LEVEL,
    sessionManager: SessionManager.create(params.cwd, taskSessionDir),
    resourceLoader,
    tools: [],
    customTools: [],
  });

  const assistantMessages: string[] = [];
  let streamingAssistantBuffer = "";
  let lastTurnError = "";
  let streamingCharsReceived = 0;

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "message_update") {
      if (
        (event.message as { role?: unknown }).role === "assistant" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        streamingAssistantBuffer += event.assistantMessageEvent.delta;
        streamingCharsReceived += event.assistantMessageEvent.delta.length;

        // 每 500 字符输出一次流式进度日志，避免长时间无输出被误判
        if (streamingCharsReceived % 500 < event.assistantMessageEvent.delta.length) {
          console.info(
            `[career-graph-agent] streaming progress: ${streamingCharsReceived} chars received`,
          );
        }
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
        lastTurnError = String(assistantMessage.errorMessage || "图谱 Agent 执行失败");
      }
    }
  });

  try {
    const compactInput = buildCompactPortraitInput(params.portraits);
    const prompt = buildGraphAgentUserPrompt(compactInput);

    console.info(
      `[career-graph-agent] start trace_id=${traceId} portraits=${params.portraits.length} model=${params.env.AGENT_MODEL} prompt_chars=${prompt.length}`,
    );

    await withTimeout(session.prompt(prompt), GRAPH_AGENT_TIMEOUT_MS);

    if (lastTurnError) {
      throw new Error(lastTurnError);
    }

    // 优先取最后一条完整消息，兜底用流式缓冲区
    const rawText = assistantMessages.at(-1)?.trim() || streamingAssistantBuffer.trim();
    if (!rawText) {
      throw new Error("AGENT_GRAPH_NO_OUTPUT: Agent 未返回任何内容");
    }

    console.info(`[career-graph-agent] raw output received: ${rawText.length} chars`);

    const jsonText = extractJsonObjectFromText(rawText);
    if (!jsonText) {
      console.warn(
        `[career-graph-agent] JSON extraction failed, raw preview: ${rawText.slice(0, 200)}...`,
      );
      throw new Error("AGENT_GRAPH_JSON_NOT_FOUND: 无法从 Agent 输出中提取 JSON 对象");
    }

    const parsed = JSON.parse(jsonText) as unknown;
    const graphOutput = validateAndNormalizeAgentOutput(parsed);
    const stats = computeGraphStats(graphOutput.edges);

    console.info(
      `[career-graph-agent] success trace_id=${traceId} nodes=${graphOutput.nodes.length} edges=${graphOutput.edges.length} promotion=${stats.promotion_edges} transition=${stats.transition_edges} skill_migration=${stats.skill_migration_edges}`,
    );

    return {
      snapshot: {
        graph_version: GRAPH_VERSION,
        generated_at: new Date().toISOString(),
        nodes: graphOutput.nodes,
        edges: graphOutput.edges,
      },
      model: session.model ? `${session.model.provider}/${session.model.id}` : null,
      traceId,
      stats,
    };
  } finally {
    unsubscribe();
    session.dispose();
  }
}
