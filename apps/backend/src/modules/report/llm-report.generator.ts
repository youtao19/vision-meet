import { z } from "zod";

import type {
  CareerReportSection,
  CareerReportSectionKey,
  KnowledgeSearchResultItem,
} from "@career/contracts/types";

import type { LlmClient } from "../../shared/llm/llm-client.js";
import type {
  ReportGenerator,
  ReportGeneratorInput,
  ReportGeneratorResult,
} from "./report.generator.js";

const sectionSchema = z.object({
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

const llmResponseSchema = z.object({
  sections: z.array(sectionSchema).length(6),
});

const SECTION_ORDER: CareerReportSectionKey[] = [
  "overview",
  "match_analysis",
  "strengths",
  "gaps_and_actions",
  "short_term_plan",
  "mid_term_plan",
];

function normalizeKnowledgeHits(items: KnowledgeSearchResultItem[] | undefined): Array<{
  title: string;
  section_path: string | null;
  chunk_text: string;
}> {
  return (items ?? []).slice(0, 5).map((item) => ({
    title: item.title,
    section_path: item.section_path,
    chunk_text: item.chunk_text,
  }));
}

function normalizeSectionOrder(sections: CareerReportSection[]): CareerReportSection[] {
  const sectionMap = new Map(sections.map((item) => [item.key, item]));
  return SECTION_ORDER.map((key) => sectionMap.get(key)!);
}

/**
 * 文件作用：提供“LLM 优先，模板兜底”的报告生成器。
 * 关键约束：无论模型输出如何，最终都必须落回固定六段式结构，保证旧页面与导出链路不变。
 */
export function createLlmFirstReportGenerator(
  llmClient: LlmClient | null,
  fallbackGenerator: ReportGenerator,
): ReportGenerator {
  async function fallback(input: ReportGeneratorInput): Promise<ReportGeneratorResult> {
    return fallbackGenerator.generate(input);
  }

  return {
    async generate(input: ReportGeneratorInput): Promise<ReportGeneratorResult> {
      if (!llmClient || !llmClient.isConfigured()) {
        return fallback(input);
      }

      try {
        const payload = await llmClient.completeStructuredJson<unknown>({
          messages: [
            {
              role: "system",
              content: [
                "你是 Career Agent 的职业规划报告生成器。",
                "你必须返回一个 JSON 对象，顶层只允许包含 sections 字段。",
                "sections 必须是 6 个对象的数组，并且 key 只能按以下顺序出现：",
                SECTION_ORDER.join(", "),
                "每个 section 必须包含 key、title、content 三个字段。",
                "输出必须基于输入证据，不要编造不存在的经历或岗位要求。",
              ].join("\n"),
            },
            {
              role: "user",
              content: JSON.stringify(
                {
                  profile: {
                    name: input.profile.name,
                    target_role: input.profile.target_role,
                    summary: input.profile.summary,
                    skills: input.profile.skills,
                    certificates: input.profile.certificates,
                  },
                  job: {
                    title: input.job.title,
                    company_name: input.job.company_name,
                    summary: input.job.job_description,
                  },
                  match: {
                    total_score: input.match.total_score,
                    dimension_scores: input.match.dimension_scores,
                    gaps: input.match.gaps,
                    suggestions: input.match.suggestions,
                    explanations: input.match.explanations,
                  },
                  agent_summary: input.agent_summary ?? null,
                  knowledge_hits: normalizeKnowledgeHits(input.knowledge_hits),
                },
                null,
                2,
              ),
            },
          ],
          maxTokens: 2200,
        });

        const parsed = llmResponseSchema.safeParse(payload);
        if (!parsed.success) {
          return fallback(input);
        }

        return {
          mode: "llm",
          sections: normalizeSectionOrder(parsed.data.sections),
        };
      } catch {
        return fallback(input);
      }
    },
  };
}
