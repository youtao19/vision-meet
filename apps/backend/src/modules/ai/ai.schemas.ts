import { z } from "zod";

import { agentTaskCreateSchema, agentTaskIdParamsSchema } from "../agent/agent.schemas.js";

/**
 * 文件作用：定义 AI 中枢统一入口的协议层校验规则。
 * 设计边界：当前先沿用既有任务型 Agent 输入结构，等后续扩展多任务协议时再在这里拆分。
 */
export const aiTaskCreateSchema = agentTaskCreateSchema;

export const aiTaskIdParamsSchema = agentTaskIdParamsSchema;

export const aiResumeHtmlCreateSchema = z.object({
  basic: z.object({
    name: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(1).max(40),
    email: z.string().trim().min(1).max(120),
    target_position: z.string().trim().min(1).max(120),
  }),
  summary: z.string().trim().max(1000).optional(),
  educations: z
    .array(
      z.object({
        school: z.string().trim().min(1).max(120),
        major: z.string().trim().min(1).max(120),
        degree: z.string().trim().min(1).max(80),
        period: z.string().trim().min(1).max(80),
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
        responsibilities: z.string().trim().min(1).max(2000),
        achievements: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(30),
  skills: z.string().trim().min(1).max(2000),
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
