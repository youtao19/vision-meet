import { z } from "zod";

import { REPORT_SECTION_ORDER } from "./report.sections.js";

/**
 * 文件作用：定义报告领域接口入参校验规则。
 */
export const reportSectionSchema = z.object({
  key: z.enum(REPORT_SECTION_ORDER),
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1),
});

export const createReportSchema = z.object({
  match_id: z.coerce.number().int().min(1),
});

export const listReportsQuerySchema = z.object({
  match_id: z.coerce.number().int().min(1).optional(),
});

export const reportIdParamsSchema = z.object({
  report_id: z.coerce.number().int().min(1),
});

export const updateReportSchema = z
  .object({
    sections: z.array(reportSectionSchema).length(REPORT_SECTION_ORDER.length).optional(),
    title: z.string().trim().min(1).max(80).optional(),
  })
  .refine((input) => input.sections || input.title, {
    message: "sections 或 title 至少需要提供一项",
  });

export const createReportExportSchema = z.object({
  format: z.enum(["pdf", "markdown"]),
});

export const exportIdParamsSchema = z.object({
  export_id: z.coerce.number().int().min(1),
});
