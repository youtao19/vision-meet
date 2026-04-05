/**
 * 文件作用：承载岗位智能处理域核心业务逻辑（批处理、画像查询、图谱查询）。
 * 设计边界：service 负责业务编排和容错，具体读写由 repository adapter 完成。
 */

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import { randomUUID } from "node:crypto";

import type {
  CareerGraphSnapshot,
  CanonicalRoleRecord,
  CanonicalRolesListParams,
  CanonicalRolesListResponse,
  CareerPathNode,
  CareerPathV2GenerateResponse,
  CareerPathV2GraphResponse,
  CareerRouteRecommendation,
  CareerRouteStep,
  JobPipelineMode,
  JobPipelineTaskRecord,
  JobFactsListParams,
  JobFactsListResponse,
  JobFactRecord,
  JobPipelineFailureListResponse,
  JobPipelineRetryProcessResult,
  JobPipelineRetryQueueListResponse,
  ManualJobPortraitRecord,
  PostingProfileFacts,
} from "@career/contracts/types";

import type { AppEnv } from "../../shared/config/env.js";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  ensureCompatibleAgentBootstrap,
  ensureDirectory,
  parseModelRef,
  resolveDefaultPiAgentDir,
  summarizeAssistantMessage,
} from "../ai/runtime/ai-agent.utils.js";
import {
  CANONICAL_MIN_CONFIDENCE,
  buildCanonicalRoleProfile,
  extractPostingProfileFacts,
  groupPostingFactsByRole,
  isPostingFactEligibleForCanonical,
} from "./jobs-intelligence.profile.js";
import { buildCareerGraphFromManualPortraits } from "./jobs-intelligence.graph.manual.js";
import { generateCareerGraphByAgent } from "./jobs-intelligence.graph.agent.js";
import type { JobsIntelligenceGraphRepository } from "./jobs-intelligence.repository.neo4j.js";
import type { JobsIntelligenceRepository } from "./jobs-intelligence.repository.js";

const PIPELINE_PROGRESS_FLUSH_INTERVAL = 50;
const JOB_PORTRAIT_TARGET_COUNT = 10;
const JOB_PORTRAIT_AGENT_TIMEOUT_MS = 180000;

type PipelineCleanedJob = {
  task_id: number;
  job_id: number;
  source_row_id: string | null;
  title: string;
  normalized_title: string;
  job_family: string;
  location: string | null;
  salary_range: string | null;
  company_name: string | null;
  industry: string | null;
  normalization_confidence: number;
  keywords: string[];
  cleaned_text: string;
  source_payload: Record<string, unknown>;
};

type PortraitDimension = {
  level: number;
  weight: number;
  description: string;
};

type AgentPortraitDraft = {
  job_name: string;
  category: string;
  skills: PortraitDimension;
  certification: PortraitDimension;
  innovation: PortraitDimension;
  learning: PortraitDimension;
  stress: PortraitDimension;
  communication: PortraitDimension;
  experience: PortraitDimension;
};

type AgentPortraitResult = {
  portraits: AgentPortraitDraft[];
  model: string | null;
  traceId: string;
};

function sanitizePlainText(input: string | null | undefined): string {
  if (!input) {
    return "";
  }

  return input
    .replaceAll(/\u0000/g, "")
    .replaceAll(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function tokenizeKeywords(input: string): string[] {
  if (!input) {
    return [];
  }
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fa5+#]+/g)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2),
    ),
  ).slice(0, 24);
}

function buildPipelineCleanedJob(
  taskId: number,
  job: {
    id: number;
    source_row_id: string | null;
    title: string;
    job_description: string | null;
    company_intro: string | null;
    normalized_title_hint: string | null;
    normalized_job_family_hint: string | null;
    normalization_confidence_hint: number | null;
    location: string | null;
    salary_range: string | null;
    company_name: string | null;
    industry: string | null;
    raw_payload: Record<string, unknown>;
  },
): PipelineCleanedJob {
  const normalizedTitle = sanitizePlainText(job.normalized_title_hint || job.title || "未知岗位");
  const jobFamily = sanitizePlainText(job.normalized_job_family_hint || "other") || "other";
  const mergedText = sanitizePlainText(
    [job.title, job.job_description, job.company_intro].filter(Boolean).join("\n"),
  );

  return {
    task_id: taskId,
    job_id: job.id,
    source_row_id: job.source_row_id,
    title: sanitizePlainText(job.title),
    normalized_title: normalizedTitle,
    job_family: jobFamily,
    location: sanitizePlainText(job.location),
    salary_range: sanitizePlainText(job.salary_range),
    company_name: sanitizePlainText(job.company_name),
    industry: sanitizePlainText(job.industry),
    normalization_confidence: Number((job.normalization_confidence_hint ?? 0).toFixed(4)),
    keywords: tokenizeKeywords(mergedText),
    cleaned_text: mergedText,
    source_payload: job.raw_payload ?? {},
  };
}

