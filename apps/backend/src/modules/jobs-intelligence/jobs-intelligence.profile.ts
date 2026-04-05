import type {
  CanonicalRoleProfileDraft,
  CanonicalRoleSummary,
  JobRecord,
  PostingEvidenceField,
  PostingEvidenceRecord,
  PostingProfileFacts,
} from "@career/contracts/types";

export type { CanonicalRoleProfileDraft, PostingEvidenceField, PostingProfileFacts };

import {
  JOB_FAMILY_DEFINITIONS,
  inferJobLevelWithSignals,
  normalizeJobTitle,
  resolveJobFamilyByTitle,
} from "./jobs-intelligence.taxonomy.js";

export type PostingEvidenceItem = PostingEvidenceRecord;

const SKILL_KEYWORDS = [
  "python",
  "java",
  "golang",
  "c++",
  "typescript",
  "javascript",
  "vue",
  "react",
  "node",
  "express",
  "mysql",
  "postgresql",
  "redis",
  "kafka",
  "linux",
  "docker",
  "kubernetes",
  "sql",
  "机器学习",
  "深度学习",
  "数据分析",
  "etl",
  "测试",
  "自动化",
  "需求分析",
  "项目管理",
  "沟通",
  "系统设计",
  "网络安全",
  "交互设计",
];

const CERTIFICATE_KEYWORDS = [
  "pmp",
  "软考",
  "英语六级",
  "英语四级",
  "aws",
  "azure",
  "hcia",
  "信息安全",
  "计算机二级",
  "教师资格证",
];

const TOOL_KEYWORDS = [
  "docker",
  "kubernetes",
  "git",
  "jenkins",
  "jira",
  "mysql",
  "postgresql",
  "redis",
  "kafka",
];

const SOFT_SKILL_KEYWORDS = ["沟通", "协作", "学习", "抗压", "责任心", "逻辑"];
const CANONICAL_SOFT_SKILL_WHITELIST = [
  "沟通",
  "协作",
  "学习",
  "学习能力",
  "抗压",
  "抗压能力",
  "责任心",
  "逻辑",
  "逻辑分析",
];

const EDUCATION_KEYWORDS = ["本科", "硕士", "博士", "大专"];

const EXPERIENCE_PATTERNS = [/\d+\s*年/, /\d+\s*年以上/, /应届/, /实习/];
const UNKNOWN_JOB_FAMILY_HINTS = new Set([
  "其他岗位",
  "其他",
  "other",
  "others",
  "unknown",
  "misc",
  "未分类",
  "n/a",
  "na",
]);
const JOB_FAMILY_HINT_ALIAS: Record<string, string> = {
  测试开发工程师: "qa",
  测试质量: "qa",
  前端开发: "frontend",
  后端开发: "backend",
  算法工程师: "algorithm",
  数据工程师: "data",
  项目管理: "project",
  产品运营: "product",
  商务与职能: "business",
};
const JOB_FAMILY_BASELINE_SKILLS = new Map(
  JOB_FAMILY_DEFINITIONS.map((item) => [item.key, item.baselineSkills]),
);
const JOB_FAMILY_DEFAULT_TOOLS: Record<string, string[]> = {
  frontend: ["git", "node", "docker"],
  backend: ["git", "mysql", "redis"],
  fullstack: ["git", "node", "mysql"],
  data: ["python", "sql", "etl"],
  algorithm: ["python", "sql", "docker"],
  devops: ["docker", "kubernetes", "jenkins"],
  qa: ["git", "jira", "jenkins"],
  product: ["jira", "sql"],
  project: ["jira", "excel"],
  security: ["linux", "docker", "git"],
  design: ["figma", "jira"],
  business: ["excel", "jira"],
};

const DEFAULT_SOFT_SKILLS = ["沟通", "协作", "责任心"];

export type JobProfileNormalizationHint = {
  normalized_title_hint?: string | null;
  normalized_job_family_hint?: string | null;
  normalization_confidence_hint?: number | null;
};

export const CANONICAL_MIN_CONFIDENCE = 0.5;

function uniqueItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function extractByKeywords(source: string, keywords: string[]): string[] {
  const lowered = source.toLowerCase();
  return uniqueItems(keywords.filter((keyword) => lowered.includes(keyword.toLowerCase())));
}

