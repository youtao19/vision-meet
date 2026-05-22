/**
 * 文件作用：维护学生画像接口的 zod 入参校验规则。
 * 边界说明：这里只校验请求形状和基础取值范围，不做画像评分或业务推断。
 */

import { z } from "zod";

// evidence_refs 在技能、证书、教育和经历中复用，统一清洗为空数组。
const evidenceRefSchema = z.array(z.string().trim().min(1)).default([]);

/**
 * 证据片段校验。
 * 逻辑：约束来源、字段路径、原文引用和置信度范围，敏感信息过滤放在 service 层统一处理。
 */
export const studentProfileEvidenceSchema = z.object({
  id: z.string().trim().min(1).optional(),
  source: z.enum(["manual", "resume_text", "agent"]).default("manual"),
  field_path: z.string().trim().min(1),
  quote: z.string().trim().min(1),
  confidence: z.coerce.number().min(0).max(1).default(1),
});

/**
 * 技能项校验。
 * 逻辑：技能名称必填，分类和等级允许使用默认值，证据引用保持数组结构。
 */
export const studentProfileSkillSchema = z.object({
  name: z.string().trim().min(1),
  category: z
    .enum(["frontend", "backend", "data", "ai", "testing", "tooling", "soft", "other"])
    .default("other"),
  level: z.coerce.number().int().min(1).max(5).default(3),
  evidence_refs: evidenceRefSchema,
});

/**
 * 证书项校验。
 * 逻辑：证书名称必填，发证方和获得时间允许为空，兼容简历里缺少证书细节的情况。
 */
export const studentProfileCertificateSchema = z.object({
  name: z.string().trim().min(1),
  issuer: z.string().trim().min(1).nullable().default(null),
  acquired_at: z.string().trim().min(1).nullable().default(null),
  evidence_refs: evidenceRefSchema,
});

/**
 * 经历项校验。
 * 逻辑：统一项目、实习、竞赛三类经历；职责、成果和技术栈用数组承载，便于后续匹配和报告复用。
 */
export const studentProfileExperienceSchema = z.object({
  kind: z.enum(["project", "internship", "competition"]).default("project"),
  title: z.string().trim().min(1),
  organization: z.string().trim().min(1).nullable().default(null),
  role: z.string().trim().min(1).nullable().default(null),
  period: z.string().trim().min(1).nullable().default(null),
  tech_stack: z.array(z.string().trim().min(1)).default([]),
  responsibilities: z.array(z.string().trim().min(1)).default([]),
  outcomes: z.array(z.string().trim().min(1)).default([]),
  evidence_refs: evidenceRefSchema,
});

/**
 * 表单创建画像的请求校验。
 * 逻辑：姓名和技能是最低必填项，其他画像字段允许缺省，service 会据此计算缺失项和完整度。
 */
export const createStudentProfileSchema = z.object({
  basic_info: z.object({
    name: z.string().trim().min(1),
  }),
  preference: z.object({
    target_role: z.string().trim().default(""),
    preferred_cities: z.array(z.string().trim().min(1)).default([]),
    preferred_industries: z.array(z.string().trim().min(1)).default([]),
  }),
  education: z.object({
    school: z.string().trim().min(1).nullable().default(null),
    level: z.string().trim().min(1).nullable().default(null),
    major: z.string().trim().min(1).nullable().default(null),
    graduation_year: z.coerce.number().int().min(2000).max(2100).nullable().default(null),
    evidence_refs: evidenceRefSchema,
  }),
  skills: z.array(studentProfileSkillSchema).min(1),
  certificates: z.array(studentProfileCertificateSchema).default([]),
  experiences: z.array(studentProfileExperienceSchema).default([]),
  self_assessment: z
    .object({
      communication: z.coerce.number().int().min(1).max(5).optional(),
      learning: z.coerce.number().int().min(1).max(5).optional(),
      stress_tolerance: z.coerce.number().int().min(1).max(5).optional(),
      innovation: z.coerce.number().int().min(1).max(5).optional(),
    })
    .optional(),
  evidences: z.array(studentProfileEvidenceSchema).default([]),
  summary: z.string().trim().max(1200).optional(),
});

/**
 * 简历上传创建画像的请求校验。
 * 逻辑：文件由 multer 接收，这里只校验附带的目标岗位、姓名候选和解析模式。
 */
export const createProfileFromResumeSchema = z.object({
  target_role: z.string().trim().optional().default(""),
  name: z.string().trim().min(1).optional(),
  parse_mode: z.enum(["strict", "tolerant"]).default("tolerant"),
});