function buildPortraitSeedSummary(cleanedJobs: PipelineCleanedJob[]): string {
  const familyCounter = new Map<string, number>();
  const titleCounter = new Map<string, number>();
  const keywordCounter = new Map<string, number>();

  for (const item of cleanedJobs) {
    familyCounter.set(item.job_family, (familyCounter.get(item.job_family) ?? 0) + 1);
    titleCounter.set(item.normalized_title, (titleCounter.get(item.normalized_title) ?? 0) + 1);
    for (const keyword of item.keywords) {
      keywordCounter.set(keyword, (keywordCounter.get(keyword) ?? 0) + 1);
    }
  }

  const topFamilies = Array.from(familyCounter.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const topTitles = Array.from(titleCounter.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 50)
    .map(([name, count]) => ({ name, count }));

  const topKeywords = Array.from(keywordCounter.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 100)
    .map(([name, count]) => ({ name, count }));

  return JSON.stringify(
    {
      cleaned_total: cleanedJobs.length,
      top_families: topFamilies,
      top_titles: topTitles,
      top_keywords: topKeywords,
    },
    null,
    2,
  );
}

function clampPortraitLevel(level: number): number {
  return Math.max(1, Math.min(5, Math.round(level)));
}

function clampPortraitWeight(weight: number): number {
  return Math.max(0, Math.min(1, Number(weight.toFixed(2))));
}

function toPortraitDimension(input: unknown): PortraitDimension {
  const source = (
    input && typeof input === "object" ? (input as Partial<PortraitDimension>) : {}
  ) as Partial<PortraitDimension>;

  return {
    level: Number.isFinite(source.level) ? Number(source.level) : 3,
    weight: Number.isFinite(source.weight) ? Number(source.weight) : 0.14,
    description: typeof source.description === "string" ? source.description : "待补充",
  };
}

function normalizePortraitDraft(item: AgentPortraitDraft): AgentPortraitDraft {
  const normalizeDimension = (dimension: PortraitDimension): PortraitDimension => {
    return {
      level: clampPortraitLevel(dimension.level),
      weight: clampPortraitWeight(dimension.weight),
      description: sanitizePlainText(dimension.description),
    };
  };

  return {
    job_name: sanitizePlainText(item.job_name),
    category: sanitizePlainText(item.category || "other") || "other",
    skills: normalizeDimension(item.skills),
    certification: normalizeDimension(item.certification),
    innovation: normalizeDimension(item.innovation),
    learning: normalizeDimension(item.learning),
    stress: normalizeDimension(item.stress),
    communication: normalizeDimension(item.communication),
    experience: normalizeDimension(item.experience),
  };
}

function extractJsonArrayFromText(rawText: string): string | null {
  const fenced = rawText.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = rawText.indexOf("[");
  const end = rawText.lastIndexOf("]");
  if (start < 0 || end <= start) {
    return null;
  }
  return rawText.slice(start, end + 1).trim();
}

function parsePortraitsFromAgentText(rawText: string): AgentPortraitDraft[] {
  const jsonArray = extractJsonArrayFromText(rawText);
  if (!jsonArray) {
    throw new Error("AGENT_PORTRAIT_JSON_NOT_FOUND");
  }

  const parsed = JSON.parse(jsonArray) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("AGENT_PORTRAIT_JSON_INVALID");
  }

  const portraits: AgentPortraitDraft[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const portrait = item as Partial<AgentPortraitDraft>;
    if (!portrait.job_name || !portrait.skills || !portrait.certification) {
      continue;
    }

    portraits.push(
      normalizePortraitDraft({
        job_name: String(portrait.job_name),
        category: String(portrait.category ?? "other"),
        skills: toPortraitDimension(portrait.skills),
        certification: toPortraitDimension(portrait.certification),
        innovation: toPortraitDimension(portrait.innovation),
        learning: toPortraitDimension(portrait.learning),
        stress: toPortraitDimension(portrait.stress),
        communication: toPortraitDimension(portrait.communication),
        experience: toPortraitDimension(portrait.experience),
      }),
    );
  }

  const dedup = new Map<string, AgentPortraitDraft>();
  for (const item of portraits) {
    if (!item.job_name) {
      continue;
    }
    dedup.set(item.job_name, item);
  }

  return Array.from(dedup.values());
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`AGENT_TIMEOUT:${timeoutMs}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 作用：基于“全量清洗后岗位统计摘要”调用 Pi Agent，直接产出 10 条岗位画像。
 * 注意：为避免 1W 明细超长输入，这里把全量样本压缩为统计摘要后再交给 Agent 推理。
 */
async function generateJobPortraitsByAgent(params: {
  cleanedJobs: PipelineCleanedJob[];
  env: AppEnv;
  cwd: string;
}): Promise<AgentPortraitResult> {
  const traceId = randomUUID();
  const piAgentDir = params.env.AGENT_PI_DIR || resolveDefaultPiAgentDir();
  const sessionStoreDir = params.env.AGENT_SESSION_STORE_DIR;
  const taskSessionDir = `${sessionStoreDir}/jobs-portraits-runtime/${traceId}`;

  ensureDirectory(piAgentDir);
  ensureCompatibleAgentBootstrap(piAgentDir);
  ensureDirectory(taskSessionDir);

  const authStorage = AuthStorage.create(`${piAgentDir}/auth.json`);
  const modelRegistry = ModelRegistry.create(authStorage, `${piAgentDir}/models.json`);
  const modelRef = parseModelRef(params.env.AGENT_MODEL);
  if (!modelRef) {
    throw new Error("AGENT_MODEL_REQUIRED");
  }

  const selectedModel = modelRegistry.find(modelRef.provider, modelRef.modelId);
  if (!selectedModel) {
    throw new Error(`AGENT_MODEL_NOT_FOUND:${modelRef.provider}/${modelRef.modelId}`);
  }

  const resourceLoader = new DefaultResourceLoader({
    cwd: params.cwd,
    agentDir: piAgentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    systemPromptOverride: () =>
      [
        "你是岗位画像建模专家。",
        "你必须根据输入的岗位统计数据，输出 10 条岗位画像 JSON 数组，不要输出任何额外文本。",
        "JSON 数组每个元素必须包含字段：job_name, category, skills, certification, innovation, learning, stress, communication, experience。",
        "每个维度对象都必须包含 level(1-5), weight(0-1), description(中文)。",
        "7个维度权重总和必须接近 1，建议精确到 2 位小数。",
      ].join("\n"),
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
        lastTurnError = String(assistantMessage.errorMessage || "岗位画像 Agent 执行失败");
      }
    }
  });

  try {
    const summary = buildPortraitSeedSummary(params.cleanedJobs);
    const prompt = [
      `请你基于以下“1W岗位清洗后的全量统计摘要”生成 ${JOB_PORTRAIT_TARGET_COUNT} 条岗位画像。`,
      "输出要求：只返回 JSON 数组，禁止 Markdown 包裹，禁止解释。",
      "category 建议值：software/data/implementation/research/product/operation/design/marketing/other。",
      "统计摘要如下：",
      summary,
    ].join("\n\n");

    await withTimeout(session.prompt(prompt), JOB_PORTRAIT_AGENT_TIMEOUT_MS);
    if (lastTurnError) {
      throw new Error(lastTurnError);
    }

    const rawText = assistantMessages.at(-1)?.trim() || streamingAssistantBuffer.trim();
    const portraits = parsePortraitsFromAgentText(rawText);
    if (portraits.length < JOB_PORTRAIT_TARGET_COUNT) {
      throw new Error(`AGENT_PORTRAIT_COUNT_NOT_ENOUGH:${portraits.length}`);
    }

    return {
      portraits: portraits.slice(0, JOB_PORTRAIT_TARGET_COUNT),
      model: session.model ? `${session.model.provider}/${session.model.id}` : null,
      traceId,
    };
  } finally {
    unsubscribe();
    session.dispose();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("429") ||
    normalized.includes("too many requests") ||
    normalized.includes("rate limit") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("econnreset") ||
    normalized.includes("etimedout") ||
    normalized.includes("eai_again") ||
    normalized.includes("502") ||
    normalized.includes("503") ||
    normalized.includes("504")
  );
}

function computeBackoffDelay(params: { attempt: number; baseMs: number; maxMs: number }): number {
  const exp = params.baseMs * 2 ** Math.max(0, params.attempt - 1);
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(params.maxMs, exp + jitter);
}

function scaledMinimum(total: number, ratio: number, floor: number): number {
  return Math.max(floor, Math.ceil(total * ratio));
}

type CareerPathQueryOptions = {
  depth: number;
  relation_type: "promotion" | "transition" | "skill_migration" | "all";
  min_score: number;
};

type CareerPathGenerateOptions = {
  force_rebuild?: boolean;
  max_candidates_per_node?: number;
  /** 是否使用 Agent 推理生成图谱关系，默认 false 走规则引擎 */
  use_agent?: boolean;
};

function isAuthenticationFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("401 invalid authentication") ||
    (normalized.includes("401") && normalized.includes("authentication")) ||
    normalized.includes("invalid api key") ||
    normalized.includes("unauthorized")
  );
}

function uniqueSkills(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

type CanonicalEligibilityDiagnostics = {
  totalLatestFacts: number;
  eligibleFacts: number;
  rejectedLowConfidence: number;
  rejectedMissingEvidence: number;
  rejectedBoth: number;
};

type CanonicalGroupingDiagnostics = {
  groupCount: number;
  singleSampleGroupCount: number;
  maxGroupSize: number;
  p50GroupSize: number;
  p90GroupSize: number;
  topGroups: Array<{ roleKey: string; sampleSize: number }>;
};

/**
 * 作用：统计 canonical 聚合前的事实漏斗，便于快速定位“为什么画像数量偏少”。
 * 注意：低置信度与无证据是两类可叠加原因，分别统计并额外给出交集数量。
 */
function analyzeCanonicalEligibility(
  factsList: PostingProfileFacts[],
): CanonicalEligibilityDiagnostics {
  let eligibleFacts = 0;
  let rejectedLowConfidence = 0;
  let rejectedMissingEvidence = 0;
  let rejectedBoth = 0;

  for (const item of factsList) {
    const lowConfidence = item.confidence < CANONICAL_MIN_CONFIDENCE;
    const missingEvidence = item.evidence.length === 0;

    if (isPostingFactEligibleForCanonical(item)) {
      eligibleFacts += 1;
      continue;
    }

    if (lowConfidence) {
      rejectedLowConfidence += 1;
    }
    if (missingEvidence) {
      rejectedMissingEvidence += 1;
    }
    if (lowConfidence && missingEvidence) {
      rejectedBoth += 1;
    }
  }

  return {
    totalLatestFacts: factsList.length,
    eligibleFacts,
    rejectedLowConfidence,
    rejectedMissingEvidence,
    rejectedBoth,
  };
}

function pickPercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const normalized = Math.min(1, Math.max(0, percentile));
  const index = Math.max(0, Math.ceil(sortedValues.length * normalized) - 1);
  return sortedValues[index] ?? 0;
}

/**
 * 作用：统计 canonical 分组结果分布，用于判断是否被过度归并到少数 role_key。
 */
function analyzeCanonicalGrouping(
  groupedFacts: Map<string, PostingProfileFacts[]>,
): CanonicalGroupingDiagnostics {
  const groups = Array.from(groupedFacts.entries()).map(([roleKey, items]) => ({
    roleKey,
    sampleSize: items.length,
  }));
  const sortedBySample = [...groups].sort((left, right) => right.sampleSize - left.sampleSize);
  const sortedSampleSizes = sortedBySample.map((item) => item.sampleSize).sort((a, b) => a - b);

  return {
    groupCount: groups.length,
    singleSampleGroupCount: groups.filter((item) => item.sampleSize === 1).length,
    maxGroupSize: sortedBySample[0]?.sampleSize ?? 0,
    p50GroupSize: pickPercentile(sortedSampleSizes, 0.5),
    p90GroupSize: pickPercentile(sortedSampleSizes, 0.9),
    topGroups: sortedBySample.slice(0, 10),
  };
}

function findTargetNode(nodes: CareerGraphSnapshot["nodes"], jobId: number): CareerPathNode | null {
  const target = nodes.find((node) => node.job_id === jobId);
  if (!target) {
    return null;
  }

  return {
    id: target.id,
    job_id: target.job_id,
    role_key: target.id,
    title: target.title,
    description: target.summary,
    family: target.family,
    level: target.level,
    aliases: [],
    typical_skills: target.skills,
    category: "target",
    is_target: true,
  };
}

function buildRouteRecommendations(params: {
  targetNodeId: string;
  relationType: "promotion" | "transition";
  edges: CareerPathV2GraphResponse["edges"];
}): CareerRouteRecommendation[] {
  const outgoing = params.edges
    .filter(
      (edge) => edge.source === params.targetNodeId && edge.relation_type === params.relationType,
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  return outgoing.map((firstEdge) => {
    const follow = params.edges
      .filter(
        (edge) =>
          edge.source === firstEdge.target &&
          edge.relation_type === params.relationType &&
          edge.target !== params.targetNodeId,
      )
      .sort((left, right) => right.score - left.score)[0];

    const pathEdges = follow ? [firstEdge, follow] : [firstEdge];
    const steps: CareerRouteStep[] = [];

    for (const [index, edge] of pathEdges.entries()) {
      if (index === 0) {
        steps.push({
          node_id: edge.source,
          role_key: edge.source,
          title: edge.source,
          relation_type: null,
          reason: null,
          required_skills: [],
          transition_cost: null,
          gap_skills: [],
        });
      }

      steps.push({
        node_id: edge.target,
        role_key: edge.target,
        title: edge.target,
        relation_type: edge.relation_type,
        reason: edge.reason,
        required_skills: edge.required_skills,
        transition_cost: edge.transition_cost,
        gap_skills: edge.gap_skills,
      });
    }

    const missingSkills = uniqueSkills(pathEdges.flatMap((edge) => edge.gap_skills));
    const score = Math.round(
      pathEdges.reduce((sum, edge) => sum + edge.score, 0) / Math.max(pathEdges.length, 1),
    );

    return {
      route_id: pathEdges.map((edge) => edge.id).join("__"),
      route_type: params.relationType,
      title:
        params.relationType === "promotion"
          ? `晋升路径：${pathEdges.map((edge) => `${edge.source} -> ${edge.target}`).join(" -> ")}`
          : `换岗路径：${pathEdges.map((edge) => `${edge.source} -> ${edge.target}`).join(" -> ")}`,
      summary:
        params.relationType === "promotion"
          ? "同岗位族职级递进路径，强调技能加深与复杂度提升。"
          : "跨岗位族可迁移路径，强调可复用技能与补齐差距技能。",
      suitability_score: score,
      missing_skills: missingSkills,
      steps,
    };
  });
}

function computeGraphQuality(snapshot: CareerGraphSnapshot): {
  coveredJobs: number;
  isolatedNodeRatio: number;
} {
  if (snapshot.nodes.length === 0) {
    return { coveredJobs: 0, isolatedNodeRatio: 1 };
  }

  const nodeIds = new Set(snapshot.nodes.map((item) => item.id));
  const activeNodeIds = new Set<string>();
  for (const edge of snapshot.edges) {
    if (nodeIds.has(edge.source)) {
      activeNodeIds.add(edge.source);
    }
    if (nodeIds.has(edge.target)) {
      activeNodeIds.add(edge.target);
    }
  }

  const isolatedNodeCount = snapshot.nodes.length - activeNodeIds.size;
  return {
    coveredJobs: activeNodeIds.size,
    isolatedNodeRatio: Number((isolatedNodeCount / snapshot.nodes.length).toFixed(2)),
  };
}

function normalizeCareerPathQuery(
  optionsOrDepth: CareerPathQueryOptions | number,
): CareerPathQueryOptions {
  if (typeof optionsOrDepth === "number") {
    return {
      depth: optionsOrDepth,
      relation_type: "all",
      min_score: 0,
    };
  }
  return optionsOrDepth;
}

export interface JobsIntelligenceService {
  runPipeline(input: { mode: JobPipelineMode }): Promise<JobPipelineTaskRecord>;
  runPipelineNow(input: { mode: JobPipelineMode }): Promise<JobPipelineTaskRecord>;
  retryPipelineTask(taskId: number): Promise<JobPipelineTaskRecord>;
  getPipelineTask(taskId: number): Promise<JobPipelineTaskRecord>;
  listPipelineFailures(
    taskId: number,
    params: { offset: number; limit: number },
  ): Promise<JobPipelineFailureListResponse>;
  listPipelineRetryQueue(params: {
    task_id?: number;
    status?: "pending" | "processing" | "done" | "failed";
    offset: number;
    limit: number;
  }): Promise<JobPipelineRetryQueueListResponse>;
  processPipelineRetryQueue(input: { limit: number }): Promise<JobPipelineRetryProcessResult>;
  listJobFacts(params: JobFactsListParams): Promise<JobFactsListResponse>;
  getJobFact(jobId: number): Promise<JobFactRecord>;
  listCanonicalRoles(params: CanonicalRolesListParams): Promise<CanonicalRolesListResponse>;
  getCanonicalRole(roleKey: string): Promise<CanonicalRoleRecord>;
  listManualJobPortraits(): Promise<ManualJobPortraitRecord[]>;
  generateCareerPathGraph(
    options: CareerPathGenerateOptions,
  ): Promise<CareerPathV2GenerateResponse>;
  getCareerPathGraph(
    jobId: number,
    options: CareerPathQueryOptions | number,
  ): Promise<CareerPathV2GraphResponse>;
}

export function createJobsIntelligenceService(
  repository: JobsIntelligenceRepository,
  graphRepository: JobsIntelligenceGraphRepository,
  env: AppEnv,
): JobsIntelligenceService {
  const runningTaskIds = new Set<number>();

  async function runPipelineTask(
    taskId: number,
    mode: JobPipelineMode,
  ): Promise<JobPipelineTaskRecord> {
    if (runningTaskIds.has(taskId)) {
      const existing = await repository.getPipelineTask(taskId);
      if (!existing) {
        throw new HttpError(404, "PIPELINE_TASK_NOT_FOUND", "流水线任务不存在");
      }
      return existing;
    }
    runningTaskIds.add(taskId);

    try {
      const jobs = await repository.listPipelineJobs(mode);
      console.info(
        `[jobs:pipeline] start task_id=${taskId} mode=${mode} total_jobs=${jobs.length} agent_model=${env.AGENT_MODEL || "unset"}`,
      );
      await repository.updatePipelineTask(taskId, {
        status: "running",
        started_at: new Date().toISOString(),
        total_jobs: jobs.length,
        message: `开始清洗 ${jobs.length} 条岗位数据`,
      });

      const cleanedJobs = jobs.map((job) => buildPipelineCleanedJob(taskId, job));
      const normalizedHintHits = cleanedJobs.filter(
        (item) => item.normalization_confidence > 0 && item.job_family !== "other",
      ).length;

      if (typeof repository.replacePipelineCleanedJobs === "function") {
        await repository.replacePipelineCleanedJobs(taskId, cleanedJobs);
      }
      await repository.updatePipelineTask(taskId, {
        processed_jobs: cleanedJobs.length,
        success_profiles: 0,
        failed_profiles: 0,
        message: `清洗完成 ${cleanedJobs.length}/${jobs.length}，准备调用 Pi Agent 生成 ${JOB_PORTRAIT_TARGET_COUNT} 条岗位画像`,
      });

      console.info(
        `[jobs:pipeline] cleaned task_id=${taskId} cleaned=${cleanedJobs.length} normalized_hint=${normalizedHintHits}`,
      );

      const agentResult = await generateJobPortraitsByAgent({
        cleanedJobs,
        env,
        cwd: process.cwd(),
      });

      if (typeof repository.replaceAgentJobPortraits === "function") {
        await repository.replaceAgentJobPortraits(taskId, agentResult.portraits, {
          source_model: agentResult.model,
          source_trace_id: agentResult.traceId,
        });
      }

      if (typeof repository.replaceManualJobPortraits === "function") {
        await repository.replaceManualJobPortraits(agentResult.portraits);
      }

      const message = `流水线完成（cleanse->agent-portraits）：cleaned=${cleanedJobs.length}，portraits=${agentResult.portraits.length}，model=${agentResult.model || "unknown"}，trace_id=${agentResult.traceId}`;
      console.info(`[jobs:pipeline] finish task_id=${taskId} ${message}`);

      return repository.updatePipelineTask(taskId, {
        status: "success",
        processed_jobs: cleanedJobs.length,
        success_profiles: agentResult.portraits.length,
        failed_profiles: 0,
        graph_nodes: 0,
        graph_edges: 0,
        graph_covered_jobs: 0,
        graph_isolated_ratio: 0,
        family_count: agentResult.portraits.length,
        message,
        error_message: null,
        finished_at: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "流水线执行失败";
      return repository.updatePipelineTask(taskId, {
        status: "failed",
        message: "流水线失败（cleanse->agent-portraits）",
        error_message: message,
        finished_at: new Date().toISOString(),
      });
    } finally {
      runningTaskIds.delete(taskId);
    }
  }

  async function runPipeline(input: { mode: JobPipelineMode }): Promise<JobPipelineTaskRecord> {
    const task = await repository.createPipelineTask(input.mode);
    void runPipelineTask(task.id, input.mode);
    return task;
  }

  async function runPipelineNow(input: { mode: JobPipelineMode }): Promise<JobPipelineTaskRecord> {
    const task = await repository.createPipelineTask(input.mode);
    return runPipelineTask(task.id, input.mode);
  }

  /**
   * 作用：基于历史任务模式发起一次受控重跑。
   * 参数：taskId 为历史流水线任务 ID。
   * 返回：新的流水线任务记录（重跑任务）。
   * 注意：重跑不会复用旧任务 ID，避免覆盖历史审计信息。
   */
  async function retryPipelineTask(taskId: number): Promise<JobPipelineTaskRecord> {
    const existing = await repository.getPipelineTask(taskId);
    if (!existing) {
      throw new HttpError(404, "PIPELINE_TASK_NOT_FOUND", "流水线任务不存在");
    }

    const retryTask = await runPipelineNow({ mode: existing.mode });
    await repository.updatePipelineTask(retryTask.id, {
      message: `重跑来源任务：${taskId}`,
    });
    const latest = await repository.getPipelineTask(retryTask.id);
    return latest ?? retryTask;
  }

  async function getPipelineTask(taskId: number): Promise<JobPipelineTaskRecord> {
    const task = await repository.getPipelineTask(taskId);
    if (!task) {
      throw new HttpError(404, "PIPELINE_TASK_NOT_FOUND", "流水线任务不存在");
    }
    return task;
  }

  async function listPipelineFailures(
    taskId: number,
    params: { offset: number; limit: number },
  ): Promise<JobPipelineFailureListResponse> {
    if (typeof repository.listPipelineFailures !== "function") {
      return { total: 0, items: [] };
    }
    return repository.listPipelineFailures(taskId, params);
  }

  async function listPipelineRetryQueue(params: {
    task_id?: number;
    status?: "pending" | "processing" | "done" | "failed";
    offset: number;
    limit: number;
  }): Promise<JobPipelineRetryQueueListResponse> {
    if (typeof repository.listPipelineRetryQueue !== "function") {
      return {
        total: 0,
        items: [],
        summary: { pending: 0, processing: 0, done: 0, failed: 0, latest_errors: [] },
      };
    }
    return repository.listPipelineRetryQueue(params);
  }

  /**
   * 作用：消费重试队列，将可重试任务从 pending 领取到 processing 并执行一次重放。
   * 参数：limit 为本次最多处理数量。
   * 返回：本次领取、成功、失败、重新排队数量统计。
   */
  async function processPipelineRetryQueue(input: {
    limit: number;
  }): Promise<JobPipelineRetryProcessResult> {
    if (
      typeof repository.claimPipelineRetryQueue !== "function" ||
      typeof repository.updatePipelineRetryQueueStatus !== "function"
    ) {
      return { claimed: 0, done: 0, failed: 0, rescheduled: 0 };
    }

    const maxAttempts = Math.max(1, env.JOBS_PIPELINE_RETRY_MAX_ATTEMPTS ?? 3);
    const retryBaseMs = Math.max(100, env.JOBS_PIPELINE_RETRY_BASE_MS ?? 500);
    const retryMaxMs = Math.max(retryBaseMs, env.JOBS_PIPELINE_RETRY_MAX_MS ?? 8000);

    const claimedItems = await repository.claimPipelineRetryQueue(input.limit);
    let done = 0;
    let failed = 0;
    let rescheduled = 0;

    for (const item of claimedItems) {
      const job =
        typeof repository.getPipelineJobById === "function"
          ? await repository.getPipelineJobById(item.job_id)
          : null;

      if (!job) {
        await repository.updatePipelineRetryQueueStatus({
          id: item.id,
          status: "failed",
          last_error: `JOB_NOT_FOUND:${item.job_id}`,
        });
        failed += 1;
        continue;
      }

      const normalizationHint = {
        normalized_title_hint: job.normalized_title_hint,
        normalized_job_family_hint: job.normalized_job_family_hint,
        normalization_confidence_hint: job.normalization_confidence_hint,
      };

      try {
        const postingFacts = extractPostingProfileFacts(job, normalizationHint);
        await repository.createJobFacts(postingFacts);
        await repository.updatePipelineRetryQueueStatus({
          id: item.id,
          status: "done",
          last_error: null,
        });
        done += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const retryable = isRetryableFailure(reason) && !isAuthenticationFailure(reason);
        const nextAttempts = item.attempts + 1;

        if (retryable && nextAttempts <= maxAttempts) {
          const delay = computeBackoffDelay({
            attempt: nextAttempts,
            baseMs: retryBaseMs,
            maxMs: retryMaxMs,
          });
          await repository.updatePipelineRetryQueueStatus({
            id: item.id,
            status: "pending",
            attempts: nextAttempts,
            next_run_at: new Date(Date.now() + delay).toISOString(),
            last_error: reason.slice(0, 500),
          });
          rescheduled += 1;
          continue;
        }

        await repository.updatePipelineRetryQueueStatus({
          id: item.id,
          status: "failed",
          attempts: nextAttempts,
          last_error: reason.slice(0, 500),
        });
        failed += 1;
      }
    }

    return {
      claimed: claimedItems.length,
      done,
      failed,
      rescheduled,
    };
  }

  async function listJobFacts(params: JobFactsListParams): Promise<JobFactsListResponse> {
    return repository.listJobFacts(params);
  }

  async function getJobFact(jobId: number): Promise<JobFactRecord> {
    const fact = await repository.getLatestJobFactByJobId(jobId);
    if (!fact) {
      throw new HttpError(404, "JOB_FACT_NOT_FOUND", "目标岗位事实不存在");
    }
    return fact;
  }

  async function listCanonicalRoles(
    params: CanonicalRolesListParams,
  ): Promise<CanonicalRolesListResponse> {
    return repository.listCanonicalRoles(params);
  }

  async function getCanonicalRole(roleKey: string): Promise<CanonicalRoleRecord> {
    const role = await repository.getCanonicalRoleByKey(roleKey);
    if (!role) {
      throw new HttpError(404, "CANONICAL_ROLE_NOT_FOUND", "目标标准岗位不存在");
    }
    return role;
  }

  async function listManualJobPortraits(): Promise<ManualJobPortraitRecord[]> {
    if (typeof repository.listManualJobPortraits !== "function") {
      throw new HttpError(
        501,
        "MANUAL_JOB_PORTRAITS_UNSUPPORTED",
        "当前仓储未实现人工岗位画像查询",
      );
    }
    return repository.listManualJobPortraits();
  }

  /**
   * 作用：基于 v2_manual_job_portraits 重新生成职业图谱并写入图数据库。
   * 参数：
   *   - use_agent: 是否使用 Agent 推理生成图谱关系（含智能 reason），默认 false 走规则引擎。
   *   - max_candidates_per_node: 控制规则引擎的候选召回规模。
   * 返回：图谱写入统计与覆盖率指标，供前端提示和运维审计。
   * 注意：
   *   - 强制读取 v2_manual_job_portraits，确保图谱来源稳定可追溯。
   *   - Agent 模式下如果失败，会自动降级到规则引擎并在日志中记录警告。
   */
  async function generateCareerPathGraph(
    options: CareerPathGenerateOptions,
  ): Promise<CareerPathV2GenerateResponse> {
    if (typeof repository.listManualJobPortraitsFromTable !== "function") {
      throw new HttpError(
        501,
        "MANUAL_PORTRAIT_TABLE_UNSUPPORTED",
        "当前仓储未实现 v2_manual_job_portraits 读取能力",
      );
    }

    const portraits = await repository.listManualJobPortraitsFromTable();
    if (portraits.length === 0) {
      throw new HttpError(
        404,
        "MANUAL_PORTRAITS_EMPTY",
        "v2_manual_job_portraits 暂无可用岗位画像",
      );
    }

    // ── Agent 模式：调用 Pi Agent 生成智能图谱 ──
    if (options.use_agent) {
      try {
        const agentResult = await generateCareerGraphByAgent({
          portraits,
          env,
          cwd: process.cwd(),
        });

        const syncResult = await graphRepository.syncGraph(agentResult.snapshot);

        console.info(
          `[career-graph] agent mode finished: nodes=${syncResult.nodes_upserted} edges=${syncResult.edges_upserted} model=${agentResult.model} trace_id=${agentResult.traceId}`,
        );

        return {
          graph_version: agentResult.snapshot.graph_version,
          generated_at: agentResult.snapshot.generated_at,
          generation_mode: "agent",
          nodes_written: syncResult.nodes_upserted,
          edges_written: syncResult.edges_upserted,
          candidate_pairs: agentResult.stats.candidate_pairs,
          validated_pairs: agentResult.stats.validated_pairs,
          promotion_edges: agentResult.stats.promotion_edges,
          transition_edges: agentResult.stats.transition_edges,
          skill_migration_edges: agentResult.stats.skill_migration_edges,
          transition_path_coverage: {
            jobs_with_paths: agentResult.stats.transition_jobs_with_paths,
            min_paths_required: 2,
            target_job_count: 5,
          },
        };
      } catch (agentError) {
        // Agent 失败时自动降级到规则引擎
        const reason = agentError instanceof Error ? agentError.message : String(agentError);
        console.warn(`[career-graph] agent mode failed, falling back to rule engine: ${reason}`);
      }
    }

    // ── 规则模式：使用内置规则引擎生成图谱 ──
    const pipelineJobs = await repository.listPipelineJobs("cleanse_agent_portraits");
    const jobIdByTitle = new Map<string, number>();
    for (const job of pipelineJobs) {
      const key = job.title.trim().toLowerCase();
      if (!jobIdByTitle.has(key)) {
        jobIdByTitle.set(key, job.id);
      }
    }

    const buildResult = buildCareerGraphFromManualPortraits({
      portraits,
      jobIdByTitle,
      options: {
        maxCandidatesPerNode: Math.max(5, Math.min(80, options.max_candidates_per_node ?? 24)),
        minTransitionPathsPerJob: 2,
        targetTransitionJobCount: 5,
      },
    });

    const syncResult = await graphRepository.syncGraph(buildResult.snapshot);

    return {
      graph_version: buildResult.snapshot.graph_version,
      generated_at: buildResult.snapshot.generated_at,
      generation_mode: "rule",
      nodes_written: syncResult.nodes_upserted,
      edges_written: syncResult.edges_upserted,
      candidate_pairs: buildResult.stats.candidate_pairs,
      validated_pairs: buildResult.stats.validated_pairs,
      promotion_edges: buildResult.stats.promotion_edges,
      transition_edges: buildResult.stats.transition_edges,
      skill_migration_edges: buildResult.stats.skill_migration_edges,
      transition_path_coverage: {
        jobs_with_paths: buildResult.stats.transition_jobs_with_paths,
        min_paths_required: 2,
        target_job_count: 5,
      },
    };
  }

  async function getCareerPathGraph(
    jobId: number,
    optionsOrDepth: CareerPathQueryOptions | number,
  ): Promise<CareerPathV2GraphResponse> {
    const query = normalizeCareerPathQuery(optionsOrDepth);
    const depth = query.depth;
    const snapshot = await graphRepository.getSubgraphByJobId(jobId, depth);
    if (snapshot.nodes.length === 0) {
      throw new HttpError(404, "CAREER_PATH_NOT_FOUND", "目标岗位尚未生成图谱数据");
    }

    const targetNode = findTargetNode(snapshot.nodes, jobId);
    if (!targetNode) {
      throw new HttpError(404, "CAREER_PATH_NOT_FOUND", "目标岗位不在当前图谱节点中");
    }

    const edges: CareerPathV2GraphResponse["edges"] = snapshot.edges
      .filter((edge) => {
        if (query.relation_type !== "all" && edge.relation_type !== query.relation_type) {
          return false;
        }
        return edge.score >= query.min_score;
      })
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relation_type: edge.relation_type,
        reason: edge.reason,
        required_skills: edge.required_skills,
        gap_skills: edge.gap_skills,
        transition_cost: edge.transition_cost,
        direction_label: edge.direction_label,
        score: edge.score,
      }));

    const promotionRoutes = buildRouteRecommendations({
      targetNodeId: targetNode.id,
      relationType: "promotion",
      edges,
    });
    const transitionRoutes = buildRouteRecommendations({
      targetNodeId: targetNode.id,
      relationType: "transition",
      edges,
    });

    const promotedNodeIds = new Set(
      promotionRoutes.flatMap((route) => route.steps.map((step) => step.node_id)),
    );
    const transitionNodeIds = new Set(
      transitionRoutes.flatMap((route) => route.steps.map((step) => step.node_id)),
    );

    const nodes: CareerPathV2GraphResponse["nodes"] = snapshot.nodes.map((node) => ({
      id: node.id,
      job_id: node.job_id,
      role_key: node.id,
      title: node.title,
      description: node.summary,
      family: node.family,
      level: node.level,
      aliases: [],
      typical_skills: node.skills,
      category:
        node.id === targetNode.id
          ? "target"
          : promotedNodeIds.has(node.id)
            ? "promotion"
            : transitionNodeIds.has(node.id)
              ? "transition"
              : "transition",
      is_target: node.id === targetNode.id,
    }));

    const targetJob = (await repository.listJobsByIds([jobId]))[0];
    const promotionEdgeCount = edges.filter((item) => item.relation_type === "promotion").length;
    const transitionEdgeCount = edges.filter((item) => item.relation_type === "transition").length;
    const graphQuality = computeGraphQuality({ ...snapshot, edges });
    return {
      job_id: jobId,
      job_title: targetJob?.title || targetNode.title,
      depth,
      target_node_id: targetNode.id,
      graph_version: snapshot.graph_version,
      graph_generated_at: snapshot.generated_at,
      graph_stats: {
        node_count: snapshot.nodes.length,
        edge_count: edges.length,
        promotion_edge_count: promotionEdgeCount,
        transition_edge_count: transitionEdgeCount,
        isolated_node_count: Math.max(0, snapshot.nodes.length - graphQuality.coveredJobs),
        isolated_node_ratio: graphQuality.isolatedNodeRatio,
      },
      nodes,
      edges,
      promotion_routes: promotionRoutes,
      transition_routes: transitionRoutes,
    };
  }

  return {
    runPipeline,
    runPipelineNow,
    retryPipelineTask,
    getPipelineTask,
    listPipelineFailures,
    listPipelineRetryQueue,
    processPipelineRetryQueue,
    listJobFacts,
    getJobFact,
    listCanonicalRoles,
    getCanonicalRole,
    listManualJobPortraits,
    generateCareerPathGraph,
    getCareerPathGraph,
  };
}