function splitSentences(source: string): string[] {
  return source
    .split(/[。；;!！?？\n]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickEvidenceSentence(sentences: string[], keywords: string[]): string | null {
  const loweredKeywords = keywords.map((item) => item.toLowerCase());
  for (const sentence of sentences) {
    const lowered = sentence.toLowerCase();
    if (loweredKeywords.some((keyword) => lowered.includes(keyword))) {
      return sentence;
    }
  }
  return null;
}

function clampConfidence(value: number): number {
  return Math.max(0.2, Math.min(0.95, Number(value.toFixed(2))));
}

function getLevelDescriptor(levelBand: number): {
  label: string;
  overviewFocus: string;
  growthKeyword: string;
} {
  if (levelBand >= 4) {
    return {
      label: "资深/专家",
      overviewFocus: "架构设计、复杂问题治理与团队技术带动",
      growthKeyword: "架构与影响力",
    };
  }

  return {
    label: "中级/骨干",
    overviewFocus: "需求实现、质量交付与工程规范落地",
    growthKeyword: "工程交付能力",
  };
}

function toCanonicalLevelBand(level: number): number {
  return level >= 3 ? 4 : 2;
}

function resolveDominantLevelBand(levels: number[]): number {
  if (levels.length === 0) {
    return 2;
  }

  const counter = new Map<number, number>();
  for (const level of levels) {
    const band = toCanonicalLevelBand(level);
    counter.set(band, (counter.get(band) ?? 0) + 1);
  }

  return Array.from(counter.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 2;
}

function resolveCanonicalResponsibilities(params: {
  existingResponsibilities: string[];
  normalizedTitle: string;
  levelBand: number;
}): string[] {
  if (params.existingResponsibilities.length > 0) {
    return params.existingResponsibilities;
  }

  if (params.levelBand >= 4) {
    return [
      `负责${params.normalizedTitle}相关系统架构设计与关键技术方案评审`,
      "推动复杂问题定位与性能优化，制定并沉淀可复用技术规范",
      "承担跨团队技术协同与人才培养，保障核心项目高质量交付",
    ];
  }

  return [
    `负责${params.normalizedTitle}相关需求分析、方案设计与交付落地`,
    "协同上下游角色推进需求拆解、排期与验收，保障按期交付",
    "持续优化质量与效率，沉淀可复用的流程规范与最佳实践",
  ];
}

function resolveCanonicalSkillBuckets(params: {
  jobFamily: string;
  core: string[];
  common: string[];
  bonus: string[];
  levelBand: number;
}): {
  core: string[];
  common: string[];
  bonus: string[];
} {
  const baseline = JOB_FAMILY_BASELINE_SKILLS.get(params.jobFamily) ?? [];
  const core = params.core.length > 0 ? params.core : baseline.slice(0, 3);
  const occupied = new Set(
    [...core, ...params.common, ...params.bonus].map((item) => item.toLowerCase()),
  );
  const fallbackCommon = baseline.filter((item) => !occupied.has(item.toLowerCase())).slice(0, 5);

  return {
    core,
    common:
      params.common.length > 0
        ? params.common
        : params.levelBand >= 4
          ? uniqueItems(["系统设计", "性能优化", ...fallbackCommon]).slice(0, 6)
          : fallbackCommon,
    bonus: params.bonus,
  };
}

function resolveCanonicalTools(jobFamily: string, tools: string[]): string[] {
  if (tools.length > 0) {
    return tools;
  }
  return JOB_FAMILY_DEFAULT_TOOLS[jobFamily] ?? ["git", "sql"];
}

function resolveCanonicalSoftSkills(softSkills: string[]): string[] {
  if (softSkills.length > 0) {
    return softSkills;
  }
  return DEFAULT_SOFT_SKILLS;
}

function resolveCanonicalJobFamily(params: {
  hintFamily: string | null | undefined;
  title: string;
  taxonomyKey: string;
}): string {
  const hintFamily = params.hintFamily?.trim();
  if (!hintFamily) {
    return params.taxonomyKey;
  }

  const normalizedHint = normalizeJobTitle(hintFamily);
  const normalizedHintRaw = hintFamily.trim().toLowerCase();

  if (UNKNOWN_JOB_FAMILY_HINTS.has(hintFamily) || UNKNOWN_JOB_FAMILY_HINTS.has(normalizedHintRaw)) {
    return params.taxonomyKey;
  }

  const aliasMatched = JOB_FAMILY_HINT_ALIAS[hintFamily];
  if (aliasMatched) {
    return aliasMatched;
  }

  const byKey = JOB_FAMILY_DEFINITIONS.find(
    (item) => normalizeJobTitle(item.key) === normalizedHint,
  );
  if (byKey) {
    return byKey.key;
  }

  const byLabel = JOB_FAMILY_DEFINITIONS.find(
    (item) => normalizeJobTitle(item.label) === normalizedHint,
  );
  if (byLabel) {
    return byLabel.key;
  }

  const resolvedByHintText = resolveJobFamilyByTitle(hintFamily);
  if (resolvedByHintText.key !== "business") {
    return resolvedByHintText.key;
  }

  return params.taxonomyKey;
}

function bucketItemsByFrequency(itemsByPosting: string[][]): {
  core: string[];
  common: string[];
  bonus: string[];
} {
  const total = itemsByPosting.length;
  if (total === 0) {
    return { core: [], common: [], bonus: [] };
  }

  const counter = new Map<string, number>();
  for (const postingItems of itemsByPosting) {
    for (const item of uniqueItems(postingItems)) {
      const key = item.toLowerCase();
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
  }

  const entries = Array.from(counter.entries()).map(([key, count]) => ({
    key,
    count,
    ratio: count / total,
  }));
  entries.sort((a, b) => b.ratio - a.ratio || b.count - a.count || a.key.localeCompare(b.key));

  const toDisplay = (value: string): string => value;
  const core = entries.filter((item) => item.ratio >= 0.7).map((item) => toDisplay(item.key));
  const common = entries
    .filter((item) => item.ratio >= 0.3 && item.ratio < 0.7)
    .map((item) => toDisplay(item.key));
  const bonus = entries
    .filter((item) => item.ratio >= 0.1 && item.ratio < 0.3)
    .map((item) => toDisplay(item.key));

  return { core, common, bonus };
}

function buildCanonicalSummary(input: {
  normalizedTitle: string;
  responsibilities: string[];
  coreSkills: string[];
  commonSkills: string[];
  bonusSkills: string[];
  levelBand: number;
}): CanonicalRoleSummary {
  const levelDescriptor = getLevelDescriptor(input.levelBand);
  const coreRequirements = [...input.coreSkills, ...input.commonSkills].slice(0, 8);
  const entryPath = [
    input.levelBand >= 4
      ? `具备 ${coreRequirements.slice(0, 3).join("、") || "系统设计能力"}，可主导关键模块技术决策`
      : `优先具备 ${coreRequirements.slice(0, 3).join("、") || "基础开发能力"}`,
    input.levelBand >= 4
      ? "通过复杂项目沉淀领域方法论与技术标准"
      : "通过中小型项目积累完整交付经验",
    input.levelBand >= 4
      ? "在跨团队协同中扩大技术影响力并承担培养职责"
      : "补齐工程化与协作规范后进入稳定产出阶段",
  ];
  const developmentDirections = [
    input.levelBand >= 4
      ? `${input.normalizedTitle}（技术专家）`
      : `${input.normalizedTitle}（进阶）`,
    input.levelBand >= 4
      ? `${input.normalizedTitle}（架构负责人）`
      : `${input.normalizedTitle}（骨干）`,
    input.levelBand >= 4
      ? `${input.normalizedTitle}（技术管理方向）`
      : `${input.normalizedTitle}（负责人方向）`,
  ];

  return {
    role_overview: `${input.normalizedTitle}${levelDescriptor.label}岗位主要聚焦${levelDescriptor.overviewFocus}，强调${levelDescriptor.growthKeyword}。`,
    core_responsibilities: input.responsibilities.slice(0, 5),
    core_requirements: coreRequirements,
    bonus_items: input.bonusSkills.slice(0, 5),
    entry_path: entryPath,
    development_directions: developmentDirections,
  };
}

/**
 * 作用：将同类 posting facts 聚合为标准岗位画像草稿。
 * 参数：factsList 为同一标准岗位分组下的事实列表。
 * 返回：用于后续 canonical role 入库或总结的聚合草稿。
 */
export function buildCanonicalRoleProfile(
  factsList: PostingProfileFacts[],
): CanonicalRoleProfileDraft {
  if (factsList.length === 0) {
    throw new Error("CANONICAL_FACTS_EMPTY");
  }

  const sorted = [...factsList].sort((a, b) => b.confidence - a.confidence);
  const anchor = sorted[0];
  const levelBandNumber = resolveDominantLevelBand(sorted.map((item) => item.job_level));
  const levelBand = `L${levelBandNumber}`;

  const rawSkillBuckets = bucketItemsByFrequency(sorted.map((item) => item.required_skills));
  const skillBuckets = resolveCanonicalSkillBuckets({
    jobFamily: anchor.job_family,
    core: rawSkillBuckets.core,
    common: rawSkillBuckets.common,
    bonus: rawSkillBuckets.bonus,
    levelBand: levelBandNumber,
  });
  const toolBuckets = bucketItemsByFrequency(sorted.map((item) => item.tools));
  // 只保留可解释软技能白名单，避免把情绪化或口号类词汇写入标准岗位画像。
  const softBuckets = bucketItemsByFrequency(
    sorted.map((item) =>
      item.soft_skills.filter((skill) =>
        CANONICAL_SOFT_SKILL_WHITELIST.some(
          (allowed) => skill.toLowerCase() === allowed.toLowerCase(),
        ),
      ),
    ),
  );

  const responsibilities = resolveCanonicalResponsibilities({
    existingResponsibilities: uniqueItems(sorted.flatMap((item) => item.responsibilities)).slice(
      0,
      8,
    ),
    normalizedTitle: anchor.normalized_title,
    levelBand: levelBandNumber,
  });
  const coreTools = resolveCanonicalTools(
    anchor.job_family,
    toolBuckets.core.length > 0 ? toolBuckets.core : toolBuckets.common,
  );
  const softSkills = resolveCanonicalSoftSkills(
    softBuckets.core.length > 0 ? softBuckets.core : softBuckets.common,
  );
  const confidence = clampConfidence(
    sorted.reduce((sum, item) => sum + item.confidence, 0) / Math.max(sorted.length, 1),
  );
  const summary = buildCanonicalSummary({
    normalizedTitle: anchor.normalized_title,
    responsibilities,
    coreSkills: skillBuckets.core,
    commonSkills: skillBuckets.common,
    bonusSkills: skillBuckets.bonus,
    levelBand: levelBandNumber,
  });

  return {
    role_key: `${anchor.job_family}|${anchor.normalized_title}|${levelBand}`,
    canonical_version: 1,
    content_hash: "",
    normalized_title: anchor.normalized_title,
    job_family: anchor.job_family,
    level_band: levelBand,
    sample_size: sorted.length,
    core_required_skills: skillBuckets.core,
    common_required_skills: skillBuckets.common,
    bonus_required_skills: skillBuckets.bonus,
    core_tools: coreTools,
    soft_skills: softSkills,
    representative_responsibilities: responsibilities,
    summary_version: "v1",
    summary,
    confidence,
  };
}

/**
 * 作用：将 posting facts 按标准岗位键分组，用于后续 canonical 聚合。
 * 分组键：job_family + normalized_title + level_band。
 */
export function groupPostingFactsByRole(
  factsList: PostingProfileFacts[],
): Map<string, PostingProfileFacts[]> {
  const eligibleFacts = factsList.filter((item) => isPostingFactEligibleForCanonical(item));
  const grouped = new Map<string, PostingProfileFacts[]>();
  for (const item of eligibleFacts) {
    const roleKey = `${item.job_family}|${item.normalized_title}|L${toCanonicalLevelBand(item.job_level)}`;
    const existing = grouped.get(roleKey);
    if (existing) {
      existing.push(item);
      continue;
    }
    grouped.set(roleKey, [item]);
  }
  return grouped;
}

/**
 * 作用：判断单条 posting facts 是否满足 canonical 聚合入组资格。
 * 规则：置信度达到阈值，且至少有一条可追溯证据。
 */
export function isPostingFactEligibleForCanonical(item: PostingProfileFacts): boolean {
  return item.confidence >= CANONICAL_MIN_CONFIDENCE && item.evidence.length > 0;
}

/**
 * 作用：抽取岗位帖事实（posting facts），用于后续 canonical role 聚合。
 * 参数：job 为单条岗位记录；hint 为标准化提示信息。
 * 返回：带证据的结构化事实。
 * 注意：该函数只提取“可证据化字段”，不会生成自由文本画像。
 */
export function extractPostingProfileFacts(
  job: JobRecord,
  hint: JobProfileNormalizationHint = {},
): PostingProfileFacts {
  const sourceText = [job.title, job.job_description, job.company_intro].filter(Boolean).join("\n");
  const description = (job.job_description || "").trim();
  const taxonomyFamily = resolveJobFamilyByTitle(job.title);
  const sentences = splitSentences(description);
  const requiredSkills = extractByKeywords(sourceText, SKILL_KEYWORDS);
  const tools = extractByKeywords(sourceText, TOOL_KEYWORDS);
  const certificates = extractByKeywords(sourceText, CERTIFICATE_KEYWORDS);
  const softSkills = extractByKeywords(sourceText, SOFT_SKILL_KEYWORDS);

  const educationRequirement =
    pickEvidenceSentence(sentences, EDUCATION_KEYWORDS) ||
    EDUCATION_KEYWORDS.find((item) => sourceText.includes(item)) ||
    "";
  const experienceRequirement =
    sentences.find((sentence) => EXPERIENCE_PATTERNS.some((pattern) => pattern.test(sentence))) ||
    "";

  const evidence: PostingEvidenceItem[] = [];
  const pushEvidence = (
    field: PostingEvidenceField,
    text: string | null,
    source: PostingEvidenceItem["source"] = "job_description",
  ): void => {
    if (!text?.trim()) {
      return;
    }
    evidence.push({
      field,
      text: text.trim(),
      source,
    });
  };

  pushEvidence("required_skills", pickEvidenceSentence(sentences, requiredSkills));
  pushEvidence("tools", pickEvidenceSentence(sentences, tools));
  pushEvidence("certificates", pickEvidenceSentence(sentences, certificates));
  pushEvidence("soft_skills", pickEvidenceSentence(sentences, softSkills));
  pushEvidence("education_requirement", educationRequirement || null);
  pushEvidence("experience_requirement", experienceRequirement || null);

  // 数据源里 job_description 可能为空，若不回填最小证据会导致 canonical 聚合全量被过滤。
  if (evidence.length === 0) {
    if (job.title.trim()) {
      pushEvidence("required_skills", job.title, "title");
    } else if (description) {
      pushEvidence("required_skills", sentences[0] || description, "job_description");
    } else if (job.company_intro?.trim()) {
      pushEvidence("required_skills", job.company_intro, "company_intro");
    }
  }

  const signalCount =
    requiredSkills.length +
    tools.length +
    certificates.length +
    softSkills.length +
    (educationRequirement ? 1 : 0) +
    (experienceRequirement ? 1 : 0);
  const evidenceCoverage = signalCount > 0 ? evidence.length / signalCount : 0;
  const confidence =
    signalCount === 0
      ? 0.35
      : clampConfidence(0.45 + Math.min(requiredSkills.length, 6) * 0.05 + evidenceCoverage * 0.25);

  return {
    job_id: job.id,
    normalized_title: hint.normalized_title_hint?.trim() || job.title.trim(),
    job_family: resolveCanonicalJobFamily({
      hintFamily: hint.normalized_job_family_hint,
      title: job.title,
      taxonomyKey: taxonomyFamily.key,
    }),
    job_level: inferJobLevelWithSignals(job.title, {
      experienceRequirement,
      salaryRange: job.salary_range,
    }),
    responsibilities: description ? splitSentences(description).slice(0, 5) : [],
    required_skills: requiredSkills,
    preferred_skills: [],
    tools,
    certificates,
    education_requirement: educationRequirement,
    experience_requirement: experienceRequirement,
    soft_skills: softSkills,
    industry_context: job.industry ? [job.industry] : [],
    evidence,
    confidence,
  };
}
