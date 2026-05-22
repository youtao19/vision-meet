/**
 * 文件作用：承载学生画像领域核心业务逻辑。
 * 边界说明：service 负责字段归一、证据过滤、评分、摘要和落库编排；简历图片解析的 prompt/Agent 调用放在 pi-tools/profile。
 */

import type {
  CreateStudentProfileFromResumeRequest,
  CreateStudentProfileRequest,
  DimensionScores,
  ListStudentProfilesResponse,
  StudentProfileCertificate,
  StudentProfileEducation,
  StudentProfileEvaluation,
  StudentProfileEvidence,
  StudentProfileExperienceItem,
  StudentProfileParseMeta,
  StudentProfilePreference,
  StudentProfileRecord,
  StudentProfileSelfAssessment,
  StudentProfileSkill,
} from "@career/contracts/types";

import type { AppEnv } from "../../shared/config/env.js";
import { buildSha256Digest } from "../../shared/utils/match-fingerprint.js";
import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { AgentExtractedProfile } from "../pi-tools/profile/parse-resume-profile.parser.js";
import { parseResumeProfileWithPi } from "../pi-tools/profile/parse-resume-profile.generator.js";
import type { ProfileRepository, StudentProfileCreateInput } from "./profile.repository.js";

/**
 * 学生画像服务接口。
 * 逻辑：对外提供列表、表单创建和简历创建三条业务能力。
 */
export interface ProfileService {
  listProfiles(): Promise<ListStudentProfilesResponse>;
  createProfile(input: CreateStudentProfileRequest): Promise<StudentProfileRecord>;
  createProfileFromResume(
    input: CreateStudentProfileFromResumeRequest,
  ): Promise<StudentProfileRecord>;
}

/**
 * 简历画像创建后的回调。
 * 逻辑：用于把创建成功的画像通知其他模块；当前 service 不关心 hook 的具体副作用。
 */
export type ResumeProfileCreatedHook = (params: {
  profile: StudentProfileRecord;
  resumeInput: CreateStudentProfileFromResumeRequest;
}) => Promise<void> | void;

/**
 * service 运行时依赖。
 * 逻辑：env/cwd 给 Pi 能力使用，jobsRepository 用于目标岗位标准化，hook 用于创建后通知。
 */
type ProfileRuntimeOptions = {
  env?: AppEnv;
  cwd?: string;
  jobsRepository?: JobsRepository;
  onResumeProfileCreated?: ResumeProfileCreatedHook;
};

const DEFAULT_SELF_ASSESSMENT: StudentProfileSelfAssessment = {
  communication: 3,
  learning: 3,
  stress_tolerance: 3,
  innovation: 3,
};

const SCORE_WEIGHTS = {
  base_requirements: 0.2,
  professional_skills: 0.45,
  professional_quality: 0.2,
  development_potential: 0.15,
};

const SENSITIVE_EVIDENCE_FIELD_PATTERN =
  /(phone|mobile|tel|email|mail|qq|wechat|weixin|id_card|identity|contact|电话|邮箱|身份证|微信|联系方式)/i;
const SENSITIVE_EVIDENCE_QUOTE_PATTERN =
  /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(1[3-9]\d{9})/i;
const PROFILE_EVIDENCE_FIELD_PATTERN =
  /^(basic_info\.name|preference\.|education|skills|certificates|experiences|self_assessment|summary)/;

/**
 * 限制百分制分数范围。
 * 逻辑：所有评分最终都收敛到 0-100 的整数，避免前端展示异常值。
 */
function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * 限制 1-5 等级范围。
 * 逻辑：Agent 或表单可能给字符串/小数/越界值，这里统一转成画像评分可用的整数等级。
 */
function clampLevel(value: unknown, fallback = 3): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(5, Math.round(parsed)));
}

/**
 * 去除空字符串和重复项。
 * 逻辑：保留第一次出现的原始写法，用小写 key 去重，适合技能、城市、行业和 warning 列表。
 */
