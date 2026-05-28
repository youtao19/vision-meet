/**
 * 文件作用：承载岗位智能处理域核心业务逻辑（画像查询、图谱查询）。
 * 设计边界：service 负责业务编排和容错，具体读写由 repository adapter 完成。
 */

import type {
  CareerGraphSnapshot,
  CareerPathTargetOptionsResponse,
  CanonicalRoleRecord,
  CanonicalRolesListParams,
  CanonicalRolesListResponse,
  CareerPathNode,
  CareerPathV2GenerateResponse,
  CareerPathV2GraphResponse,
  CareerRouteRecommendation,
  CareerRouteStep,
  JobFactsListParams,
  JobFactsListResponse,
  JobFactRecord,
  ManualJobPortraitRecord,
  PostingProfileFacts,
} from "@career/contracts/types";

import type { AppEnv } from "../../shared/config/env.js";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  CANONICAL_MIN_CONFIDENCE,
  isPostingFactEligibleForCanonical,
} from "./jobs-intelligence.profile.js";
import { buildCareerGraphFromManualPortraits } from "./jobs-intelligence.graph.manual.js";
import { generateCareerGraphByAgent } from "./jobs-intelligence.graph.agent.js";
import { MANUAL_JOB_PORTRAITS_SEED } from "./manual-job-portraits.seed.js";
import type { JobsIntelligenceGraphRepository } from "./jobs-intelligence.repository.neo4j.js";
import type { JobsIntelligenceRepository } from "./jobs-intelligence.repository.js";

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
 * 作用：统计 canonical 聚合前的事实漏斗，便于快速定位"为什么画像数量偏少"。
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
  nodes: CareerGraphSnapshot["nodes"];
}): CareerRouteRecommendation[] {
  /**
   * 节点中文名查找：避免把内部 ID（形如 job-1234）当成展示标题往前端塞，
   * 历史代码漏拼这块导致前端只能用正则反向兜底。
   */
  const nodeTitleById = new Map<string, string>();
  for (const node of params.nodes) {
    nodeTitleById.set(node.id, node.title || node.id);
  }
  const titleOf = (nodeId: string): string => nodeTitleById.get(nodeId) ?? nodeId;

  const outgoing = params.edges
    .filter(
      (edge) => edge.source === params.targetNodeId && edge.relation_type === params.relationType,
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  return outgoing.map((firstEdge) => {
    const follow =
      params.relationType === "promotion"
        ? params.edges
            .filter(
              (edge) =>
                edge.source === firstEdge.target &&
                edge.relation_type === params.relationType &&
                edge.target !== params.targetNodeId,
            )
            .sort((left, right) => right.score - left.score)[0]
        : undefined;

    const pathEdges = follow ? [firstEdge, follow] : [firstEdge];
    const steps: CareerRouteStep[] = [];

    for (const [index, edge] of pathEdges.entries()) {
      if (index === 0) {
        steps.push({
          node_id: edge.source,
          role_key: edge.source,
          title: titleOf(edge.source),
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
        title: titleOf(edge.target),
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

    const titleChain = [
      titleOf(pathEdges[0].source),
      ...pathEdges.map((edge) => titleOf(edge.target)),
    ];

    return {
      route_id: pathEdges.map((edge) => edge.id).join("__"),
      route_type: params.relationType,
      title:
        params.relationType === "promotion"
          ? `晋升路径：${titleChain.join(" -> ")}`
          : `换岗路径：${titleChain.join(" -> ")}`,
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

function normalizeCareerPathTargetName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/c\/c\+\+/g, "c++")
    .replace(/[^a-z0-9一-龥+#]+/g, "");
}

export interface JobsIntelligenceService {
  listJobFacts(params: JobFactsListParams): Promise<JobFactsListResponse>;
  getJobFact(jobId: number): Promise<JobFactRecord>;
  listCanonicalRoles(params: CanonicalRolesListParams): Promise<CanonicalRolesListResponse>;
  getCanonicalRole(roleKey: string): Promise<CanonicalRoleRecord>;
  listManualJobPortraits(): Promise<ManualJobPortraitRecord[]>;
  seedManualJobPortraits(): Promise<{ seeded: number }>;
  generateCareerPathGraph(
    options: CareerPathGenerateOptions,
  ): Promise<CareerPathV2GenerateResponse>;
  listCareerPathTargets(): Promise<CareerPathTargetOptionsResponse>;
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
   * 作用：将"用户指定"的岗位画像种子数据直接写入人工画像表。
   * 返回：本次写入条数，便于前端确认入库结果。
   */
  async function seedManualJobPortraits(): Promise<{ seeded: number }> {
    if (typeof repository.replaceManualJobPortraits !== "function") {
      throw new HttpError(
        501,
        "MANUAL_JOB_PORTRAITS_SEED_UNSUPPORTED",
        "当前仓储未实现人工岗位画像写入",
      );
    }
    await repository.replaceManualJobPortraits(MANUAL_JOB_PORTRAITS_SEED);
    return { seeded: MANUAL_JOB_PORTRAITS_SEED.length };
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
    // 从画像数据构建岗位 ID 映射（画像表已通过 SQL 关联 jobs 表解析 job_id）
    const jobIdByTitle = new Map<string, number>();
    for (const p of portraits) {
      if (p.job_id != null) {
        const key = p.job_name.trim().toLowerCase();
        if (!jobIdByTitle.has(key)) {
          jobIdByTitle.set(key, p.job_id);
        }
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
      nodes: snapshot.nodes,
    });
    const transitionRoutes = buildRouteRecommendations({
      targetNodeId: targetNode.id,
      relationType: "transition",
      edges,
      nodes: snapshot.nodes,
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

  /**
   * 作用：返回当前已经写入图数据库的路径图谱目标岗位。
   * 返回值：前端下拉可直接使用的岗位选项列表。
   * 注意：路径图谱由 v2_manual_job_portraits 构建，范围小于 jobs 全量表；
   *       这里刻意不读取 jobs，避免把未构建图谱的计算机岗位暴露为可查询目标。
   */
  async function listCareerPathTargets(): Promise<CareerPathTargetOptionsResponse> {
    if (typeof graphRepository.listGraphTargetNodes !== "function") {
      return { items: [] };
    }

    const nodes = await graphRepository.listGraphTargetNodes();
    const portraits =
      typeof repository.listManualJobPortraitsFromTable === "function"
        ? await repository.listManualJobPortraitsFromTable()
        : [];
    const currentPortraitNames = new Set(
      portraits.map((item) => normalizeCareerPathTargetName(item.job_name)),
    );
    const filteredNodes =
      currentPortraitNames.size > 0
        ? nodes.filter((node) =>
            currentPortraitNames.has(normalizeCareerPathTargetName(node.title)),
          )
        : nodes;

    return {
      items: filteredNodes.map((node) => ({
        job_id: node.job_id,
        job_name: node.title,
        category: node.family,
        graph_version: "current",
      })),
    };
  }

  return {
    listJobFacts,
    getJobFact,
    listCanonicalRoles,
    getCanonicalRole,
    listManualJobPortraits,
    seedManualJobPortraits,
    generateCareerPathGraph,
    listCareerPathTargets,
    getCareerPathGraph,
  };
}
