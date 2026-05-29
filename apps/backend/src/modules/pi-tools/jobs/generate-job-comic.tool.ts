/**
 * 文件作用：把“生成岗位绘本”封装成 Pi 可调用工具。
 * 设计边界：工具只做参数校验和协议包装，真实图片生成逻辑由 job-comics service 承担。
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { JobPortraitPictureBookContext } from "@career/contracts/types";

import type { JobComicsService } from "../../job-comics/job-comics.service.js";
import { readBooleanParam, readStringParam } from "../../../shared/agent/pi-utils.js";

export type GenerateJobPictureBookToolContext = {
  jobComicsService: JobComicsService;
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
 * 创建岗位绘本生成工具。
 * 参数：context 注入岗位绘本 service；Pi 侧传岗位名称和可选展示上下文。
 * 返回：岗位名称和绘本资源 URL，供最终回答或前端渲染使用。
 */
export function createGenerateJobPictureBookTool(
  context: GenerateJobPictureBookToolContext,
): ToolDefinition {
  return {
    name: "generate_job_picture_book",
    label: "生成岗位绘本",
    description: "为指定岗位画像生成介绍绘本，返回可访问的绘本图片地址。",
    parameters: Type.Object({
      job_name: Type.String({ minLength: 1, description: "岗位名称，例如：前端开发工程师" }),
      force: Type.Optional(Type.Boolean({ description: "是否强制重新生成，默认复用已有绘本" })),
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
        throw new Error("generate_job_picture_book 需要传入 job_name");
      }

      const comicContext: JobPortraitPictureBookContext = {
        category: readStringParam(params, "category")?.trim(),
        summary: readStringParam(params, "summary")?.trim(),
        tech_stack: readStringArrayParam(params, "tech_stack"),
        industry_context: readStringParam(params, "industry_context")?.trim(),
        core_responsibilities: readStringArrayParam(params, "core_responsibilities"),
        suitable_for: readStringArrayParam(params, "suitable_for"),
        not_suitable_for: readStringArrayParam(params, "not_suitable_for"),
      };

      const result = await context.jobComicsService.generateManualJobPortraitComic({
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
