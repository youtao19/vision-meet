import { z } from "zod";

/**
 * 文件作用：定义报告领域接口入参校验规则。
 */
export const reportSectionSchema = z.object({
  key: z.enum([
    "overview",
    "match_analysis",
    "strengths",
    "gaps_and_actions",
    "short_term_plan",
    "mid_term_plan",
  ]),
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1),
});

export const createReportSchema = z.object({
  match_id: z.coerce.number().int().min(1),
});

export const listReportsQuerySchema = z.object({
  match_id: z.coerce.number().int().min(1),
});

export const reportIdParamsSchema = z.object({
  report_id: z.coerce.number().int().min(1),
});

export const updateReportSchema = z.object({
  sections: z.array(reportSectionSchema).length(6),
});

export const createReportExportSchema = z.object({
  format: z.literal("pdf"),
});

export const exportIdParamsSchema = z.object({
  export_id: z.coerce.number().int().min(1),
});
