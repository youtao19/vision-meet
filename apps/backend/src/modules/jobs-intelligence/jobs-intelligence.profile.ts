import type {
  CanonicalRoleProfileDraft,
  CanonicalRoleSummary,
  JobProfileV2Record,
  JobRecord,
  PostingEvidenceField,
  PostingEvidenceRecord,
  PostingProfileFacts,
} from "@career/contracts/types";

export type { CanonicalRoleProfileDraft, PostingEvidenceField, PostingProfileFacts };

import { inferJobLevel, resolveJobFamilyByTitle } from "./jobs-intelligence.taxonomy.js";

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

export type JobProfileDraft = Omit<JobProfileV2Record, "id" | "created_at" | "profile_version">;

export type JobProfileNormalizationHint = {
  normalized_title_hint?: string | null;
  normalized_job_family_hint?: string | null;
  normalization_confidence_hint?: number | null;
};

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

function buildCapabilityScore(source: string, keywords: string[], baseline: number): number {
  const hitCount = keywords.filter((keyword) => source.toLowerCase().includes(keyword.toLowerCase())).length;
  return Math.max(40, Math.min(95, Math.round(baseline + hitCount * 8)));
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
}): CanonicalRoleSummary {
  const coreRequirements = [...input.coreSkills, ...input.commonSkills].slice(0, 8);
  const entryPath = [
    `优先具备 ${coreRequirements.slice(0, 3).join("、") || "基础开发能力"}`,
    "通过中小型项目积累完整交付经验",
    "补齐工程化与协作规范后进入稳定产出阶段",
  ];
  const developmentDirections = [
    `${input.normalizedTitle}（进阶）`,
    `${input.normalizedTitle}（骨干）`,
    `${input.normalizedTitle}（负责人方向）`,
  ];

  return {
    role_overview: `${input.normalizedTitle}主要负责业务需求落地与高质量交付，强调稳定工程能力与团队协作。`,
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
  const levelBand = `L${anchor.job_level}`;

  const skillBuckets = bucketItemsByFrequency(sorted.map((item) => item.required_skills));
  const toolBuckets = bucketItemsByFrequency(sorted.map((item) => item.tools));
  // 只保留可解释软技能白名单，避免把情绪化或口号类词汇写入标准岗位画像。
  const softBuckets = bucketItemsByFrequency(
    sorted.map((item) =>
      item.soft_skills.filter((skill) =>
        CANONICAL_SOFT_SKILL_WHITELIST.some((allowed) => skill.toLowerCase() === allowed.toLowerCase()),
      ),
    ),
  );

  const responsibilities = uniqueItems(sorted.flatMap((item) => item.responsibilities)).slice(0, 8);
  const confidence = clampConfidence(
    sorted.reduce((sum, item) => sum + item.confidence, 0) / Math.max(sorted.length, 1),
  );
  const summary = buildCanonicalSummary({
    normalizedTitle: anchor.normalized_title,
    responsibilities,
    coreSkills: skillBuckets.core,
    commonSkills: skillBuckets.common,
    bonusSkills: skillBuckets.bonus,
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
    core_tools: toolBuckets.core.length > 0 ? toolBuckets.core : toolBuckets.common,
    soft_skills: softBuckets.core.length > 0 ? softBuckets.core : softBuckets.common,
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
  const eligibleFacts = factsList.filter(
    (item) => item.confidence >= 0.5 && item.evidence.length > 0,
  );
  const grouped = new Map<string, PostingProfileFacts[]>();
  for (const item of eligibleFacts) {
    const roleKey = `${item.job_family}|${item.normalized_title}|L${item.job_level}`;
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
    (EDUCATION_KEYWORDS.find((item) => sourceText.includes(item)) || "");
  const experienceRequirement =
    sentences.find((sentence) => EXPERIENCE_PATTERNS.some((pattern) => pattern.test(sentence))) || "";

  const evidence: PostingEvidenceItem[] = [];
  const pushEvidence = (field: PostingEvidenceField, text: string | null): void => {
    if (!text?.trim()) {
      return;
    }
    evidence.push({
      field,
      text: text.trim(),
      source: "job_description",
    });
  };

  pushEvidence("required_skills", pickEvidenceSentence(sentences, requiredSkills));
  pushEvidence("tools", pickEvidenceSentence(sentences, tools));
  pushEvidence("certificates", pickEvidenceSentence(sentences, certificates));
  pushEvidence("soft_skills", pickEvidenceSentence(sentences, softSkills));
  pushEvidence("education_requirement", educationRequirement || null);
  pushEvidence("experience_requirement", experienceRequirement || null);

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
    job_family: hint.normalized_job_family_hint?.trim() || taxonomyFamily.key,
    job_level: inferJobLevel(job.title),
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

/**
 * 基于规则快速提取岗位画像草稿，作为 LLM 不可用时的稳定降级输出。
 */
export function generateHeuristicJobProfile(
  job: JobRecord,
  hint: JobProfileNormalizationHint = {},
): JobProfileDraft {
  const source = [job.title, job.job_description, job.company_intro, job.industry]
    .filter(Boolean)
    .join("\n");
  const taxonomyFamily = resolveJobFamilyByTitle(job.title);
  const familyKey = hint.normalized_job_family_hint?.trim() || taxonomyFamily.key;
  const normalizedTitle = hint.normalized_title_hint?.trim() || job.title.trim();
  const jobLevel = inferJobLevel(job.title);

  const professionalSkills = extractByKeywords(source, SKILL_KEYWORDS);
  const certificateRequirements = extractByKeywords(source, CERTIFICATE_KEYWORDS);
  const normalizedSkills =
    professionalSkills.length > 0 ? professionalSkills : taxonomyFamily.baselineSkills;

  const innovationScore = buildCapabilityScore(source, ["创新", "探索", "优化", "方案"], 55);
  const learningScore = buildCapabilityScore(source, ["学习", "成长", "自驱", "快速适应"], 58);
  const stressToleranceScore = buildCapabilityScore(source, ["抗压", "高并发", "高压力", "多任务"], 52);
  const communicationScore = buildCapabilityScore(source, ["沟通", "协作", "跨部门", "汇报"], 60);
  const internshipScore = buildCapabilityScore(source, ["实习", "项目经历", "交付", "落地"], 50);

  return {
    job_id: job.id,
    normalized_title: normalizedTitle,
    job_family: familyKey,
    job_level: jobLevel,
    professional_skills: normalizedSkills,
    certificate_requirements: certificateRequirements,
    innovation_score: innovationScore,
    learning_score: learningScore,
    stress_tolerance_score: stressToleranceScore,
    communication_score: communicationScore,
    internship_score: internshipScore,
    summary: `岗位【${job.title}】画像：重点技能 ${normalizedSkills.slice(0, 6).join("、") || "待补充"}。`,
    confidence: normalizedSkills.length >= 6 ? 0.88 : normalizedSkills.length >= 4 ? 0.78 : 0.66,
    generation_model: null,
    generation_mode: "heuristic",
    extracted_features: {
      source_signals: normalizedSkills.length + certificateRequirements.length,
      normalization_confidence_hint: hint.normalization_confidence_hint ?? null,
    },
  };
}
