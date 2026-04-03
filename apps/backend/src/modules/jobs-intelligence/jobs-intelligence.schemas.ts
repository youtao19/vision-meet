import { z } from "zod";

/**
 * 文件作用：定义岗位智能处理域的接口参数校验规则。
 */
export const runPipelineSchema = z.object({
  mode: z.enum(["full", "incremental"]).default("incremental"),
});

export const pipelineTaskParamsSchema = z.object({
  task_id: z.coerce.number().int().min(1),
});

export const listJobProfilesSchema = z.object({
  keyword: z.string().trim().optional(),
  job_family: z.string().trim().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const jobIdParamsSchema = z.object({
  job_id: z.coerce.number().int().min(1),
});

export const careerPathQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(3).default(2),
});
