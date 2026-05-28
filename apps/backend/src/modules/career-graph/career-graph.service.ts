/**
 * 文件作用：职业路径图谱核心业务逻辑（生成、查询、目标岗位列表）。
 * 设计边界：service 负责业务编排和容错，具体读写由 repository 完成。
 */

import type {
  CareerGraphSnapshot,
  CareerPathTargetOptionsResponse,
  CareerPathNode,
  CareerPathV2GenerateResponse,
  CareerPathV2GraphResponse,
  CareerRouteRecommendation,
  CareerRouteStep,
  ManualJobPortraitRecord,
} from "@career/contracts/types";

import type { AppEnv } from "../../shared/config/env.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { buildCareerGraphFromManualPortraits } from "./career-graph.generator.js";
import { generateCareerGraphByAgent } from "./career-graph.agent.js";
import type { CareerGraphRepository } from "./career-graph.repository.neo4j.js";
import type { CareerGraphPgRepository } from "./career-graph.repository.pg.js";

/** 图谱查询参数：展开深度、关系类型筛选、最低分数门槛 */
type CareerPathQueryOptions = {
  depth: number;
  relation_type: "promotion" | "transition" | "skill_migration" | "all";
  min_score: number;
};

/** 图谱生成参数：是否强制重建、每节点候选数上限、是否走 Agent */
type CareerPathGenerateOptions = {
  force_rebuild?: boolean;
  max_candidates_per_node?: number;
  use_agent?: boolean;
};

/**
 * 对技能列表去重并过滤空字符串。
 * 先 trim 再 filter，杜绝空白项混入。
 */
