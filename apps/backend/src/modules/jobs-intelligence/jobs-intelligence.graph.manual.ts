/**
 * 文件作用：基于 v2_manual_job_portraits 生成职业路径图谱（节点 + 关系边）。
 * 职责边界：该文件只负责图谱推断，不负责数据库读写与 API 协议转换。
 */

import { createHash } from "node:crypto";

import type {
  CareerGraphEdgeRecord,
  CareerGraphSnapshot,
  ManualJobPortraitRecord,
} from "@career/contracts/types";

type ManualGraphNode = {
  id: string;
  job_id: number;
  title: string;
  family: string;
  level: number;
  skills: string[];
  summary: string;
};

type CandidatePair = {
  source: ManualGraphNode;
  target: ManualGraphNode;
  overlap: string[];
  gapSkills: string[];
  jaccard: number;
};

type AgentJudgement = {
  relation_type: CareerGraphEdgeRecord["relation_type"];
  reason: string;
  score: number;
};

export type ManualCareerGraphBuildOptions = {
  maxCandidatesPerNode: number;
  minTransitionPathsPerJob: number;
  targetTransitionJobCount: number;
};

export type ManualCareerGraphBuildResult = {
  snapshot: CareerGraphSnapshot;
  stats: {
    candidate_pairs: number;
    validated_pairs: number;
    promotion_edges: number;
    transition_edges: number;
    skill_migration_edges: number;
    transition_jobs_with_paths: number;
  };
};

const GRAPH_VERSION = "v2.2-manual";

function normalizeText(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeFamily(input: string): string {
  return normalizeText(input || "other").replace(/\s+/g, "_");
}

function tokenize(input: string): string[] {
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
  );
}

function stableJobIdFromName(jobName: string): number {
  const digest = createHash("sha1").update(jobName).digest("hex").slice(0, 8);
  const parsed = Number.parseInt(digest, 16);
  // 保留在 2e9 以内，避免超出 PostgreSQL integer 或前端处理边界。
  return 1_000_000_000 + (parsed % 900_000_000);
}

function uniqueLimited(items: string[], limit: number): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 2;
  }
  return Math.max(1, Math.min(5, Math.round(value)));
}

function resolvePortraitLevel(item: ManualJobPortraitRecord): number {
  const weighted =
    item.skills.level * 0.32 +
    item.certification.level * 0.08 +
    item.innovation.level * 0.12 +
    item.learning.level * 0.12 +
    item.stress.level * 0.1 +
    item.communication.level * 0.14 +
    item.experience.level * 0.12;

  return clampLevel(weighted);
}

function buildNodeSkills(item: ManualJobPortraitRecord): string[] {
  const tokens = tokenize(
    [
      item.job_name,
      item.category,
      item.skills.description,
      item.certification.description,
      item.innovation.description,
      item.learning.description,
      item.stress.description,
      item.communication.description,
      item.experience.description,
    ].join(" "),
  );

  return uniqueLimited(tokens, 18);
}

function toGraphNode(
  item: ManualJobPortraitRecord,
  jobIdByTitle: Map<string, number>,
): ManualGraphNode {
  const resolvedJobId =
    jobIdByTitle.get(normalizeText(item.job_name)) ?? stableJobIdFromName(item.job_name);

  const summary = [
    `岗位族：${item.category}`,
    `技能要求：${item.skills.description}`,
    `证书要求：${item.certification.description}`,
    `经验要求：${item.experience.description}`,
  ].join("；");

  return {
    id: `job-${resolvedJobId}`,
    job_id: resolvedJobId,
    title: item.job_name,
    family: normalizeFamily(item.category),
    level: resolvePortraitLevel(item),
    skills: buildNodeSkills(item),
    summary,
  };
}

