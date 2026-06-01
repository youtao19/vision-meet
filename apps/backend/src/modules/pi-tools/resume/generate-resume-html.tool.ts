/**
 * 文件作用：把“生成简历 HTML”封装成 Pi 可调用工具。
 * 设计边界：工具只暴露调用入口；简历生成、模型调用和历史记录保存由注入的服务完成。
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { CreateResumeHtmlRequest, ResumeHtmlResponse } from "@career/contracts/types";

export type GenerateResumeHtmlToolContext = {
  generateResumeHtml: (input: CreateResumeHtmlRequest) => Promise<ResumeHtmlResponse>;
};

function readRecord(params: unknown): Record<string, unknown> {
  if (!params || typeof params !== "object") {
    throw new Error("generate_resume_html 需要传入简历结构化参数");
  }
  return params as Record<string, unknown>;
}

/**
 * 创建简历 HTML 生成工具。
 * 参数：context 注入简历生成服务；Pi 侧传完整简历结构。
 * 返回：简历记录 ID、模型和 HTML 生成时间，HTML 正文放在 details 中避免最终总结过长。
 */
export function createGenerateResumeHtmlTool(
  context: GenerateResumeHtmlToolContext,
): ToolDefinition {
  return {
    name: "generate_resume_html",
    label: "生成简历",
    description: "根据结构化简历信息生成可打印的 HTML 简历。",
    parameters: Type.Object({
      basic: Type.Object({
        name: Type.String({ minLength: 1 }),
        phone: Type.String({ minLength: 1 }),
        email: Type.String({ minLength: 1 }),
        target_position: Type.String({ minLength: 1 }),
        target_city: Type.Optional(Type.String()),
      }),
      summary: Type.Optional(Type.String()),
      educations: Type.Array(Type.Any()),
      experiences: Type.Array(Type.Any()),
      skills: Type.String({ minLength: 1 }),
      certificates: Type.Optional(Type.String()),
      awards: Type.Optional(Type.String()),
      portfolio_links: Type.Optional(Type.String()),
      confirmed_draft: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, params) => {
      const payload = readRecord(params) as unknown as CreateResumeHtmlRequest;
      const result = await context.generateResumeHtml(payload);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                resume_id: result.resume_id,
                model: result.model,
                generated_at: result.generated_at,
                html_length: result.html.length,
              },
              null,
              2,
            ),
          },
        ],
        details: result,
      };
    },
  };
}
