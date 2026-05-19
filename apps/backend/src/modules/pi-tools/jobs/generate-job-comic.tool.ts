/**
 * 文件作用：把“生成岗位漫画”封装成 Pi 可调用工具。
 * 设计边界：工具只做参数校验和协议包装，真实图片生成逻辑继续由 jobs-intelligence service 承担。
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { JobPortraitComicContext } from "@career/contracts/types";

import type { JobsIntelligenceService } from "../../jobs-intelligence/jobs-intelligence.service.js";
import { readBooleanParam, readStringParam } from "../../ai/runtime/ai-agent.utils.js";

export type GenerateJobComicToolContext = {
  jobsIntelligenceService: JobsIntelligenceService;
};

function readStringArrayParam(params: unknown, key: string): string[] | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const value = (params as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/**
 * 创建岗位漫画生成工具。
 * 参数：context 注入岗位智能 service；Pi 侧传岗位名称和可选展示上下文。
 * 返回：岗位名称和漫画资源 URL，供最终回答或前端渲染使用。
 */
export function createGenerateJobComicTool(context: GenerateJobComicToolContext): ToolDefinition {
  return {
    name: "generate_job_comic",
    label: "生成岗位漫画",
    description: "为指定岗位画像生成介绍漫画，返回可访问的漫画图片地址。",
    parameters: Type.Object({
      job_name: Type.String({ minLength: 1, description: "岗位名称，例如：前端开发工程师" }),
      force: Type.Optional(Type.Boolean({ description: "是否强制重新生成，默认复用已有漫画" })),
      category: Type.Optional(Type.String({ minLength: 1, description: "岗位分类或展示分组" })),
      summary: Type.Optional(Type.String({ minLength: 1, description: "岗位摘要" })),
      tech_stack: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      industry_context: Type.Optional(Type.String({ minLength: 1, description: "行业背景" })),
      core_responsibilities: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      suitable_for: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      not_suitable_for: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    }),
    execute: async (_toolCallId, params) => {
      const jobName = readStringParam(params, "job_name")?.trim();
      if (!jobName) {
        throw new Error("generate_job_comic 需要传入 job_name");
      }

      const comicContext: JobPortraitComicContext = {
        category: readStringParam(params, "category")?.trim(),
        summary: readStringParam(params, "summary")?.trim(),
        tech_stack: readStringArrayParam(params, "tech_stack"),
        industry_context: readStringParam(params, "industry_context")?.trim(),
        core_responsibilities: readStringArrayParam(params, "core_responsibilities"),
        suitable_for: readStringArrayParam(params, "suitable_for"),
        not_suitable_for: readStringArrayParam(params, "not_suitable_for"),
      };

      const result = await context.jobsIntelligenceService.generateManualJobPortraitComic({
        jobName,
        force: readBooleanParam(params, "force") ?? false,
        comicContext,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        details: result,
      };
    },
  };
}