function compareSkills(
  sourceSkills: string[],
  targetSkills: string[],
): {
  overlap: string[];
  jaccard: number;
  gapSkills: string[];
} {
  const sourceSet = new Set(sourceSkills.map((item) => normalizeText(item)));
  const targetSet = new Set(targetSkills.map((item) => normalizeText(item)));
  const overlap = Array.from(sourceSet).filter((skill) => targetSet.has(skill));
  const unionCount = new Set([...sourceSet, ...targetSet]).size;
  const gapSkills = Array.from(targetSet).filter((skill) => !sourceSet.has(skill));

  return {
    overlap,
    jaccard: unionCount > 0 ? overlap.length / unionCount : 0,
    gapSkills,
  };
}

function buildCandidatePairs(nodes: ManualGraphNode[], maxPerNode: number): CandidatePair[] {
  const candidates: CandidatePair[] = [];

  for (const source of nodes) {
    const local: Array<CandidatePair & { recallScore: number }> = [];

    for (const target of nodes) {
      if (source.id === target.id) {
        continue;
      }

      const similarity = compareSkills(source.skills, target.skills);
      const levelDiff = target.level - source.level;
      const sameFamily = source.family === target.family;

      const isPromotionCandidate =
        sameFamily && levelDiff >= 1 && levelDiff <= 2 && similarity.jaccard >= 0.12;
      const isTransitionCandidate =
        !sameFamily && Math.abs(levelDiff) <= 1 && similarity.overlap.length >= 1;
      const isSkillMigrationCandidate = similarity.overlap.length >= 2 && levelDiff <= 1;

      if (!isPromotionCandidate && !isTransitionCandidate && !isSkillMigrationCandidate) {
        continue;
      }

      const recallScore =
        (sameFamily ? 0.24 : 0.14) +
        similarity.jaccard * 0.6 +
        Math.min(0.16, similarity.overlap.length * 0.03) -
        Math.max(0, Math.abs(levelDiff) - 1) * 0.05;

      local.push({
        source,
        target,
        overlap: similarity.overlap,
        gapSkills: similarity.gapSkills,
        jaccard: similarity.jaccard,
        recallScore,
      });
    }

    local.sort((left, right) => right.recallScore - left.recallScore);
    candidates.push(...local.slice(0, maxPerNode));
  }

  return candidates;
}

/**
 * 内置 Agent 判定器（规则版）：根据岗位族、级别与技能重合度判定关系类型。
 * 说明：当前为工程内置判定器，后续可平滑替换为 LLM Agent 评分实现。
 */
function judgeCandidateByBuiltInAgent(candidate: CandidatePair): AgentJudgement[] {
  const judgements: AgentJudgement[] = [];
  const levelDiff = candidate.target.level - candidate.source.level;
  const sameFamily = candidate.source.family === candidate.target.family;

  if (sameFamily && levelDiff >= 1 && levelDiff <= 2 && candidate.jaccard >= 0.2) {
    judgements.push({
      relation_type: "promotion",
      reason: "同岗位族且岗位级别上升，技能重叠满足晋升阈值。",
      score: Math.round(58 + candidate.jaccard * 34 + candidate.overlap.length * 3),
    });
  }

  if (
    !sameFamily &&
    Math.abs(levelDiff) <= 1 &&
    candidate.overlap.length >= 2 &&
    candidate.jaccard >= 0.14
  ) {
    judgements.push({
      relation_type: "transition",
      reason: `跨岗位族存在 ${candidate.overlap.length} 项技能可复用，满足转岗阈值。`,
      score: Math.round(48 + candidate.jaccard * 40 + candidate.overlap.length * 4),
    });
  }

  if (candidate.overlap.length >= 3 && candidate.jaccard >= 0.2 && levelDiff <= 1) {
    judgements.push({
      relation_type: "skill_migration",
      reason: `技能重合度较高（Jaccard=${candidate.jaccard.toFixed(2)}），可作为技能迁移关系。`,
      score: Math.round(46 + candidate.jaccard * 44 + candidate.overlap.length * 3),
    });
  }

  return judgements;
}

function resolveTransitionCost(gapCount: number): "low" | "medium" | "high" {
  if (gapCount <= 2) {
    return "low";
  }
  if (gapCount <= 5) {
    return "medium";
  }
  return "high";
}

