import { z } from "zod";

/**
 * 文件作用：定义任务型 agent 的协议层校验规则。
 * 设计边界：schema 只做输入约束，不承载任何规划或工具决策逻辑。
 */
export const agentTaskCreateSchema = z.object({
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

export const agentTaskIdParamsSchema = z.object({
  task_id: z.coerce.number().int().min(1),
});
