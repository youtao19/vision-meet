import { z } from "zod";

/**
 * 文件作用：定义 matching 领域接口入参校验规则。
 */
export const createMatchSchema = z.object({
  student_profile_id: z.coerce.number().int().min(1),
  job_portrait_name: z.string().trim().min(1),
  force_recalculate: z.boolean().default(false),
});

export const listMatchesQuerySchema = z.object({
  student_profile_id: z.coerce.number().int().min(1).optional(),
  job_portrait_name: z.string().trim().min(1).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const matchIdParamsSchema = z.object({
  match_id: z.coerce.number().int().min(1),
});
