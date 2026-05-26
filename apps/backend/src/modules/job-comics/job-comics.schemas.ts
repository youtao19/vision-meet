import { z } from "zod";

/**
 * 文件作用：定义岗位漫画模块的 HTTP 参数校验规则。
 */
export const manualJobPortraitNameParamsSchema = z.object({
  job_name: z.string().trim().min(1),
});

export const generateJobPortraitComicSchema = z.object({
  force: z.coerce.boolean().optional().default(false),
  comic_context: z
    .object({
      category: z.string().trim().optional(),
      summary: z.string().trim().optional(),
      tech_stack: z.array(z.string().trim()).optional(),
      industry_context: z.string().trim().optional(),
      core_responsibilities: z.array(z.string().trim()).optional(),
      suitable_for: z.array(z.string().trim()).optional(),
      not_suitable_for: z.array(z.string().trim()).optional(),
    })
    .optional(),
});
