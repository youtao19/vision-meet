import { z } from "zod";

/**
 * 文件作用：定义职业路径图谱接口的参数校验规则。
 */
export const careerPathParamsSchema = z.object({
  job_id: z.coerce.number().int().min(1),
});

export const careerPathQuerySchema = z.object({
  student_profile_id: z.coerce.number().int().min(1).optional(),
  depth: z.coerce.number().int().min(1).max(3).default(2),
});

export type CareerPathParams = z.infer<typeof careerPathParamsSchema>;
export type CareerPathQuery = z.infer<typeof careerPathQuerySchema>;
