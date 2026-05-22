import type {
  StudentProfileCertificate,
  StudentProfileEducation,
  StudentProfileEvidence,
  StudentProfileExperienceItem,
  StudentProfileSelfAssessment,
  StudentProfileSkill,
} from "@career/contracts/types";
import { z } from "zod";

import { HttpError } from "../../../shared/errors/http-error.js";

const nullableTextSchema = z.string().trim().min(1).nullable().default(null);
const textArraySchema = z.array(z.string().trim().min(1)).default([]);
const skillCategorySchema = z.enum([
  "frontend",
  "backend",
  "data",
  "ai",
  "testing",
  "tooling",
  "soft",
  "other",
]);

export const resumeRawSchema = z
  .object({
    basic_info: z
      .object({
        name: nullableTextSchema,
        phone: nullableTextSchema,
        email: nullableTextSchema,
        github: nullableTextSchema,
      })
      .default({}),
    education: z
      .array(
        z.object({
          school: nullableTextSchema,
          major: nullableTextSchema,
          degree: nullableTextSchema,
          start_year: z.coerce.number().int().min(1900).max(2100).nullable().default(null),
          end_year: z.coerce.number().int().min(1900).max(2100).nullable().default(null),
        }),
      )
      .default([]),
    skills: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          category: skillCategorySchema.default("other"),
        }),
      )
      .default([]),
    projects: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          role: nullableTextSchema,
          description: nullableTextSchema,
          tech_stack: textArraySchema,
          responsibilities: textArraySchema,
          outcomes: textArraySchema,
        }),
      )
      .default([]),
    certificates: z
      .array(
        z.union([
          z.string().trim().min(1),
          z.object({
            name: z.string().trim().min(1),
            issuer: nullableTextSchema,
            acquired_at: nullableTextSchema,
          }),
        ]),
      )
      .default([]),
    competitions: z
      .array(
        z.union([
          z.string().trim().min(1),
          z.object({
            name: z.string().trim().min(1),
            award: nullableTextSchema,
            period: nullableTextSchema,
            responsibilities: textArraySchema,
            outcomes: textArraySchema,
          }),
        ]),
      )
      .default([]),
  })
  .strict();

export type ResumeRaw = z.infer<typeof resumeRawSchema>;

export const studentProfileDraftSchema = z
  .object({
    basic_info: z.object({
      name: z.string().trim().min(1),
    }),
    preference: z
      .object({
        target_role: z.string().trim().default(""),
        preferred_cities: textArraySchema,
        preferred_industries: textArraySchema,
      })
      .default({}),
    education: z
      .object({
        school: nullableTextSchema,
        level: nullableTextSchema,
        major: nullableTextSchema,
        graduation_year: z.coerce.number().int().min(1900).max(2100).nullable().default(null),
        evidence_refs: textArraySchema,
      })
      .default({}),
    skills: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          category: skillCategorySchema.default("other"),
          level: z.coerce.number().int().min(1).max(5).default(3),
          evidence_refs: textArraySchema,
        }),
      )
      .default([]),
    certificates: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          issuer: nullableTextSchema,
          acquired_at: nullableTextSchema,
          evidence_refs: textArraySchema,
        }),
      )
      .default([]),
    experiences: z
      .array(
        z.object({
          kind: z.enum(["project", "internship", "competition"]).default("project"),
          title: z.string().trim().min(1),
          organization: nullableTextSchema,
          role: nullableTextSchema,
          period: nullableTextSchema,
          tech_stack: textArraySchema,
          responsibilities: textArraySchema,
          outcomes: textArraySchema,
          evidence_refs: textArraySchema,
        }),
      )
      .default([]),
    self_assessment: z
      .object({
        communication: z.coerce.number().int().min(1).max(5).default(3),
        learning: z.coerce.number().int().min(1).max(5).default(3),
        stress_tolerance: z.coerce.number().int().min(1).max(5).default(3),
        innovation: z.coerce.number().int().min(1).max(5).default(3),
      })
      .default({}),
    evidences: z
      .array(
        z.object({
          id: z.string().trim().min(1).optional(),
          source: z.enum(["manual", "resume_text", "agent"]).default("resume_text"),
          field_path: z.string().trim().min(1),
          quote: z.string().trim().min(1),
          confidence: z.coerce.number().min(0).max(1).default(0.8),
        }),
      )
      .default([]),
    summary: z.string().trim().default(""),
    confidence: z.coerce.number().min(0).max(1).default(0.75),
    warnings: textArraySchema,
  })
  .strict();

export type AgentExtractedProfile = z.infer<typeof studentProfileDraftSchema> & {
  education?: Partial<StudentProfileEducation>;
  skills?: Array<Partial<StudentProfileSkill> & { name: string }>;
  certificates?: Array<Partial<StudentProfileCertificate> & { name: string }>;
  experiences?: Array<Partial<StudentProfileExperienceItem> & { title: string }>;
  self_assessment?: Partial<StudentProfileSelfAssessment>;
  evidences?: Array<Partial<StudentProfileEvidence> & { quote: string; field_path: string }>;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function extractJsonObject(rawText: string): string | null {
  const fenced = rawText.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return rawText.slice(firstBrace, lastBrace + 1).trim();
  }
  return null;
}

export function parseResumeProfileAgentOutput(rawText: string): AgentExtractedProfile {
  return parseStudentProfileAgentOutput(rawText);
}

function formatValidationIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });
}

function parseJsonObject(rawText: string, errorMessage: string): unknown {
  const jsonText = extractJsonObject(rawText);
  if (!jsonText) {
    throw new HttpError(502, "STUDENT_PROFILE_AGENT_OUTPUT_INVALID", errorMessage);
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new HttpError(502, "STUDENT_PROFILE_AGENT_OUTPUT_INVALID", errorMessage, {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export function parseResumeRawAgentOutput(rawText: string): ResumeRaw {
  const parsed = parseJsonObject(rawText, "模型未返回 ResumeRaw JSON");
  const result = resumeRawSchema.safeParse(parsed);
  if (!result.success) {
    throw new HttpError(502, "RESUME_RAW_AGENT_OUTPUT_INVALID", "模型输出不符合 ResumeRaw 结构", {
      issues: formatValidationIssues(result.error),
    });
  }

  return result.data;
}

export function parseStudentProfileAgentOutput(rawText: string): AgentExtractedProfile {
  const parsed = parseJsonObject(rawText, "模型未返回学生画像 JSON");
  const result = studentProfileDraftSchema.safeParse(parsed);
  if (!result.success) {
    throw new HttpError(502, "STUDENT_PROFILE_AGENT_OUTPUT_INVALID", "模型输出不符合学生画像结构", {
      issues: formatValidationIssues(result.error),
    });
  }

  if (!normalizeText(result.data.basic_info.name)) {
    throw new HttpError(502, "STUDENT_PROFILE_AGENT_OUTPUT_INVALID", "模型输出缺少姓名");
  }

  return result.data;
}
