/**
 * 文件作用：提供“生成职业报告”业务工具。
 * 设计边界：调用前必须已经存在匹配结果；工具只负责生成报告，不负责兜底创建匹配。
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import type { PiToolFactoryContext } from "../pi-tool-context.js";

export function createCareerReportTool(context: PiToolFactoryContext): ToolDefinition {
  return {
    name: "create_report",
    label: "生成职业报告",
    description:
      "基于当前匹配结果生成职业报告。会自动复用本轮任务已检索到的知识证据；调用前必须先生成匹配结果。",
    parameters: Type.Object({}),
    execute: async () => {
      if (!context.state.matchResult) {
        throw new Error("调用 create_report 前必须先执行 create_match");
      }

      const reportResult = await context.dependencies.reportService.createReportWithContext(
        {
          match_id: context.state.matchResult.id,
        },
        {
          trace_id: context.options.traceId,
          knowledge_hits: context.state.knowledgeHits,
        },
      );
      context.state.report = reportResult.report;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: reportResult.report.id,
                version: reportResult.report.version,
                total_score: reportResult.report.total_score,
                generator_mode: reportResult.generator_mode,
                sections: reportResult.report.sections.map((section) => ({
                  key: section.key,
                  title: section.title,
                })),
              },
              null,
              2,
            ),
          },
        ],
        details: {
          report: reportResult.report,
          generator_mode: reportResult.generator_mode,
        },
      };
    },
  };
}
