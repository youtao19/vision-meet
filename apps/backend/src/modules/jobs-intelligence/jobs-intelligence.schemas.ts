import { z } from "zod";

/**
 * 文件作用：定义岗位智能处理域的接口参数校验规则。
 */
export const runPipelineSchema = z.object({
  mode: z.literal("facts_canonical_full").default("facts_canonical_full"),
});

export const pipelineTaskParamsSchema = z.object({
  task_id: z.coerce.number().int().min(1),
});

export const pipelineListQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const pipelineRetryQueueQuerySchema = pipelineListQuerySchema.extend({
  task_id: z.coerce.number().int().min(1).optional(),
  status: z.enum(["pending", "processing", "done", "failed"]).optional(),
});

export const pipelineRetryProcessSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

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

export const careerPathQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(3).default(2),
  relation_type: z.enum(["promotion", "transition", "all"]).default("all"),
  min_score: z.coerce.number().int().min(0).max(100).default(0),
});