function uniqueNonEmpty(items: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const normalized = item?.trim();
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

/**
 * 把未知输入转成文本数组。
 * 逻辑：数组直接逐项清洗；字符串按中文分号、英文分号或换行拆分，用于兼容 Agent 常见输出。
 */
function toTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueNonEmpty(value.map((item) => String(item)));
  }
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }
  return uniqueNonEmpty(normalized.split(/[；;\n]+/));
}

/**
 * 规范化单个文本字段。
 * 逻辑：非字符串视为空值，字符串压缩空白后为空也视为空值。
 */
function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

/**
 * 规范化证据引用 ID。
 * 逻辑：只有数组才会被接收，并复用统一去重规则。
 */
function normalizeEvidenceRefs(refs: unknown): string[] {
  return Array.isArray(refs) ? uniqueNonEmpty(refs.map((item) => String(item))) : [];
}

/**
 * 补齐证据 ID。
 * 逻辑：Agent 可能不给 id，按顺序生成 ev-1 这类稳定 ID，方便字段引用。
 */
function ensureEvidenceIds(evidences: StudentProfileEvidence[]): StudentProfileEvidence[] {
  return evidences.map((item, index) => ({
    ...item,
    id: item.id || `ev-${index + 1}`,
  }));
}

/**
 * 判断证据是否包含敏感信息。
 * 逻辑：字段路径命中联系方式类字段，或引用原文看起来像邮箱/手机号时，都不进入画像展示证据。
 */
function isSensitiveEvidence(evidence: StudentProfileEvidence): boolean {
  return (
    SENSITIVE_EVIDENCE_FIELD_PATTERN.test(evidence.field_path) ||
    SENSITIVE_EVIDENCE_QUOTE_PATTERN.test(evidence.quote)
  );
}

/**
 * 判断证据字段是否属于画像主体。
 * 逻辑：只保留画像相关字段路径，丢弃联系方式、附件元数据等不参与画像解释的内容。
 */
function isProfileEvidenceField(fieldPath: string): boolean {
  return PROFILE_EVIDENCE_FIELD_PATTERN.test(fieldPath);
}

/**
 * 规范化证据列表。
 * 逻辑：清洗 id/source/field_path/quote/confidence，再过滤空证据、非画像字段和敏感证据。
 */
function normalizeEvidences(input?: StudentProfileEvidence[]): StudentProfileEvidence[] {
  return ensureEvidenceIds(
    (input || [])
      .map((item, index) => ({
        id: normalizeText(item.id) || `ev-${index + 1}`,
        source: item.source || "manual",
        field_path: normalizeText(item.field_path) || "profile",
        quote: normalizeText(item.quote) || "",
        confidence: clampScore((item.confidence || 0.6) * 100) / 100,
      }))
      .filter((item) => item.quote && isProfileEvidenceField(item.field_path) && !isSensitiveEvidence(item)),
  );
}

/**
 * 创建表单录入证据。
 * 逻辑：手动创建画像没有原始简历证据，就用用户填写的关键字段生成可解释证据片段。
 */
function createManualEvidence(fieldPath: string, quote: string, index: number): StudentProfileEvidence {
  return {
    id: `manual-${index}`,
    source: "manual",
    field_path: fieldPath,
    quote,
    confidence: 1,
  };
}

/**
 * 为手动画像生成默认证据。
 * 逻辑：从姓名、目标岗位、教育、技能、经历和证书中挑选非空字段，转成统一 evidence 结构。
 */