function relationLabel(type: CareerGraphEdgeRecord["relation_type"]): string {
  if (type === "promotion") {
    return "晋升";
  }
  if (type === "transition") {
    return "换岗";
  }
  return "技能迁移";
}

function keepBestEdges(edges: CareerGraphEdgeRecord[]): CareerGraphEdgeRecord[] {
  const dedup = new Map<string, CareerGraphEdgeRecord>();
  for (const edge of edges) {
    const key = `${edge.relation_type}__${edge.source}__${edge.target}`;
    const existing = dedup.get(key);
    if (!existing || edge.score > existing.score) {
      dedup.set(key, edge);
    }
  }
  return Array.from(dedup.values());
}

function countTransitionPaths(edges: CareerGraphEdgeRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const edge of edges) {
    if (edge.relation_type !== "transition" && edge.relation_type !== "skill_migration") {
      continue;
    }
    map.set(edge.source, (map.get(edge.source) ?? 0) + 1);
  }
  return map;
}

function supplementTransitionCoverage(params: {
  nodes: ManualGraphNode[];
  existingEdges: CareerGraphEdgeRecord[];
  candidatePairs: CandidatePair[];
  minTransitionPathsPerJob: number;
  targetTransitionJobCount: number;
}): CareerGraphEdgeRecord[] {
  const extraEdges: CareerGraphEdgeRecord[] = [];
  const transitionCount = countTransitionPaths(params.existingEdges);
  const promoted = [...params.nodes].sort((left, right) => right.level - left.level);
  const targetNodes = promoted.slice(0, Math.min(params.targetTransitionJobCount, promoted.length));

  for (const node of targetNodes) {
    const current = transitionCount.get(node.id) ?? 0;
    if (current >= params.minTransitionPathsPerJob) {
      continue;
    }

    const needed = params.minTransitionPathsPerJob - current;
    const localCandidates = params.candidatePairs
      .filter((pair) => pair.source.id === node.id && pair.source.family !== pair.target.family)
      .sort((left, right) => right.jaccard - left.jaccard)
      .slice(0, needed);

    for (const pair of localCandidates) {
      const score = Math.max(45, Math.round(42 + pair.jaccard * 45 + pair.overlap.length * 3));
      extraEdges.push({
        id: `transition-${pair.source.job_id}-${pair.target.job_id}`,
        source: pair.source.id,
        target: pair.target.id,
        relation_type: "transition",
        reason: `补充换岗覆盖：跨岗位族具备 ${pair.overlap.length} 项可复用技能。`,
        required_skills: uniqueLimited(pair.target.skills, 8),
        gap_skills: uniqueLimited(pair.gapSkills, 8),
        transition_cost: resolveTransitionCost(pair.gapSkills.length),
        direction_label: relationLabel("transition"),
        score,
      });
    }
  }

  return extraEdges;
}

function nodeHasEdge(nodeId: string, edges: CareerGraphEdgeRecord[]): boolean {
  return edges.some((edge) => edge.source === nodeId || edge.target === nodeId);
}

/**
 * 兜底策略：当某些岗位在规则判定后仍是孤立点时，按“同族优先、级别接近优先”补至少一条关系，
 * 防止前端只显示单节点，保证图谱具备基本可读性。
 */
