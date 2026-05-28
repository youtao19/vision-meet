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

/** 统一文本格式：去首尾空白、转小写、合并连续空格 */
function normalizeText(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/** 标准化岗位族名称：小写 + 下划线，默认值 other */
function normalizeFamily(input: string): string {
  return normalizeText(input || "other").replace(/\s+/g, "_");
}

/**
 * 中文分词：按非字母数字/非中文字符分割，去重，过滤单字词。
 * 用于从岗位描述的多个字段中提取有意义的技能关键词。
 */
function tokenize(input: string): string[] {
  if (!input) {
    return [];
  }

  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9一-龥+#]+/g)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2),
    ),
  );
}

/**
 * 根据岗位名称生成稳定的（可复现）虚拟 job_id。
 * 用 SHA1 哈希的前 8 位做整数映射，分布在 1_000_000_000 ~ 1_900_000_000 区间。
 * 用于画像中缺少 job_id 时回退生成，保证同名的岗位始终映射到同一个 ID。
 */
function stableJobIdFromName(jobName: string): number {
  const digest = createHash("sha1").update(jobName).digest("hex").slice(0, 8);
  const parsed = Number.parseInt(digest, 16);
  return 1_000_000_000 + (parsed % 900_000_000);
}

/** 去重并限制列表长度为上限值 */
function uniqueLimited(items: string[], limit: number): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

/** 将职级数值限制在 [1, 5] 的合法区间内，非法值默认返回 2 */
function clampLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 2;
  }
  return Math.max(1, Math.min(5, Math.round(value)));
}

/** 将中文职级描述转为数值（极高=5, 高=4, 中=3, 低=2，默认 3） */
function textLevelToNumber(value: string): number {
  if (value.includes("极高")) return 5;
  if (value.includes("高")) return 4;
  if (value.includes("中")) return 3;
  if (value.includes("低")) return 2;
  return 3;
}

/**
 * 从岗位画像中解析综合职级。
 * 加权算法：学习能力 25% + 创新能力 20% + 抗压能力 20% + 沟通能力 15% + 技能数量 20%。
 * 其中技能数量按每 4 个技能升一级，上限 5 级。
 */
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

/**
 * 从岗位画像中提取技能关键词。
 * 聚合字段包括岗位名称、类别、描述、实习建议、技能、软技能、证书、子行业信息。
 * 最终去重后保留最多 18 个词。
 */
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

/**
 * 将岗位画像转为图谱节点（ManualGraphNode）。
 * job_id 优先级：画像自带 ID > 名称匹配已有 ID > 哈希生成稳定 ID。
 * summary 由岗位族、描述、核心技能、子行业拼接而成。
 */
