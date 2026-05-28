import { z } from "zod";

/**
 * 文件作用：定义岗位智能处理域的接口参数校验规则。
 */
export const listCanonicalRolesSchema = z.object({
  keyword: z.string().trim().optional(),
  job_family: z.string().trim().optional(),
  level_band: z.string().trim().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listJobFactsSchema = z.object({
  keyword: z.string().trim().optional(),
  job_family: z.string().trim().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const jobIdParamsSchema = z.object({
  job_id: z.coerce.number().int().min(1),
});

export const canonicalRoleParamsSchema = z.object({
  role_key: z.string().trim().min(1),
});

