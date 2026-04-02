import { z } from "zod";

/**
 * 文件作用：集中定义 knowledge 领域的请求校验规则。
 */

const knowledgeNamespaceSchema = z.enum(["career_runtime", "internal_project_docs"]);
const knowledgeSourceKindSchema = z.enum(["job_dataset", "resume_text", "project_doc"]);

export const knowledgeIndexSchema = z.object({
  namespace: knowledgeNamespaceSchema.optional(),
  source_kind: knowledgeSourceKindSchema,
  force_reindex: z.coerce.boolean().default(false),
  items: z
    .array(
      z.object({
        source_id: z.string().trim().min(1).optional(),
        source_path: z.string().trim().min(1).optional(),
        title: z.string().trim().min(1).optional(),
        text: z.string().trim().min(1).optional(),
        section_path: z.string().trim().min(1).nullable().optional(),
        job_id: z.coerce.number().int().positive().nullable().optional(),
        profile_id: z.coerce.number().int().positive().nullable().optional(),
      }),
    )
    .min(1),
});

export const knowledgeSearchSchema = z.object({
  query: z.string().trim().min(1),
  namespace: knowledgeNamespaceSchema.optional(),
  source_kinds: z.array(knowledgeSourceKindSchema).min(1).optional(),
  student_profile_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const knowledgeEvaluationSchema = z.object({
  namespace: knowledgeNamespaceSchema.optional(),
  top_k: z.coerce.number().int().min(1).max(20).optional(),
});
