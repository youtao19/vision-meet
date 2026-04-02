import { z } from "zod";

/**
 * 文件作用：定义 agent 编排入口的请求校验规则。
 */
export const agentAnalyzeSchema = z.object({
  student_profile_id: z.coerce.number().int().min(1),
  job_id: z.coerce.number().int().min(1),
  force_recalculate: z.coerce.boolean().default(false),
  top_k: z.coerce.number().int().min(1).max(10).default(5),
});
