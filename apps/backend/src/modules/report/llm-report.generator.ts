/**
 * 文件作用：提供“LLM 正文 + 结构化章节”报告生成器。
 * 设计思路：先产出模板初稿，再让模型进行润色重写；失败时自动回退模板结果。
 */

import type { AppEnv } from "../../shared/config/env.js";
import { chatCompletionJson } from "../../shared/ai/openai-compatible.js";
import type { ReportGenerator, ReportGeneratorResult } from "./report.generator.js";
import { createTemplateReportGenerator } from "./template-report.generator.js";

function resolveLlmConfig(env: AppEnv): { baseUrl: string; apiKey: string; model: string } | null {
  if (env.MOONSHOT_BASE_URL && env.MOONSHOT_API_KEY && env.MOONSHOT_MODEL) {
    return {
      baseUrl: env.MOONSHOT_BASE_URL,
      apiKey: env.MOONSHOT_API_KEY,
      model: env.MOONSHOT_MODEL,
    };
  }

  if (env.KIMI_BASE_URL && env.KIMI_API_KEY && env.KIMI_MODEL) {
    return {
      baseUrl: env.KIMI_BASE_URL,
      apiKey: env.KIMI_API_KEY,
      model: env.KIMI_MODEL,
    };
  }

  return null;
}

type LlmSectionsPayload = {
  sections?: Array<{ key: string; title: string; content: string }>;
  evidence_refs?: string[];
  action_plan?: {
    short_term?: string[];
    mid_term?: string[];
  };
};

function normalizeResult(
  fallback: ReportGeneratorResult,
  payload: LlmSectionsPayload,
): ReportGeneratorResult | null {
  if (!Array.isArray(payload.sections) || payload.sections.length !== fallback.sections.length) {
    return null;
  }

  const sectionByKey = new Map(payload.sections.map((item) => [item.key, item]));
  const sections = fallback.sections.map((item) => {
    const rewritten = sectionByKey.get(item.key);
    if (!rewritten?.content?.trim()) {
      return item;
    }
    return {
      key: item.key,
      title: rewritten.title?.trim() || item.title,
      content: rewritten.content.trim(),
    };
  });

  return {
    mode: "llm",
    sections,
    evidence_refs:
      Array.isArray(payload.evidence_refs) && payload.evidence_refs.length > 0
        ? payload.evidence_refs.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
        : fallback.evidence_refs,
    action_plan: {
      short_term:
        payload.action_plan?.short_term?.map((item) => String(item).trim()).filter(Boolean) ??
        fallback.action_plan.short_term,
      mid_term:
        payload.action_plan?.mid_term?.map((item) => String(item).trim()).filter(Boolean) ??
        fallback.action_plan.mid_term,
    },
  };
}

export function createLlmReportGenerator(env: AppEnv): ReportGenerator {
  const fallbackGenerator = createTemplateReportGenerator();
  const llmConfig = resolveLlmConfig(env);

  return {
    async generate(input) {
      const fallback = await fallbackGenerator.generate(input);
      if (!llmConfig) {
        return fallback;
      }

      try {
        const prompt = [
          "你是职业规划报告写作助手，请把输入的模板报告重写成更自然、可执行的版本。",
          "输出必须是 JSON，字段：sections（7个章节）、evidence_refs（证据数组）、action_plan.short_term、action_plan.mid_term。",
          "保持 sections 的 key 不变，不要新增或删减章节。",
          "输入上下文：",
          JSON.stringify(
            {
              match_score: input.match.total_score,
              student: {
                name: input.profile.name,
                target_role: input.profile.target_role,
                skills: input.profile.skills,
              },
              job: {
                title: input.job.title,
                industry: input.job.industry,
              },
              template: fallback.sections,
              evidence: input.match.gaps.flatMap((item) => item.evidence),
            },
            null,
            2,
          ),
        ].join("\n");

        const completion = await chatCompletionJson(
          {
            baseUrl: llmConfig.baseUrl,
            apiKey: llmConfig.apiKey,
            model: llmConfig.model,
          },
          [
            {
              role: "system",
              content: "你是中文职业规划顾问，只输出 JSON。",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        );

        const normalized = normalizeResult(fallback, (completion.json ?? {}) as LlmSectionsPayload);
        return normalized ?? fallback;
      } catch {
        return fallback;
      }
    },
  };
}
