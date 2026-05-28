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
import type { AgentExtractedProfile } from "../pi-tools/profile/parse-resume-profile.parser.js";
import { parseResumeProfileWithPi } from "../pi-tools/profile/parse-resume-profile.generator.js";
import type { ProfileRepository, StudentProfileCreateInput } from "./profile.repository.js";

export interface ProfileService {
  listProfiles(): Promise<ListStudentProfilesResponse>;
  createProfile(input: CreateStudentProfileRequest): Promise<StudentProfileRecord>;
  createProfileFromResume(
    input: CreateStudentProfileFromResumeRequest,
  ): Promise<StudentProfileRecord>;
}

export type ResumeProfileCreatedHook = (params: {
  profile: StudentProfileRecord;
  resumeInput: CreateStudentProfileFromResumeRequest;
}) => Promise<void> | void;

type ProfileRuntimeOptions = {
  env?: AppEnv;
  cwd?: string;
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

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampLevel(value: unknown, fallback = 3): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(5, Math.round(parsed)));
}

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

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function normalizeEvidenceRefs(refs: unknown): string[] {
  return Array.isArray(refs) ? uniqueNonEmpty(refs.map((item) => String(item))) : [];
}

function ensureEvidenceIds(evidences: StudentProfileEvidence[]): StudentProfileEvidence[] {
  return evidences.map((item, index) => ({
    ...item,
    id: item.id || `ev-${index + 1}`,
  }));
}

function isSensitiveEvidence(evidence: StudentProfileEvidence): boolean {
  return (
    SENSITIVE_EVIDENCE_FIELD_PATTERN.test(evidence.field_path) ||
    SENSITIVE_EVIDENCE_QUOTE_PATTERN.test(evidence.quote)
  );
}

function isProfileEvidenceField(fieldPath: string): boolean {
  return PROFILE_EVIDENCE_FIELD_PATTERN.test(fieldPath);
}

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

function createManualEvidence(fieldPath: string, quote: string, index: number): StudentProfileEvidence {
  return {
    id: `manual-${index}`,
    source: "manual",
    field_path: fieldPath,
    quote,
    confidence: 1,
  };
}

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

function normalizePreference(input: StudentProfilePreference): StudentProfilePreference {
  return {
    target_role: normalizeText(input.target_role) || "",
    preferred_cities: uniqueNonEmpty(input.preferred_cities || []),
    preferred_industries: uniqueNonEmpty(input.preferred_industries || []),
  };
}

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

function readStringField(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizeText(source[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function readStringListField(source: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = toTextList(source[key]);
    if (value.length > 0) {
      return value;
    }
  }
  return [];
}

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

function levelToScore(level: number): number {
  return clampScore(level * 20);
}

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
    base_requirements: clampScore(
      30 +
        (params.education.level ? 15 : 0) +
        (params.education.major ? 15 : 0) +
        (params.education.graduation_year ? 10 : 0) +
        Math.min(params.certificates.length * 10, 30),
    ),
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

async function createProfileRecord(params: {
  repository: ProfileRepository;
  input: CreateStudentProfileRequest;
  sourceType: "manual" | "resume";
  sourceDigest: string;
  parseMeta: StudentProfileParseMeta;
}): Promise<StudentProfileRecord> {
  const basicInfo = {
    name: normalizeText(params.input.basic_info.name) || "匿名候选人",
  };
  const preference = normalizePreference(params.input.preference);
  preference.target_role = normalizeText(preference.target_role) || "";

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

export function createProfileService(
  repository: ProfileRepository,
  options: ProfileRuntimeOptions = {},
): ProfileService {
  async function createProfile(input: CreateStudentProfileRequest): Promise<StudentProfileRecord> {
    const sourceDigest = buildSha256Digest({ source_type: "manual", payload: input });
    return createProfileRecord({
      repository,
      input,
      sourceType: "manual",
      sourceDigest,
      parseMeta: {
        parser: "manual",
        model: null,
        confidence: 1,
        warnings: [],
      },
    });
  }

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
      parseMeta: {
        parser: "agent",
        model,
        confidence: Math.max(0, Math.min(1, extracted.confidence ?? 0.75)),
        warnings: uniqueNonEmpty(extracted.warnings || []),
      },
    });

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
