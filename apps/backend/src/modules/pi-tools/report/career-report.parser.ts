import { z } from "zod";

import type { ReportGeneratorResult } from "../../report/report.generator.js";
import { REPORT_SECTION_ORDER } from "../../report/report.sections.js";
import { HttpError } from "../../../shared/errors/http-error.js";

const reportSectionSchema = z.object({
  key: z.enum(REPORT_SECTION_ORDER),
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
});

const reportOutputSchema = z.object({
  sections: z.array(reportSectionSchema).length(REPORT_SECTION_ORDER.length),
  evidence_refs: z.array(z.string().trim().min(1)).max(20).default([]),
  action_plan: z.object({
    short_term: z.array(z.string().trim().min(1)).min(1).max(8),
    mid_term: z.array(z.string().trim().min(1)).min(1).max(8),
  }),
});

function extractJsonObject(rawText: string): unknown {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? rawText;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new HttpError(502, "AI_REPORT_OUTPUT_INVALID", "模型未返回职业报告 JSON");
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON 解析失败";
    throw new HttpError(502, "AI_REPORT_OUTPUT_INVALID", `职业报告 JSON 解析失败：${message}`);
  }
}

export function parseCareerReportAgentOutput(rawText: string): ReportGeneratorResult {
  const parsed = reportOutputSchema.safeParse(extractJsonObject(rawText));
  if (!parsed.success) {
    throw new HttpError(502, "AI_REPORT_OUTPUT_INVALID", "职业报告输出结构不合法", {
      issues: parsed.error.issues.map((issue) => issue.message),
    });
  }

  const keys = parsed.data.sections.map((section) => section.key);
  const expected = [...REPORT_SECTION_ORDER];
  const missing = expected.filter((key) => !keys.includes(key));
  const duplicated = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (missing.length > 0 || duplicated.length > 0) {
    throw new HttpError(502, "AI_REPORT_OUTPUT_INVALID", "职业报告章节不完整或重复", {
      missing,
      duplicated,
    });
  }

  const sectionMap = new Map(parsed.data.sections.map((section) => [section.key, section]));
  return {
    mode: "ai",
    sections: REPORT_SECTION_ORDER.map((key) => sectionMap.get(key)!),
    evidence_refs: parsed.data.evidence_refs,
    action_plan: parsed.data.action_plan,
  };
}