function uniqueSkills(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

/**
 * 在图谱节点列表中查找目标岗位节点，并组装为前端需要的格式。
 * 如果节点不存在返回 null，后续由调用方抛 404。
 */
function findTargetNode(nodes: CareerGraphSnapshot["nodes"], portraitId: number): CareerPathNode | null {
  const target = nodes.find((node) => node.portrait_id === portraitId);
  if (!target) {
    return null;
  }

  return {
    id: target.id,
    portrait_id: target.portrait_id,
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

/**
 * 为指定岗位构建晋升/换岗推荐路线。
 * 找目标节点的出边，按分数排取 top 3；晋升路径还会进一步查二级跳（同方向再跳一步）。
 */
function buildRouteRecommendations(params: {
  targetNodeId: string;
  relationType: "promotion" | "transition";
  edges: CareerPathV2GraphResponse["edges"];
  nodes: CareerGraphSnapshot["nodes"];
}): CareerRouteRecommendation[] {
  // 建立节点 ID → 标题的映射，用于展示路径链
  const nodeTitleById = new Map<string, string>();
  for (const node of params.nodes) {
    nodeTitleById.set(node.id, node.title || node.id);
  }
  const titleOf = (nodeId: string): string => nodeTitleById.get(nodeId) ?? nodeId;

  // 筛选符合条件的出边：源节点匹配 + 类型匹配，按分数降序取 top 3
  const outgoing = params.edges
    .filter(
      (edge) => edge.source === params.targetNodeId && edge.relation_type === params.relationType,
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  // 对每条 top 边构建推荐路线
  return outgoing.map((firstEdge) => {
    // 晋升路径尝试找二级跳：从第一跳的目标继续找同类型的出边，但不能跳回原始节点
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

    // 组装路径边列表：单跳或二级跳
    const pathEdges = follow ? [firstEdge, follow] : [firstEdge];
    const steps: CareerRouteStep[] = [];

    // 遍历路径边，生成步骤列表（每步包含节点信息和关系信息）
    for (const [index, edge] of pathEdges.entries()) {
      // 第一步先加入源节点（只有节点信息，没有关系信息）
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

      // 加入目标节点及边的关系信息
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

    // 汇总整条路径的缺失技能和综合评分（取所有跳数的平均值）
    const missingSkills = uniqueSkills(pathEdges.flatMap((edge) => edge.gap_skills));
    const score = Math.round(
      pathEdges.reduce((sum, edge) => sum + edge.score, 0) / Math.max(pathEdges.length, 1),
    );

    // 构造路径标题链
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

/**
 * 计算图谱质量指标。
 * - coveredJobs: 至少有一条边连接的岗位数
 * - isolatedNodeRatio: 没有任何边连接的节点占比
 */
function computeGraphQuality(snapshot: CareerGraphSnapshot): {
  coveredJobs: number;
  isolatedNodeRatio: number;
} {
  if (snapshot.nodes.length === 0) {
    return { coveredJobs: 0, isolatedNodeRatio: 1 };
  }

  // 收集所有在边中出现的节点 ID（作为 source 或 target）
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

  // 孤立节点 = 总节点 - 有边连接的节点
  const isolatedNodeCount = snapshot.nodes.length - activeNodeIds.size;
  return {
    coveredJobs: activeNodeIds.size,
    isolatedNodeRatio: Number((isolatedNodeCount / snapshot.nodes.length).toFixed(2)),
  };
}

/**
 * 统一查询参数格式。
 * 兼容两种调用方式：直接传数字 depth（老接口），或传完整 CareerPathQueryOptions 对象。
 */
function normalizeCareerPathQuery(
  optionsOrDepth: CareerPathQueryOptions | number,
): CareerPathQueryOptions {
  if (typeof optionsOrDepth === "number") {
    // 传数字时，使用默认值补全其他字段
    return {
      depth: optionsOrDepth,
      relation_type: "all",
      min_score: 0,
    };
  }
  return optionsOrDepth;
}

/**
 * 标准化岗位名称用于模糊匹配。
 * 转小写、规整 c/c++ 特殊写法、去除非必要符号，使来自不同数据源的岗位名能对齐。
 */
function normalizeCareerPathTargetName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/c\/c\+\+/g, "c++")
    .replace(/[^a-z0-9一-龥+#]+/g, "");
}

export interface CareerGraphService {
  generateCareerPathGraph(
    options: CareerPathGenerateOptions,
  ): Promise<CareerPathV2GenerateResponse>;
  listCareerPathTargets(): Promise<CareerPathTargetOptionsResponse>;
  getCareerPathGraph(
    portraitId: number,
    options: CareerPathQueryOptions | number,
  ): Promise<CareerPathV2GraphResponse>;
}

/**
 * 创建图谱业务服务。
 * 依赖两个数据源：PG（岗位画像）、Neo4j（图谱存储），以及应用环境变量（Agent 调用等）。
 */
export function createCareerGraphService(
  pgRepository: CareerGraphPgRepository,
  graphRepository: CareerGraphRepository,
  env: AppEnv,
): CareerGraphService {
  /**
   * 生成职业路径图谱。
   * 优先走 Agent 模式（如果 use_agent=true），失败则降级到规则引擎。
   * 规则引擎基于岗位画像的技能重叠度、岗位族和职级推断关系边。
   */
  async function generateCareerPathGraph(
    options: CareerPathGenerateOptions,
  ): Promise<CareerPathV2GenerateResponse> {
    // 第一步：从 PG 拉取所有人工岗位画像，作为图谱生成的原材料
    const portraits = await pgRepository.listManualJobPortraitsFromTable();
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
        // 调用 Agent，传入精简后的画像数据和环境变量
        const agentResult = await generateCareerGraphByAgent({
          portraits,
          env,
          cwd: process.cwd(),
        });

        // 将 Agent 输出的图谱同步到 Neo4j（幂等写入）
        const syncResult = await graphRepository.syncGraph(agentResult.snapshot);

        console.info(
          `[career-graph] agent mode finished: nodes=${syncResult.nodes_upserted} edges=${syncResult.edges_upserted} model=${agentResult.model} trace_id=${agentResult.traceId}`,
        );

        // 组装 Agent 模式下的生成结果返回
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
        // Agent 模式失败后降级到规则引擎，不阻断整体流程
        const reason = agentError instanceof Error ? agentError.message : String(agentError);
        console.warn(`[career-graph] agent mode failed, falling back to rule engine: ${reason}`);
      }
    }

    // ── 规则模式：使用内置规则引擎生成图谱 ──
    // 建立岗位名称 → 画像表主键的映射，用于规则引擎中的 ID 解析
    const portraitIdByTitle = new Map<string, number>();
    for (const p of portraits) {
      if (p.id != null) {
        const key = p.job_name.trim().toLowerCase();
        // 同名岗位只保留第一个画像表主键，避免冲突
        if (!portraitIdByTitle.has(key)) {
          portraitIdByTitle.set(key, p.id);
        }
      }
    }

    // 调用规则引擎构建图谱（节点 + 关系边 + 候选对评分 + 孤立节点补充）
    const buildResult = buildCareerGraphFromManualPortraits({
      portraits,
      portraitIdByTitle,
      options: {
        maxCandidatesPerNode: Math.max(5, Math.min(80, options.max_candidates_per_node ?? 24)),
        minTransitionPathsPerJob: 2,
        targetTransitionJobCount: 5,
      },
    });

    // 将规则引擎输出的图谱同步到 Neo4j
    const syncResult = await graphRepository.syncGraph(buildResult.snapshot);

    // 组装规则模式下的生成结果返回
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

  /**
   * 查询指定岗位的职业路径图谱。
   * 从 Neo4j 查询子图，然后组装节点/边/推荐路线返回。
   */
  async function getCareerPathGraph(
    portraitId: number,
    optionsOrDepth: CareerPathQueryOptions | number,
  ): Promise<CareerPathV2GraphResponse> {
    // 统一处理查询参数（兼容数字和对象两种传参方式）
    const query = normalizeCareerPathQuery(optionsOrDepth);
    const depth = query.depth;

    // 从 Neo4j 获取以目标岗位为中心的子图
    const snapshot = await graphRepository.getSubgraphByPortraitId(portraitId, depth);
    if (snapshot.nodes.length === 0) {
      throw new HttpError(404, "CAREER_PATH_NOT_FOUND", "目标岗位尚未生成图谱数据");
    }

    // 在子图中定位目标节点
    const targetNode = findTargetNode(snapshot.nodes, portraitId);
    if (!targetNode) {
      throw new HttpError(404, "CAREER_PATH_NOT_FOUND", "目标岗位不在当前图谱节点中");
    }

    // 根据查询条件过滤边（关系类型 + 最低分数）
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

    // 构建晋升路线和换岗路线（各取 top 3）
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

    // 收集所有在推荐路线中出现的节点 ID，用于节点分类
    const promotedNodeIds = new Set(
      promotionRoutes.flatMap((route) => route.steps.map((step) => step.node_id)),
    );
    const transitionNodeIds = new Set(
      transitionRoutes.flatMap((route) => route.steps.map((step) => step.node_id)),
    );

    // 组装节点列表，每个节点标注 category（target/promotion/transition）
    const nodes: CareerPathV2GraphResponse["nodes"] = snapshot.nodes.map((node) => ({
      id: node.id,
      portrait_id: node.portrait_id,
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

    const promotionEdgeCount = edges.filter((item) => item.relation_type === "promotion").length;
    const transitionEdgeCount = edges.filter((item) => item.relation_type === "transition").length;
    const graphQuality = computeGraphQuality({ ...snapshot, edges });

    return {
      portrait_id: portraitId,
      job_title: targetNode.title,
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
   * 列出图谱中所有可查询的目标岗位。
   * 从 Neo4j 读取所有节点，再与 PG 中的画像名称做匹配过滤，
   * 确保只返回当前画像库中存在的岗位。
   */
  async function listCareerPathTargets(): Promise<CareerPathTargetOptionsResponse> {
    // 从 Neo4j 拉取所有图谱节点
    const nodes = await graphRepository.listGraphTargetNodes();
    // 从 PG 拉取当前画像名称列表
    const portraits = await pgRepository.listManualJobPortraitsFromTable();
    // 标准化画像名称用于匹配
    const currentPortraitNames = new Set(
      portraits.map((item) => normalizeCareerPathTargetName(item.job_name)),
    );
    // 过滤：只保留画像库中存在的节点；如果画像库为空则返回全部
    const filteredNodes =
      currentPortraitNames.size > 0
        ? nodes.filter((node) => currentPortraitNames.has(normalizeCareerPathTargetName(node.title)))
        : nodes;

    return {
      items: filteredNodes.map((node) => ({
        portrait_id: node.portrait_id,
        job_name: node.title,
        category: node.family,
        graph_version: "current",
      })),
    };
  }

  return {
    generateCareerPathGraph,
    listCareerPathTargets,
    getCareerPathGraph,
  };
}