function buildManualEvidences(input: CreateStudentProfileRequest): StudentProfileEvidence[] {
  const quotes = [
    [input.basic_info.name, "basic_info.name"],
    [input.preference.target_role, "preference.target_role"],
    [input.education.school || "", "education.school"],
    [input.education.major || "", "education.major"],
    [input.education.level || "", "education.level"],
    [input.skills.map((item) => item.name).join("、"), "skills"],
    [(input.experiences || []).map((item) => item.title).join("、"), "experiences"],
    [(input.certificates || []).map((item) => item.name).join("、"), "certificates"],
  ];

  return quotes
    .filter(([quote]) => quote && quote.trim())
    .map(([quote, fieldPath], index) => createManualEvidence(fieldPath, quote, index + 1));
}

/**
 * 规范化教育信息。
 * 逻辑：允许学校、学历、专业和毕业年份缺失；毕业年份只接收合理年份，证据引用保持数组。
 */
function normalizeEducation(input?: Partial<StudentProfileEducation>): StudentProfileEducation {
  return {
    school: normalizeText(input?.school) || null,
    level: normalizeText(input?.level) || null,
    major: normalizeText(input?.major) || null,
    graduation_year:
      typeof input?.graduation_year === "number" && input.graduation_year >= 2000
        ? input.graduation_year
        : null,
    evidence_refs: normalizeEvidenceRefs(input?.evidence_refs),
  };
}

/**
 * 规范化求职偏好。
 * 逻辑：目标岗位保留单值字符串，城市和行业做去重清洗。
 */
function normalizePreference(input: StudentProfilePreference): StudentProfilePreference {
  return {
    target_role: normalizeText(input.target_role) || "",
    preferred_cities: uniqueNonEmpty(input.preferred_cities || []),
    preferred_industries: uniqueNonEmpty(input.preferred_industries || []),
  };
}

/**
 * 规范化技能列表。
 * 逻辑：丢弃无名称技能，分类缺省为 other，等级收敛到 1-5。
 */
function normalizeSkills(input?: StudentProfileSkill[]): StudentProfileSkill[] {
  return (input || [])
    .map((item) => ({
      name: normalizeText(item.name) || "",
      category: item.category || "other",
      level: clampLevel(item.level),
      evidence_refs: normalizeEvidenceRefs(item.evidence_refs),
    }))
    .filter((item) => item.name);
}

/**
 * 规范化证书列表。
 * 逻辑：证书名称必需，发证方和获得时间缺失时写 null，避免空字符串污染结构。
 */
function normalizeCertificates(input?: StudentProfileCertificate[]): StudentProfileCertificate[] {
  return (input || [])
    .map((item) => ({
      name: normalizeText(item.name) || "",
      issuer: normalizeText(item.issuer) || null,
      acquired_at: normalizeText(item.acquired_at) || null,
      evidence_refs: normalizeEvidenceRefs(item.evidence_refs),
    }))
    .filter((item) => item.name);
}

/**
 * 从对象中按候选 key 读取第一个有效字符串。
 * 逻辑：用于兼容 Agent 可能输出的 description/name/project_name 等别名字段。
 */
