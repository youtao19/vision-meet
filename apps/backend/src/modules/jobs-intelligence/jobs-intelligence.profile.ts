import type { JobRecord, JobProfileV2Record } from "@career/contracts/types";

import { inferJobLevel, resolveJobFamilyByTitle } from "./jobs-intelligence.taxonomy.js";

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