function supplementIsolatedNodes(params: {
  nodes: ManualGraphNode[];
  edges: CareerGraphEdgeRecord[];
}): CareerGraphEdgeRecord[] {
  const fallbackEdges: CareerGraphEdgeRecord[] = [];

  for (const source of params.nodes) {
    if (nodeHasEdge(source.id, [...params.edges, ...fallbackEdges])) {
      continue;
    }

    const candidates = params.nodes
      .filter((target) => target.id !== source.id)
      .map((target) => {
        const similarity = compareSkills(source.skills, target.skills);
        const sameFamily = source.family === target.family;
        const levelDiff = target.level - source.level;
        const score =
          (sameFamily ? 0.45 : 0.2) +
          similarity.jaccard * 0.4 +
          Math.max(0, 0.2 - Math.abs(levelDiff) * 0.06);
        return {
          target,
          similarity,
          sameFamily,
          levelDiff,
          score,
        };
      })
      .sort((left, right) => right.score - left.score);

    const best = candidates[0];
    if (!best) {
      continue;
    }

    const relationType: CareerGraphEdgeRecord["relation_type"] =
      best.sameFamily && best.levelDiff >= 0 ? "promotion" : "transition";

    fallbackEdges.push({
      id: `fallback-${relationType}-${source.job_id}-${best.target.job_id}`,
      source: source.id,
      target: best.target.id,
      relation_type: relationType,
      reason: best.sameFamily
        ? "兜底补边：同岗位族能力相近，补充可视化晋升关系。"
        : "兜底补边：跨岗位族存在能力迁移潜力，补充可视化转岗关系。",
      required_skills: uniqueLimited(best.target.skills, 8),
      gap_skills: uniqueLimited(best.similarity.gapSkills, 8),
      transition_cost: resolveTransitionCost(best.similarity.gapSkills.length),
      direction_label: relationLabel(relationType),
      score: Math.max(42, Math.round(45 + best.score * 25)),
    });
  }

  return fallbackEdges;
}

export function buildCareerGraphFromManualPortraits(params: {
  portraits: ManualJobPortraitRecord[];
  jobIdByTitle: Map<string, number>;
  options: ManualCareerGraphBuildOptions;
}): ManualCareerGraphBuildResult {
  const generatedAt = new Date().toISOString();
  const nodes = params.portraits.map((item) => toGraphNode(item, params.jobIdByTitle));
  const candidatePairs = buildCandidatePairs(nodes, params.options.maxCandidatesPerNode);

  const edgesFromAgent: CareerGraphEdgeRecord[] = [];
  for (const candidate of candidatePairs) {
    const judgements = judgeCandidateByBuiltInAgent(candidate);
    for (const judgement of judgements) {
      edgesFromAgent.push({
        id: `${judgement.relation_type}-${candidate.source.job_id}-${candidate.target.job_id}`,
        source: candidate.source.id,
        target: candidate.target.id,
        relation_type: judgement.relation_type,
        reason: judgement.reason,
        required_skills: uniqueLimited(candidate.target.skills, 8),
        gap_skills: uniqueLimited(candidate.gapSkills, 8),
        transition_cost: resolveTransitionCost(candidate.gapSkills.length),
        direction_label: relationLabel(judgement.relation_type),
        score: Math.max(1, Math.min(100, judgement.score)),
      });
    }
  }

  const supplemented = supplementTransitionCoverage({
    nodes,
    existingEdges: edgesFromAgent,
    candidatePairs,
    minTransitionPathsPerJob: params.options.minTransitionPathsPerJob,
    targetTransitionJobCount: params.options.targetTransitionJobCount,
  });

  const isolationSupplemented = supplementIsolatedNodes({
    nodes,
    edges: [...edgesFromAgent, ...supplemented],
  });

  const dedupedEdges = keepBestEdges([
    ...edgesFromAgent,
    ...supplemented,
    ...isolationSupplemented,
  ]);
  const transitionCountMap = countTransitionPaths(dedupedEdges);

  return {
    snapshot: {
      graph_version: GRAPH_VERSION,
      generated_at: generatedAt,
      nodes,
      edges: dedupedEdges,
    },
    stats: {
      candidate_pairs: candidatePairs.length,
      validated_pairs: edgesFromAgent.length,
      promotion_edges: dedupedEdges.filter((edge) => edge.relation_type === "promotion").length,
      transition_edges: dedupedEdges.filter((edge) => edge.relation_type === "transition").length,
      skill_migration_edges: dedupedEdges.filter((edge) => edge.relation_type === "skill_migration")
        .length,
      transition_jobs_with_paths: Array.from(transitionCountMap.values()).filter(
        (count) => count >= 1,
      ).length,
    },
  };
}
