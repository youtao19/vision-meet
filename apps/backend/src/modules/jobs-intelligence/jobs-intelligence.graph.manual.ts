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

type ConfirmedTransitionPath = {
  source: string;
  target: string;
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

const CONFIRMED_TRANSITION_PATHS: ConfirmedTransitionPath[] = [
  {
    source: "AI算法工程师",
    target: "Python开发工程师",
    reason: "Python、API 开发、Linux、Docker 能力可复用，可转向 Python 工程开发。",
    score: 78,
  },
  {
    source: "AI算法工程师",
    target: "数据分析师",
    reason: "Python、数据处理、统计建模能力可复用，可转向数据分析方向。",
    score: 76,
  },
  {
    source: "AI算法工程师",
    target: "产品经理",
    reason: "适合转向 AI 产品方向，但需要补需求分析、PRD 和用户调研能力。",
    score: 58,
  },
  {
    source: "Java后端开发工程师",
    target: "Python开发工程师",
    reason: "后端服务、数据库、接口开发、Linux、Docker 能力可复用。",
    score: 82,
  },
  {
    source: "Java后端开发工程师",
    target: "运维工程师",
    reason: "Linux、Docker、Redis、MySQL 和系统部署经验可复用。",
    score: 74,
  },
  {
    source: "Java后端开发工程师",
    target: "测试开发工程师",
    reason: "Java、接口理解、自动化和问题排查能力可复用。",
    score: 72,
  },
  {
    source: "Java后端开发工程师",
    target: "网络安全工程师",
    reason: "Web、接口、日志、权限和安全开发经验可迁移。",
    score: 66,
  },
  {
    source: "Python开发工程师",
    target: "AI算法工程师",
    reason: "Python、数据处理和 AI 应用基础可复用。",
    score: 78,
  },
  {
    source: "Python开发工程师",
    target: "数据分析师",
    reason: "Python、SQL、数据处理能力可复用。",
    score: 82,
  },
  {
    source: "Python开发工程师",
    target: "Java后端开发工程师",
    reason: "后端服务、数据库、接口、Redis、Docker 能力可复用。",
    score: 76,
  },
  {
    source: "Python开发工程师",
    target: "测试开发工程师",
    reason: "Python、接口测试、自动化脚本能力可复用。",
    score: 74,
  },
  {
    source: "Python开发工程师",
    target: "运维工程师",
    reason: "Linux、Docker、脚本和服务部署能力可复用。",
    score: 70,
  },
  {
    source: "UI/UX设计师",
    target: "产品经理",
    reason: "用户调研、原型设计、Figma 和流程设计能力可复用。",
    score: 84,
  },
  {
    source: "UI/UX设计师",
    target: "前端开发工程师",
    reason: "界面设计和交互理解可复用，但需要补 HTML、CSS、JavaScript。",
    score: 62,
  },
  {
    source: "UI/UX设计师",
    target: "数据分析师",
    reason: "用户体验分析能力可迁移，但需要补 SQL、Python 和统计分析。",
    score: 50,
  },
  {
    source: "产品经理",
    target: "UI/UX设计师",
    reason: "用户调研、原型、Figma 和交互设计能力可复用。",
    score: 80,
  },
  {
    source: "产品经理",
    target: "数据分析师",
    reason: "数据分析、指标理解和业务分析能力可复用。",
    score: 72,
  },
  {
    source: "产品经理",
    target: "前端开发工程师",
    reason: "产品原型和交互理解可复用，但需要补前端开发能力。",
    score: 54,
  },
  {
    source: "产品经理",
    target: "AI算法工程师",
    reason: "不建议直接转算法，更适合作为 AI 产品方向延伸。",
    score: 42,
  },
  {
    source: "前端开发工程师",
    target: "UI/UX设计师",
    reason: "界面、交互、组件体验理解可复用。",
    score: 72,
  },
  {
    source: "前端开发工程师",
    target: "产品经理",
    reason: "用户界面、业务流程和需求理解可复用。",
    score: 68,
  },
  {
    source: "前端开发工程师",
    target: "Java后端开发工程师",
    reason: "接口、工程化、Git 和业务系统经验可复用。",
    score: 62,
  },
  {
    source: "前端开发工程师",
    target: "Python开发工程师",
    reason: "Web 开发理解可复用，但需要补 Python 后端能力。",
    score: 58,
  },
  {
    source: "前端开发工程师",
    target: "测试开发工程师",
    reason: "Jest、Playwright 和前端自动化测试经验可复用。",
    score: 74,
  },
  {
    source: "数据分析师",
    target: "Python开发工程师",
    reason: "Python、SQL 和数据处理能力可复用。",
    score: 78,
  },
  {
    source: "数据分析师",
    target: "AI算法工程师",
    reason: "Python、数据处理和统计学能力可复用。",
    score: 72,
  },
  {
    source: "数据分析师",
    target: "产品经理",
    reason: "业务分析、指标体系和用户洞察能力可复用。",
    score: 76,
  },
  {
    source: "数据分析师",
    target: "UI/UX设计师",
    reason: "用户数据分析能力可迁移，但需要补设计工具和设计表达。",
    score: 52,
  },
  {
    source: "测试开发工程师",
    target: "Python开发工程师",
    reason: "Python、接口和自动化脚本能力可复用。",
    score: 78,
  },
  {
    source: "测试开发工程师",
    target: "Java后端开发工程师",
    reason: "Java、接口测试和系统理解能力可复用。",
    score: 70,
  },
  {
    source: "测试开发工程师",
    target: "运维工程师",
    reason: "Linux、CI/CD、问题排查和自动化能力可复用。",
    score: 76,
  },
  {
    source: "测试开发工程师",
    target: "网络安全工程师",
    reason: "漏洞验证、接口测试和日志分析能力可迁移。",
    score: 68,
  },
  {
    source: "测试开发工程师",
    target: "前端开发工程师",
    reason: "Jest、Playwright 和前端测试经验可复用。",
    score: 68,
  },
  {
    source: "网络安全工程师",
    target: "运维工程师",
    reason: "Linux、安全加固、日志、网络和权限能力可复用。",
    score: 80,
  },
  {
    source: "网络安全工程师",
    target: "测试开发工程师",
    reason: "漏洞分析、接口测试和问题定位能力可复用。",
    score: 72,
  },
  {
    source: "网络安全工程师",
    target: "Java后端开发工程师",
    reason: "Web 安全、权限、日志和接口理解可迁移。",
    score: 64,
  },
  {
    source: "网络安全工程师",
    target: "Python开发工程师",
    reason: "Python、脚本、自动化和安全工具开发能力可复用。",
    score: 72,
  },
  {
    source: "运维工程师",
    target: "网络安全工程师",
    reason: "Linux、安全加固、日志、网络和权限能力可复用。",
    score: 78,
  },
  {
    source: "运维工程师",
    target: "Python开发工程师",
    reason: "Shell、自动化和服务部署经验可迁移到 Python 工具开发。",
    score: 70,
  },
  {
    source: "运维工程师",
    target: "Java后端开发工程师",
    reason: "部署、数据库、中间件和服务治理经验可迁移。",
    score: 62,
  },
  {
    source: "运维工程师",
    target: "测试开发工程师",
    reason: "CI/CD、自动化、环境治理和问题排查能力可复用。",
    score: 74,
  },
];

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

function textLevelToNumber(value: string): number {
  if (value.includes("极高")) return 5;
  if (value.includes("高")) return 4;
  if (value.includes("中")) return 3;
  if (value.includes("低")) return 2;
  return 3;
}

function resolvePortraitLevel(item: ManualJobPortraitRecord): number {
  const detail = item.profile_detail;
  const weighted =
    textLevelToNumber(detail.learningAbility) * 0.25 +
    textLevelToNumber(detail.innovationAbility) * 0.2 +
    textLevelToNumber(detail.stressResistance) * 0.2 +
    textLevelToNumber(detail.communicationAbility) * 0.15 +
    Math.min(5, Math.max(1, Math.ceil(detail.skills.length / 4))) * 0.2;

  return clampLevel(weighted);
}

function buildNodeSkills(item: ManualJobPortraitRecord): string[] {
  const detail = item.profile_detail;
  const tokens = tokenize(
    [
      item.job_name,
      item.category,
      detail.description,
      detail.internshipAbility,
      ...detail.skills,
      ...detail.softSkills,
      ...detail.certificates,
      ...detail.subIndustries.flatMap((subIndustry) => [
        subIndustry.industry,
        subIndustry.description,
        ...subIndustry.skills,
        ...subIndustry.industryFeatures,
        ...subIndustry.recommendedProjects,
      ]),
    ].join(" "),
  );

  return uniqueLimited(tokens, 18);
}

function toGraphNode(
  item: ManualJobPortraitRecord,
  jobIdByTitle: Map<string, number>,
): ManualGraphNode {
  const resolvedJobId =
    item.job_id ??
    jobIdByTitle.get(normalizeText(item.job_name)) ??
    stableJobIdFromName(item.job_name);
  const detail = item.profile_detail;

  const summary = [
    `岗位族：${item.category}`,
    `岗位描述：${detail.description}`,
    `核心技能：${detail.skills.slice(0, 8).join("、")}`,
    `子行业：${detail.subIndustries.map((subIndustry) => subIndustry.industry).join("、")}`,
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

function titleKey(title: string): string {
  return normalizeText(title).replace(/\s+/g, "");
}

function uniqueByTitle(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const key = titleKey(trimmed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function buildNodeIndex(nodes: ManualGraphNode[]): Map<string, ManualGraphNode> {
  const map = new Map<string, ManualGraphNode>();
  for (const node of nodes) {
    map.set(titleKey(node.title), node);
  }
  return map;
}

function buildPromotionGapSkills(source: ManualGraphNode, target: ManualGraphNode): string[] {
  const sourceSkillSet = new Set(source.skills.map((item) => normalizeText(item)));
  const gapSkills = target.skills.filter((item) => !sourceSkillSet.has(normalizeText(item)));
  if (gapSkills.length > 0) {
    return uniqueLimited(gapSkills, 8);
  }

  return uniqueLimited(["复杂项目经验", "系统设计能力", "跨团队协作"], 8);
}

function buildConfirmedPromotionPaths(params: {
  baseNodes: ManualGraphNode[];
  portraits: ManualJobPortraitRecord[];
}): {
  nodes: ManualGraphNode[];
  edges: CareerGraphEdgeRecord[];
} {
  const nodes = [...params.baseNodes];
  const nodeByTitle = buildNodeIndex(nodes);
  const edges: CareerGraphEdgeRecord[] = [];

  for (const portrait of params.portraits) {
    const source = nodeByTitle.get(titleKey(portrait.job_name));
    if (!source) {
      continue;
    }

    const pathSteps = uniqueByTitle(portrait.profile_detail.careerPath);
    const sourceIndex = pathSteps.findIndex((step) => titleKey(step) === titleKey(source.title));
    const promotionSteps = sourceIndex >= 0 ? pathSteps.slice(sourceIndex + 1) : pathSteps;
    let previous = source;
    for (const [index, step] of promotionSteps.entries()) {
      if (titleKey(step) === titleKey(previous.title)) {
        continue;
      }

      let target = nodeByTitle.get(titleKey(step));
      if (!target) {
        const virtualJobId = stableJobIdFromName(
          `career-path:${portrait.job_name}:${index}:${step}`,
        );
        target = {
          id: `job-${virtualJobId}`,
          job_id: virtualJobId,
          title: step,
          family: source.family,
          level: clampLevel(index + 1),
          skills: source.skills,
          summary: `${source.title}的晋升阶段：${step}`,
        };
        nodes.push(target);
        nodeByTitle.set(titleKey(step), target);
      }

      if (previous.id !== target.id) {
        const gapSkills = buildPromotionGapSkills(previous, target);
        edges.push({
          id: `promotion-${previous.job_id}-${target.job_id}`,
          source: previous.id,
          target: target.id,
          relation_type: "promotion",
          reason: `岗位画像确认路径：${previous.title} 进阶到 ${target.title}。`,
          required_skills: uniqueLimited(target.skills, 8),
          gap_skills: gapSkills,
          transition_cost: resolveTransitionCost(gapSkills.length),
          direction_label: relationLabel("promotion"),
          score: Math.max(65, 90 - index * 3),
        });
      }

      previous = target;
    }
  }

  return { nodes, edges };
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

function buildConfirmedTransitionEdges(nodes: ManualGraphNode[]): CareerGraphEdgeRecord[] {
  const nodeByTitle = buildNodeIndex(nodes);
  const edges: CareerGraphEdgeRecord[] = [];

  for (const path of CONFIRMED_TRANSITION_PATHS) {
    const source = nodeByTitle.get(titleKey(path.source));
    const target = nodeByTitle.get(titleKey(path.target));
    if (!source || !target || source.id === target.id) {
      continue;
    }

    const similarity = compareSkills(source.skills, target.skills);
    const gapSkills = uniqueLimited(similarity.gapSkills, 8);
    edges.push({
      id: `transition-${source.job_id}-${target.job_id}`,
      source: source.id,
      target: target.id,
      relation_type: "transition",
      reason: path.reason,
      required_skills: uniqueLimited(target.skills, 8),
      gap_skills: gapSkills,
      transition_cost: resolveTransitionCost(gapSkills.length),
      direction_label: relationLabel("transition"),
      score: path.score,
    });
  }

  return edges;
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
  const baseNodes = params.portraits.map((item) => toGraphNode(item, params.jobIdByTitle));
  const promotionGraph = buildConfirmedPromotionPaths({
    baseNodes,
    portraits: params.portraits,
  });
  const nodes = promotionGraph.nodes;
  const candidatePairs = buildCandidatePairs(baseNodes, params.options.maxCandidatesPerNode);

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

  const confirmedTransitionEdges = buildConfirmedTransitionEdges(baseNodes);

  const supplemented = supplementTransitionCoverage({
    nodes: baseNodes,
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
    ...promotionGraph.edges,
    ...edgesFromAgent,
    ...confirmedTransitionEdges,
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
