import { z } from "zod";

/**
 * 文件作用：定义 AI 中枢统一入口的协议层校验规则。
 * 设计边界：schema 只负责入口参数约束，任务规划与工具调用交给 service/runtime。
 */
export const aiTaskCreateSchema = z.object({
  student_profile_id: z.coerce.number().int().min(1),
  job_id: z.coerce.number().int().min(1),
  objective: z.string().trim().max(200).optional(),
  deliverables: z
    .array(z.enum(["match_analysis", "career_report"]))
    .min(1)
    .max(2)
    .optional(),
  force_recalculate: z.coerce.boolean().default(false),
  top_k: z.coerce.number().int().min(1).max(10).default(5),
});

export const aiTaskIdParamsSchema = z.object({
  task_id: z.coerce.number().int().min(1),
});

export const aiResumeHtmlCreateSchema = z.object({
  basic: z.object({
    name: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(1).max(40),
    email: z.string().trim().min(1).max(120),
    target_position: z.string().trim().min(1).max(120),
    target_city: z.string().trim().max(80).optional(),
  }),
  summary: z.string().trim().max(1000).optional(),
  educations: z
    .array(
      z.object({
        school: z.string().trim().min(1).max(120),
        major: z.string().trim().min(1).max(120),
        degree: z.string().trim().min(1).max(80),
        period: z.string().trim().min(1).max(80),
        gpa: z.string().trim().max(80).optional(),
        core_courses: z.string().trim().max(1000).optional(),
        honors: z.string().trim().max(1000).optional(),
      }),
    )
    .min(1)
    .max(20),
  experiences: z
    .array(
      z.object({
        organization: z.string().trim().min(1).max(120),
        role: z.string().trim().min(1).max(120),
        period: z.string().trim().min(1).max(80),
        type: z.enum(["project", "internship", "competition", "campus"]).optional(),
        background: z.string().trim().max(1500).optional(),
        tech_stack: z.string().trim().max(1000).optional(),
        responsibilities: z.string().trim().min(1).max(2000),
        achievements: z.string().trim().min(1).max(2000),
        difficulties: z.string().trim().max(1500).optional(),
      }),
    )
    .min(1)
    .max(30),
  skills: z.string().trim().min(1).max(2000),
  certificates: z.string().trim().max(1000).optional(),
  awards: z.string().trim().max(1000).optional(),
  portfolio_links: z.string().trim().max(1000).optional(),
});

export const aiResumeHtmlListQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const aiResumeHtmlIdParamsSchema = z.object({
  resume_id: z.coerce.number().int().min(1),
});

export const aiPolishCreateSchema = z.object({
  content: z.string().trim().min(5).max(10000),
  section_key: z.string().trim().max(120).optional(),
  section_title: z.string().trim().max(120).optional(),
});
