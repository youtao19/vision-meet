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

/**
 * 创建 AI 简历 HTML 的入参校验。
 *
 * basic：
 * - 必填：姓名、手机号、邮箱、目标岗位
 * - 选填：目标城市
 *
 * summary：
 * - 选填：个人总结
 *
 * educations：
 * - 必填：学校、专业、学历、就读时间
 * - 选填：GPA、核心课程、荣誉奖项
 * - 数量限制：至少 1 条，最多 20 条
 *
 * experiences：
 * - 选填：允许没有项目/实习经历；填写时必须有组织名称、角色、经历时间、负责内容、成果
 * - 选填：经历类型、背景、技术栈、难点
 * - 数量限制：最多 30 条
 *
 * 其他：
 * - 必填：技能
 * - 选填：证书、获奖经历、作品链接
 */
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
