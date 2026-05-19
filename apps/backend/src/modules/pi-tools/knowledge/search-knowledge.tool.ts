/**
 * 文件作用：提供“检索知识证据”业务工具。
 * 设计边界：工具负责读取知识库并返回结构化证据，不在这里做匹配结论或报告总结。
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import {
  appendWarning,
  buildDefaultKnowledgeQuery,
  readIntegerParam,
  readStringParam,
} from "../../ai/runtime/ai-agent.utils.js";
import type { PiToolFactoryContext } from "../pi-tool-context.js";

export function createSearchKnowledgeTool(context: PiToolFactoryContext): ToolDefinition {
  return {
    name: "search_knowledge",
    label: "检索知识证据",
    description:
      "围绕当前学生画像和目标岗位检索知识证据。若不传 query，将使用画像摘要、技能和岗位名称自动构造检索语句。",
    parameters: Type.Object({
      query: Type.Optional(Type.String({ minLength: 1, description: "自定义检索 query" })),
      top_k: Type.Optional(
        Type.Integer({ minimum: 1, maximum: 10, description: "返回条数，默认沿用任务 top_k" }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const query =
        readStringParam(params, "query")?.trim() || buildDefaultKnowledgeQuery(context.state);
      const limit = readIntegerParam(params, "top_k") ?? context.options.topK;
      const response = await context.dependencies.knowledgeService.search({
        query,
        namespace: "career_runtime",
        student_profile_id: context.state.profile.id,
        limit,
      });
      context.state.knowledgeHits = response.items;

      if (response.items.length === 0) {
        appendWarning(context.warnings, "EVIDENCE_INSUFFICIENT");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query,
                total: response.total,
                items: response.items.slice(0, 5).map((item) => ({
                  id: item.id,
                  title: item.title,
                  section_path: item.section_path,
                  final_score: item.final_score,
                  chunk_text: item.chunk_text,
                })),
              },
              null,
              2,
            ),
          },
        ],
        details: {
          query,
          total: response.total,
          items: response.items,
        },
      };
    },
  };
}
