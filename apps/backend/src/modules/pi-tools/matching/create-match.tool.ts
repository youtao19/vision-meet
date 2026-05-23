/**
 * 文件作用：提供“生成人岗匹配”业务工具。
 * 设计边界：工具只调用匹配领域服务生成可复现结果，不在这里追加报告生成或最终总结。
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import { readBooleanParam } from "../../ai/runtime/ai-agent.utils.js";
import type { PiToolFactoryContext } from "../pi-tool-context.js";

export function createMatchTool(context: PiToolFactoryContext): ToolDefinition {
  return {
    name: "create_match",
    label: "生成人岗匹配",
    description: "基于当前任务的学生画像和岗位，生成稳定可复现的匹配结果。",
    parameters: Type.Object({
      force_recalculate: Type.Optional(
        Type.Boolean({ description: "是否忽略缓存并强制重算，默认沿用任务设置" }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const matchResult = await context.dependencies.matchingService.createMatch({
        student_profile_id: context.state.profile.id,
        job_portrait_name: context.state.job.title,
        force_recalculate:
          readBooleanParam(params, "force_recalculate") ?? context.options.forceRecalculate,
      });
      context.state.matchResult = matchResult;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: matchResult.id,
                total_score: matchResult.total_score,
                dimension_scores: matchResult.dimension_scores,
                gaps: matchResult.gaps.slice(0, 4),
                suggestions: matchResult.suggestions.slice(0, 5),
              },
              null,
              2,
            ),
          },
        ],
        details: {
          match_result: matchResult,
        },
      };
    },
  };
}