function readStringField(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizeText(source[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

/**
 * 从对象中按候选 key 读取第一个有效字符串数组。
 * 逻辑：数组和分号/换行分隔字符串都能被归一成数组，提升模型输出容错性。
 */
function readStringListField(source: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = toTextList(source[key]);
    if (value.length > 0) {
      return value;
    }
  }
  return [];
}

/**
 * 规范化经历类型。
 * 逻辑：优先识别实习和竞赛关键词，无法识别时按项目经历处理。
 */
function normalizeExperienceKind(value: unknown): StudentProfileExperienceItem["kind"] {
  const normalized = normalizeText(value)?.toLowerCase() || "";
  if (normalized.includes("intern") || normalized.includes("实习")) {
    return "internship";
  }
  if (normalized.includes("competition") || normalized.includes("竞赛") || normalized.includes("比赛")) {
    return "competition";
  }
  return "project";
}

/**
 * 规范化项目、实习和竞赛经历。
 * 逻辑：兼容模型常见别名字段，把描述并入 responsibilities，把成果类字段并入 outcomes。
 */
function normalizeExperiences(input?: unknown[]): StudentProfileExperienceItem[] {
  return (input || [])
    .map((raw) => {
      const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const description = readStringField(item, ["description", "project_intro", "intro", "summary"]);
      return {
        kind: normalizeExperienceKind(readStringField(item, ["kind", "type", "category"])),
        title: readStringField(item, ["title", "name", "project_name", "experience_name"]) || "",
        organization: readStringField(item, ["organization", "company", "school", "team"]),
        role: readStringField(item, ["role", "position", "job_role", "duty_role"]),
        period: readStringField(item, ["period", "time", "date_range", "duration"]),
        tech_stack: readStringListField(item, ["tech_stack", "technologies", "stack", "tools"]),
        // 模型有时把项目介绍放在 description，这里并入职责，避免经历标题存在但内容丢失。
        responsibilities: uniqueNonEmpty([
          ...readStringListField(item, ["responsibilities", "duties", "work"]),
          ...(description ? [description] : []),
        ]),
        outcomes: readStringListField(item, ["outcomes", "achievements", "highlights", "results"]),
        evidence_refs: normalizeEvidenceRefs(item.evidence_refs),
      };
    })
    .filter((item) => item.title);
}

/**
 * 规范化自评能力。
 * 逻辑：缺失项按默认 3 分处理，已填写项统一限制在 1-5。
 */
function normalizeSelfAssessment(
  input?: Partial<StudentProfileSelfAssessment>,
): StudentProfileSelfAssessment {
  return {
    communication: clampLevel(input?.communication, DEFAULT_SELF_ASSESSMENT.communication),
    learning: clampLevel(input?.learning, DEFAULT_SELF_ASSESSMENT.learning),
    stress_tolerance: clampLevel(input?.stress_tolerance, DEFAULT_SELF_ASSESSMENT.stress_tolerance),
    innovation: clampLevel(input?.innovation, DEFAULT_SELF_ASSESSMENT.innovation),
  };
}

/**
 * 将 1-5 等级映射为百分制分数。
 * 逻辑：四维评分内部统一用 0-100 分计算。
 */
function levelToScore(level: number): number {
  return clampScore(level * 20);
}

/**
 * 计算画像四维评分。
 * 逻辑：基础要求看教育和证书，职业技能看技能等级、项目和实习，职业素养看沟通/抗压，
 * 发展潜力看学习/创新并叠加竞赛经历。
 */
function calculateDimensionScores(params: {
  education: StudentProfileEducation;
  skills: StudentProfileSkill[];
  certificates: StudentProfileCertificate[];
  experiences: StudentProfileExperienceItem[];
  selfAssessment: StudentProfileSelfAssessment;
}): DimensionScores {
  const projectCount = params.experiences.filter((item) => item.kind === "project").length;
  const internshipCount = params.experiences.filter((item) => item.kind === "internship").length;
  const competitionCount = params.experiences.filter((item) => item.kind === "competition").length;
  const skillAverage =
    params.skills.length > 0
      ? params.skills.reduce((sum, item) => sum + item.level, 0) / params.skills.length
      : 0;

  return {
    // 基础要求采用保底分加资料完备项，避免缺少证书时直接归零。
    base_requirements: clampScore(
      30 +
        (params.education.level ? 15 : 0) +
        (params.education.major ? 15 : 0) +
        (params.education.graduation_year ? 10 : 0) +
        Math.min(params.certificates.length * 10, 30),
    ),
    // 职业技能更重视技能等级和真实经历数量，是竞争力评分里权重最高的一维。
    professional_skills: clampScore(
      25 + skillAverage * 12 + Math.min(projectCount * 8, 24) + Math.min(internshipCount * 8, 16),
    ),
    professional_quality: clampScore(
      (levelToScore(params.selfAssessment.communication) +
        levelToScore(params.selfAssessment.stress_tolerance)) /
        2,
    ),
    development_potential: clampScore(
      (levelToScore(params.selfAssessment.learning) +
        levelToScore(params.selfAssessment.innovation)) /
        2 +
        Math.min(competitionCount * 8, 16),
    ),
  };
}

/**
 * 计算完整度、竞争力和缺失项。
 * 逻辑：先按关键字段生成 missing_items，再用四维评分按权重合成竞争力分。
 */
function calculateEvaluation(params: {
  education: StudentProfileEducation;
  skills: StudentProfileSkill[];
  certificates: StudentProfileCertificate[];
  experiences: StudentProfileExperienceItem[];
  selfAssessment: StudentProfileSelfAssessment;
  evidences: StudentProfileEvidence[];
  parseWarnings?: string[];
}): StudentProfileEvaluation {
  const missingItems: string[] = [];
  if (!params.education.level) missingItems.push("education.level");
  if (!params.education.major) missingItems.push("education.major");
  if (!params.education.graduation_year) missingItems.push("education.graduation_year");
  if (params.skills.length === 0) missingItems.push("skills");
  if (params.experiences.length === 0) missingItems.push("experiences");
  if (params.certificates.length === 0) missingItems.push("certificates");
  if (params.evidences.length === 0) missingItems.push("evidences");

  const totalChecks = 7;
  const dimensionScores = calculateDimensionScores(params);
  const completenessScore = clampScore(((totalChecks - missingItems.length) / totalChecks) * 100);
  const competitivenessScore = clampScore(
    dimensionScores.base_requirements * SCORE_WEIGHTS.base_requirements +
      dimensionScores.professional_skills * SCORE_WEIGHTS.professional_skills +
      dimensionScores.professional_quality * SCORE_WEIGHTS.professional_quality +
      dimensionScores.development_potential * SCORE_WEIGHTS.development_potential,
  );

  return {
    dimension_scores: dimensionScores,
    completeness_score: completenessScore,
    competitiveness_score: competitivenessScore,
    missing_items: missingItems,
    warnings: params.parseWarnings || [],
  };
}

/**
 * 生成画像摘要。
 * 逻辑：用户或 Agent 已给 summary 时优先使用；否则基于姓名、目标岗位、经历数、技能和评分生成一句概览。
 */
function buildSummary(params: {
  name: string;
  targetRole: string;
  skills: StudentProfileSkill[];
  experiences: StudentProfileExperienceItem[];
  evaluation: StudentProfileEvaluation;
  providedSummary?: string;
}): string {
  const provided = normalizeText(params.providedSummary);
  if (provided) {
    return provided;
  }

  const skillPreview = params.skills
    .slice(0, 5)
    .map((item) => item.name)
    .join("、");
  const targetText = params.targetRole ? `目标岗位为 ${params.targetRole}，` : "";
  return `${params.name} ${targetText}已沉淀 ${params.experiences.length} 段经历${
    skillPreview ? `，核心技能包括 ${skillPreview}` : ""
  }。画像完整度 ${params.evaluation.completeness_score}，竞争力 ${params.evaluation.competitiveness_score}。`;
}

/**
 * 从证据字段反推经历列表。
 * 逻辑：当 Agent 没有直接返回 experiences，但返回了 experiences[0].title 这类证据路径时，
 * 按索引聚合证据并尽量恢复项目经历，避免简历项目被完全丢弃。
 */
function buildExperiencesFromEvidences(evidences: StudentProfileEvidence[]): StudentProfileExperienceItem[] {
  const grouped = new Map<number, Record<string, string>>();
  const fieldPattern = /^experiences\[(\d+)\]\.([a-z_]+)$/i;

  for (const evidence of evidences) {
    const match = evidence.field_path.match(fieldPattern);
    if (!match?.[1] || !match[2]) {
      continue;
    }
    const index = Number(match[1]);
    if (!Number.isInteger(index)) {
      continue;
    }
    const current = grouped.get(index) || {};
    current[match[2]] = evidence.quote;
    grouped.set(index, current);
  }

  return normalizeExperiences(
    Array.from(grouped.entries())
      .sort(([left], [right]) => left - right)
      .map(([, item]) => ({
        kind: "project",
        title: item.title || item.name || item.project_name,
        role: item.role,
        responsibilities: item.description,
        outcomes: item.achievements || item.outcomes,
        tech_stack: item.tech_stack,
      })),
  );
}

/**
 * 将 Agent 抽取结果映射为标准画像创建输入。
 * 逻辑：先清洗证据和经历，再补齐教育、技能、证书、自评等结构；经历为空时尝试从证据恢复。
 */
function toProfileInputFromAgent(extracted: AgentExtractedProfile): CreateStudentProfileRequest {
  const evidences = normalizeEvidences(
    extracted.evidences?.map((item, index) => ({
      id: normalizeText(item.id) || `ev-${index + 1}`,
      source: item.source || "resume_text",
      field_path: item.field_path,
      quote: item.quote,
      confidence: item.confidence ?? 0.7,
    })) as StudentProfileEvidence[],
  );
  const experiences = normalizeExperiences(extracted.experiences as unknown[]);

  return {
    basic_info: {
      name: normalizeText(extracted.basic_info.name) || "匿名候选人",
    },
    preference: {
      target_role: normalizeText(extracted.preference?.target_role) || "",
      preferred_cities: uniqueNonEmpty(extracted.preference?.preferred_cities || []),
      preferred_industries: uniqueNonEmpty(extracted.preference?.preferred_industries || []),
    },
    education: normalizeEducation(extracted.education),
    skills: normalizeSkills(extracted.skills as StudentProfileSkill[]),
    certificates: normalizeCertificates(extracted.certificates as StudentProfileCertificate[]),
    experiences: experiences.length > 0 ? experiences : buildExperiencesFromEvidences(evidences),
    self_assessment: normalizeSelfAssessment(extracted.self_assessment),
    evidences,
    summary: extracted.summary,
  };
}

/**
 * 标准化目标岗位名称。
 * 逻辑：如果注入了岗位仓储，就用岗位库做最佳匹配；未命中时保留原始岗位文本。
 */
async function normalizeTargetRole(
  targetRole: string,
  jobsRepository?: JobsRepository,
): Promise<string> {
  if (!jobsRepository) {
    return targetRole;
  }
  if (!targetRole.trim()) {
    return "";
  }
  const matchedJob = await jobsRepository.findBestJobByTargetRole(targetRole);
  return matchedJob?.title || targetRole;
}

/**
 * 创建并持久化画像记录。
 * 逻辑：这是表单和简历两条入口共用的收口点，统一完成归一化、证据处理、评分、摘要和 repository 写入。
 */
async function createProfileRecord(params: {
  repository: ProfileRepository;
  input: CreateStudentProfileRequest;
  sourceType: "manual" | "resume";
  sourceDigest: string;
  parseMeta: StudentProfileParseMeta;
  jobsRepository?: JobsRepository;
}): Promise<StudentProfileRecord> {
  const basicInfo = {
    name: normalizeText(params.input.basic_info.name) || "匿名候选人",
  };
  const preference = normalizePreference(params.input.preference);
  preference.target_role = await normalizeTargetRole(preference.target_role, params.jobsRepository);

  const education = normalizeEducation(params.input.education);
  const skills = normalizeSkills(params.input.skills);
  const certificates = normalizeCertificates(params.input.certificates);
  const experiences = normalizeExperiences(params.input.experiences);
  const selfAssessment = normalizeSelfAssessment(params.input.self_assessment);
  const evidences = normalizeEvidences(
    params.input.evidences && params.input.evidences.length > 0
      ? params.input.evidences
      : buildManualEvidences(params.input),
  );
  // 评分必须基于最终入库结构计算，确保页面、匹配和报告看到的分数与画像内容一致。
  const evaluation = calculateEvaluation({
    education,
    skills,
    certificates,
    experiences,
    selfAssessment,
    evidences,
    parseWarnings: params.parseMeta.warnings,
  });
  const summary = buildSummary({
    name: basicInfo.name,
    targetRole: preference.target_role,
    skills,
    experiences,
    evaluation,
    providedSummary: params.input.summary,
  });

  const recordInput: StudentProfileCreateInput = {
    source_type: params.sourceType,
    source_digest: params.sourceDigest,
    basic_info: basicInfo,
    preference,
    education,
    skills,
    certificates,
    experiences,
    self_assessment: selfAssessment,
    evidences,
    evaluation,
    parse_meta: params.parseMeta,
    summary,
  };

  return params.repository.createStudentProfile(recordInput);
}

/**
 * 创建学生画像 service。
 * 逻辑：闭包内持有仓储和运行时依赖，对外暴露列表、手动创建和简历创建能力。
 */
export function createProfileService(
  repository: ProfileRepository,
  options: ProfileRuntimeOptions = {},
): ProfileService {
  /**
   * 通过表单创建学生画像。
   * 逻辑：根据表单 payload 计算 source_digest，标记 parser=manual，然后走统一 createProfileRecord。
   */
  async function createProfile(input: CreateStudentProfileRequest): Promise<StudentProfileRecord> {
    const sourceDigest = buildSha256Digest({ source_type: "manual", payload: input });
    return createProfileRecord({
      repository,
      input,
      sourceType: "manual",
      sourceDigest,
      jobsRepository: options.jobsRepository,
      parseMeta: {
        parser: "manual",
        model: null,
        confidence: 1,
        warnings: [],
      },
    });
  }

  /**
   * 通过简历图片创建学生画像。
   * 逻辑：先对上传输入生成摘要指纹，再调用 pi-tools/profile 解析图片为结构化 JSON，
   * 最后覆盖用户手填的姓名/目标岗位候选并走统一画像入库流程。
   */
  async function createProfileFromResume(
    input: CreateStudentProfileFromResumeRequest,
  ): Promise<StudentProfileRecord> {
    const digest = buildSha256Digest({
      source_type: "resume",
      file_name: input.file_name,
      file_content: input.file_content,
      file_images: input.file_images?.map((item) => ({
        mimeType: item.mimeType,
        size: item.data.length,
      })),
      target_role: input.target_role,
      name: input.name,
      parse_mode: input.parse_mode ?? "tolerant",
    });
    const { extracted, model } = await parseResumeProfileWithPi({
      input,
      env: options.env,
      cwd: options.cwd,
    });
    const mappedInput = toProfileInputFromAgent(extracted);
    // 用户显式填写的候选信息优先级高于 Agent 识别结果，避免图片 OCR 误读覆盖人工选择。
    if (input.name?.trim()) {
      mappedInput.basic_info.name = input.name.trim();
    }
    if (input.target_role?.trim()) {
      mappedInput.preference.target_role = input.target_role.trim();
    }

    const profile = await createProfileRecord({
      repository,
      input: mappedInput,
      sourceType: "resume",
      sourceDigest: digest,
      jobsRepository: options.jobsRepository,
      parseMeta: {
        parser: "agent",
        model,
        confidence: Math.max(0, Math.min(1, extracted.confidence ?? 0.75)),
        warnings: uniqueNonEmpty(extracted.warnings || []),
      },
    });

    // 创建后 hook 只在画像落库成功后触发，避免下游模块处理失败画像。
    if (options.onResumeProfileCreated) {
      await options.onResumeProfileCreated({ profile, resumeInput: input });
    }
    return profile;
  }

  return {
    listProfiles: async () => repository.listStudentProfiles(),
    createProfile,
    createProfileFromResume,
  };
}