function toGraphNode(
  item: ManualJobPortraitRecord,
  jobIdByTitle: Map<string, number>,
): ManualGraphNode {
  // 按优先级解析 job_id
  const resolvedJobId =
    item.job_id ??
    jobIdByTitle.get(normalizeText(item.job_name)) ??
    stableJobIdFromName(item.job_name);
  const detail = item.profile_detail;

  // 构造节点摘要信息
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

/** 标题去空格后转小写格式，用作 Map 键值 */
function titleKey(title: string): string {
  return normalizeText(title).replace(/\s+/g, "");
}

/** 按标题去重（保留首次出现顺序），忽略空字符串 */
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

/** 以标题为键建立节点索引 Map，用于快速查找 */
function buildNodeIndex(nodes: ManualGraphNode[]): Map<string, ManualGraphNode> {
  const map = new Map<string, ManualGraphNode>();
  for (const node of nodes) {
    map.set(titleKey(node.title), node);
  }
  return map;
}

/**
 * 计算晋升路径下的技能差距。
 * 取目标节点有但源节点没有的技能；如果目标没有额外技能，则返回默认的待提升能力。
 */
function buildPromotionGapSkills(source: ManualGraphNode, target: ManualGraphNode): string[] {
  const sourceSkillSet = new Set(source.skills.map((item) => normalizeText(item)));
  const gapSkills = target.skills.filter((item) => !sourceSkillSet.has(normalizeText(item)));
  if (gapSkills.length > 0) {
    return uniqueLimited(gapSkills, 8);
  }

  // 兜底：当技能完全覆盖时，使用通用的晋升 gap
  return uniqueLimited(["复杂项目经验", "系统设计能力", "跨团队协作"], 8);
}

/**
 * 根据画像中的 careerPath 构建已确认的晋升路径边。
 * 遍历每个画像的职业路径，从当前岗位出发依次链接后续晋升阶段。
 * 如果路径中的晋升目标岗位尚未在节点列表中，则自动创建虚拟节点。
 */
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

/**
 * 比较两组技能列表，计算重叠项、Jaccard 相似度、目标端额外技能（gap）。
 * 所有技能先标准化再比较，避免大小写/空格差异影响结果。
 */
function compareSkills(
  sourceSkills: string[],
  targetSkills: string[],
): {
  overlap: string[];
  jaccard: number;
  gapSkills: string[];
} {
  // 转 Set 去重并标准化
  const sourceSet = new Set(sourceSkills.map((item) => normalizeText(item)));
  const targetSet = new Set(targetSkills.map((item) => normalizeText(item)));
  // 交集：源端有的技能中目标端也有的
  const overlap = Array.from(sourceSet).filter((skill) => targetSet.has(skill));
  // 并集大小
  const unionCount = new Set([...sourceSet, ...targetSet]).size;
  // gap：目标端有但源端没有的技能
  const gapSkills = Array.from(targetSet).filter((skill) => !sourceSet.has(skill));

  return {
    overlap,
    jaccard: unionCount > 0 ? overlap.length / unionCount : 0,
    gapSkills,
  };
}

/**
 * 为所有节点构建候选岗位对（source → target）。
 * 按同族晋升、跨族换岗、技能迁移三个维度筛选：
 * - 同族且职级差 1-2 级且 Jaccard >= 0.12 → 晋升候选
 * - 不同族且职级差 <= 1 且有至少 1 项重叠技能 → 换岗候选
 * - 重叠技能 >= 2 且职级差 <= 1 → 技能迁移候选
 * 每个节点取 recallScore 最高的 maxPerNode 个，score 综合了同族加分、Jaccard、重叠量、职级差。
 */
function buildCandidatePairs(nodes: ManualGraphNode[], maxPerNode: number): CandidatePair[] {
  const candidates: CandidatePair[] = [];

  for (const source of nodes) {
    // 每个源节点最多取 maxPerNode 个候选
    const local: Array<CandidatePair & { recallScore: number }> = [];

    for (const target of nodes) {
      if (source.id === target.id) {
        continue;
      }

      const similarity = compareSkills(source.skills, target.skills);
      const levelDiff = target.level - source.level;
      const sameFamily = source.family === target.family;

      // 三重筛选：晋升、换岗、技能迁移（满足任一即可）
      const isPromotionCandidate =
        sameFamily && levelDiff >= 1 && levelDiff <= 2 && similarity.jaccard >= 0.12;
      const isTransitionCandidate =
        !sameFamily && Math.abs(levelDiff) <= 1 && similarity.overlap.length >= 1;
      const isSkillMigrationCandidate = similarity.overlap.length >= 2 && levelDiff <= 1;

      if (!isPromotionCandidate && !isTransitionCandidate && !isSkillMigrationCandidate) {
        continue;
      }

      // 综合打分：同族基础分 + Jaccard 贡献 + 重叠技能加分 - 职级差过高扣分
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

    // 按 recallScore 降序取 top N
    local.sort((left, right) => right.recallScore - left.recallScore);
    candidates.push(...local.slice(0, maxPerNode));
  }

  return candidates;
}

/**
 * 根据预定义的确认换岗路径列表构建换岗边。
 * CONFIRMED_TRANSITION_PATHS 中包含了经过业务验证的 41 条跨岗位族转换路径。
 * 只有当源和目标节点都存在时才会生成边。
 */
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
 * 内置评判器：对候选岗位对进行关系类型判定。
 * - promotion: 同族 + 职级上升 1-2 + Jaccard >= 0.2
 * - transition: 不同族 + 职级差 <= 1 + 重叠技能 >= 2 + Jaccard >= 0.14
 * - skill_migration: 重叠技能 >= 3 + Jaccard >= 0.2 + 职级差 <= 1
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

/** 根据技能差距数量确定转换成本：low(<=2) / medium(<=5) / high(>5) */
function resolveTransitionCost(gapCount: number): "low" | "medium" | "high" {
  if (gapCount <= 2) {
    return "low";
  }
  if (gapCount <= 5) {
    return "medium";
  }
  return "high";
}

/** 关系类型中文标签映射 */
function relationLabel(type: CareerGraphEdgeRecord["relation_type"]): string {
  if (type === "promotion") {
    return "晋升";
  }
  if (type === "transition") {
    return "换岗";
  }
  return "技能迁移";
}

/**
 * 边去重：同一对节点之间同类型的边只保留分数最高的那条。
 * 因为规则引擎和 Agent 可能生成重复的关系，需要通过此函数合并。
 */
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

/** 统计每个节点作为源节点的换岗/技能迁移路径数量 */
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

/**
 * 补充换岗路径覆盖：确保 targetTransitionJobCount 个职级最高的岗位
 * 都至少有 minTransitionPathsPerJob 条换岗出边。
 * 从候选对中按 Jaccard 排序取最优的补边。
 */
function supplementTransitionCoverage(params: {
  nodes: ManualGraphNode[];
  existingEdges: CareerGraphEdgeRecord[];
  candidatePairs: CandidatePair[];
  minTransitionPathsPerJob: number;
  targetTransitionJobCount: number;
}): CareerGraphEdgeRecord[] {
  const extraEdges: CareerGraphEdgeRecord[] = [];
  // 统计当前每个节点的换岗路径数
  const transitionCount = countTransitionPaths(params.existingEdges);
  // 按职级降序排列，职级高的岗位优先保证有换岗路径
  const promoted = [...params.nodes].sort((left, right) => right.level - left.level);
  const targetNodes = promoted.slice(0, Math.min(params.targetTransitionJobCount, promoted.length));

  for (const node of targetNodes) {
    const current = transitionCount.get(node.id) ?? 0;
    // 如果已达到最低要求则跳过
    if (current >= params.minTransitionPathsPerJob) {
      continue;
    }

    // 从候选对中找跨族的、当前节点作为源节点的候选
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

/** 检查节点是否已经存在于任意边的端点中 */
function nodeHasEdge(nodeId: string, edges: CareerGraphEdgeRecord[]): boolean {
  return edges.some((edge) => edge.source === nodeId || edge.target === nodeId);
}

/**
 * 兜底补边：给没有任何边连接的孤立节点补充一条边。
 * 遍历所有节点，如果某个节点既不在已有边中也不在补边中，
 * 就找与其最相似的节点（综合考虑同族加权、Jaccard、职级差）建一条 promotion 或 transition 边。
 * 保证图谱可视化时每个节点都至少有一条连接，避免孤岛。
 */
function supplementIsolatedNodes(params: {
  nodes: ManualGraphNode[];
  edges: CareerGraphEdgeRecord[];
}): CareerGraphEdgeRecord[] {
  const fallbackEdges: CareerGraphEdgeRecord[] = [];

  for (const source of params.nodes) {
    // 跳过已经有边的节点（包括之前补的边）
    if (nodeHasEdge(source.id, [...params.edges, ...fallbackEdges])) {
      continue;
    }

    // 对所有其他节点打分，找相似度最高的
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

    // 同族且职级不降 → promotion，否则 transition
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

/**
 * 规则引擎入口：基于岗位画像生成完整职业路径图谱。
 * 流程：
 * 1. 将画像转为图谱节点（含职级、技能标签）
 * 2. 根据 careerPath 构建已确认的晋升路径
 * 3. 对所有节点对打分排序，找出候选关系对
 * 4. 用内置评判器判定候选对的关系类型（晋升/换岗/技能迁移）
 * 5. 添加业界确认的换岗路径（CONFIRMED_TRANSITION_PATHS）
 * 6. 补充换岗覆盖：确保高级岗位有足够换岗出边
 * 7. 兜底补边：给孤立节点连接最相似节点
 * 8. 去重 + 统计
 */
export function buildCareerGraphFromManualPortraits(params: {
  portraits: ManualJobPortraitRecord[];
  jobIdByTitle: Map<string, number>;
  options: ManualCareerGraphBuildOptions;
}): ManualCareerGraphBuildResult {
  const generatedAt = new Date().toISOString();

  // 1. 画像 → 图谱节点
  const baseNodes = params.portraits.map((item) => toGraphNode(item, params.jobIdByTitle));

  // 2. 晋升路径
  const promotionGraph = buildConfirmedPromotionPaths({
    baseNodes,
    portraits: params.portraits,
  });
  const nodes = promotionGraph.nodes;

  // 3. 候选对打分
  const candidatePairs = buildCandidatePairs(baseNodes, params.options.maxCandidatesPerNode);

  // 4. 内置评判器判定关系类型
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

  // 5. 确认换岗路径（人工验证过的 41 条路径）
  const confirmedTransitionEdges = buildConfirmedTransitionEdges(baseNodes);

  // 6. 补充换岗覆盖
  const supplemented = supplementTransitionCoverage({
    nodes: baseNodes,
    existingEdges: edgesFromAgent,
    candidatePairs,
    minTransitionPathsPerJob: params.options.minTransitionPathsPerJob,
    targetTransitionJobCount: params.options.targetTransitionJobCount,
  });

  // 7. 兜底补边（孤立节点）
  const isolationSupplemented = supplementIsolatedNodes({
    nodes,
    edges: [...edgesFromAgent, ...supplemented],
  });

  // 8. 合并所有边、去重（保留分数最高的）、统计
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
