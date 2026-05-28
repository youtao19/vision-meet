/**
 * 文件作用：图谱模块请求校验 schema 定义。
 * 职责边界：仅做格式校验，不含业务逻辑。
 */
import { z } from "zod";

/**
 * 岗位 ID 路径参数校验。
 * 从路由参数中提取 job_id，自动转为数字，要求 >= 1。
 */
export const jobIdParamsSchema = z.object({
  job_id: z.coerce.number().int().min(1),
});

/**
 * 图谱查询参数校验。
 * - depth: 展开深度（1-3），默认 2
 * - relation_type: 关系类型筛选，默认返回全部
 * - min_score: 最低分数门槛（0-100），默认不过滤
 */
export const careerPathQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(3).default(2),
  relation_type: z.enum(["promotion", "transition", "skill_migration", "all"]).default("all"),
  min_score: z.coerce.number().int().min(0).max(100).default(0),
});

/**
 * 图谱生成参数校验。
 * - force_rebuild: 是否强制重新生成
 * - max_candidates_per_node: 每个节点最大候选对数（5-80）
 * - use_agent: 是否使用 AI Agent 模式生成
 */
export const careerPathGenerateSchema = z.object({
  force_rebuild: z.coerce.boolean().optional().default(false),
  max_candidates_per_node: z.coerce.number().int().min(5).max(80).default(24),
  use_agent: z.coerce.boolean().optional().default(false),
});
