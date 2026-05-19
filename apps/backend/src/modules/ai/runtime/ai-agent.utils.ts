/**
 * 文件作用：提供 AI 中枢运行时的公共辅助函数。
 * 设计边界：这里只放与运行时装配、参数读取、摘要生成有关的通用逻辑，不放具体业务工具实现。
 */

import fs from "node:fs";

import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { AiStepTraceItem, PiToolName, AiWarningCode } from "@career/contracts/types";

export {
  ensureCompatibleAgentBootstrap,
  ensureDirectory,
  resolveDefaultPiAgentDir,
  resolveLegacyCompatibleAgentDir,
  resolveStandardPiAgentDir,
} from "../../../shared/agent/agent-bootstrap.js";

import { HttpError } from "../../../shared/errors/http-error.js";
import type { AiAgentRuntimeState, ToolExecutionSnapshot } from "./ai-agent.types.js";

export function buildCareerAgentSystemPrompt(): string {
  return [
    "你是 Career Agent 的任务执行代理，底层运行在 pi-coding-agent SDK 中。",
    "当前任务不是改代码，而是基于业务工具完成学生画像与目标岗位的职业匹配任务。",
    "你只能依据工具返回的数据下结论，禁止编造任何画像、岗位、证据、评分或报告内容。",
    "建议先调用 load_task_context 理解任务上下文，再根据需要调用其他工具。",
    "生成职业报告前，必须先调用 create_match 产出匹配结果。",
    "若知识检索失败或证据不足，应明确说明，但在仍可继续时继续完成任务。",
    "最终回答必须使用中文，简洁说明：结论、关键依据、是否已生成报告、下一步建议。",
  ].join("\n");
}

export function parseModelRef(modelRef?: string): { provider: string; modelId: string } | null {
  if (!modelRef) {
    return null;
  }

  const normalized = modelRef.trim();
  if (!normalized) {
    return null;
  }

  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0 || slashIndex === normalized.length - 1) {
    throw new HttpError(
      500,
      "AGENT_MODEL_INVALID",
      "AGENT_MODEL 必须采用 provider/model 的格式，例如 kimi-coding/k2p5",
    );
  }

  return {
    provider: normalized.slice(0, slashIndex),
    modelId: normalized.slice(slashIndex + 1),
  };
}

export function serializeJsonPreview(value: unknown, maxLength = 240): string {
  const raw = JSON.stringify(value);
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}...` : raw;
}

export function buildDefaultKnowledgeQuery(state: AiAgentRuntimeState): string {
  return [
    `目标岗位 ${state.job.title}`,
    `候选方向 ${state.profile.target_role}`,
    state.profile.skills.length > 0 ? `技能 ${state.profile.skills.slice(0, 8).join(" ")}` : "",
    state.profile.summary,
  ]
    .filter(Boolean)
    .join("；");
}

export function summarizeAssistantMessage(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((item) => {
      if (typeof item === "string") {
        return [item];
      }

      if (!item || typeof item !== "object") {
        return [];
      }

      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? [text] : [];
    })
    .join("\n")
    .trim();
}

export function extractToolResultText(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? [text] : [];
    })
    .join("\n")
    .trim();
}

export function buildToolOutputSummary(tool: PiToolName, result: unknown): string {
  if (!result || typeof result !== "object") {
    return "工具未返回可摘要内容";
  }

  const details = (result as { details?: unknown }).details;
  if (details && typeof details === "object") {
    if (tool === "context_lookup") {
      const payload = details as {
        profile?: { id?: number; name?: string };
        job?: { id?: number; title?: string };
      };
      if (payload.profile?.id && payload.job?.id) {
        return `已加载画像 #${payload.profile.id} 与岗位 #${payload.job.id}`;
      }
    }

    if (tool === "knowledge_search") {
      const payload = details as { total?: number };
      if (typeof payload.total === "number") {
        return payload.total > 0 ? `命中 ${payload.total} 条知识证据` : "未命中知识证据";
      }
    }

    if (tool === "match_evaluation") {
      const payload = details as { match_result?: { id?: number; total_score?: number } };
      if (payload.match_result?.id) {
        return `match #${payload.match_result.id}，总分 ${payload.match_result.total_score ?? "-"}`;
      }
    }

    if (tool === "report_generation") {
      const payload = details as {
        report?: { id?: number };
        generator_mode?: string;
      };
      if (payload.report?.id) {
        return `report #${payload.report.id}，生成模式 ${payload.generator_mode ?? "unknown"}`;
      }
    }
  }

  const text = extractToolResultText(result);
  return text ? text.slice(0, 120) : "工具执行完成";
}

export function mapRuntimeTool(toolName: string): { tool: PiToolName; title: string } | null {
  switch (toolName) {
    case "load_task_context":
      return {
        tool: "context_lookup",
        title: "加载任务上下文",
      };
    case "search_knowledge":
      return {
        tool: "knowledge_search",
        title: "检索知识证据",
      };
    case "create_match":
      return {
        tool: "match_evaluation",
        title: "生成匹配结果",
      };
    case "create_report":
      return {
        tool: "report_generation",
        title: "生成职业报告",
      };
    default:
      return null;
  }
}

export function appendWarning(warnings: AiWarningCode[], warning: AiWarningCode): void {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

export function readStringParam(params: unknown, key: string): string | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export function readBooleanParam(params: unknown, key: string): boolean | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const value = (params as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

export function readIntegerParam(params: unknown, key: string): number | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const value = (params as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

export function createSessionSubscription(params: {
  stepTrace: AiStepTraceItem[];
  warnings: AiWarningCode[];
  assistantMessages: string[];
}) {
  const executionMap = new Map<string, ToolExecutionSnapshot>();
  let streamingAssistantBuffer = "";

  return (event: AgentSessionEvent) => {
    if (event.type === "message_update") {
      if (
        (event.message as { role?: unknown }).role === "assistant" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        streamingAssistantBuffer += event.assistantMessageEvent.delta;
      }
      return;
    }

    if (event.type === "message_end") {
      if ((event.message as { role?: unknown }).role !== "assistant") {
        return;
      }

      const finalText = streamingAssistantBuffer.trim() || summarizeAssistantMessage(event.message);
      streamingAssistantBuffer = "";
      if (finalText) {
        params.assistantMessages.push(finalText);
      }
      return;
    }

    if (event.type === "tool_execution_start") {
      const mapped = mapRuntimeTool(event.toolName);
      if (!mapped) {
        return;
      }

      executionMap.set(event.toolCallId, {
        tool: mapped.tool,
        title: mapped.title,
        startedAt: Date.now(),
        inputSummary: serializeJsonPreview(event.args),
      });
      return;
    }

    if (event.type === "tool_execution_end") {
      const snapshot = executionMap.get(event.toolCallId);
      if (!snapshot) {
        return;
      }

      executionMap.delete(event.toolCallId);
      params.stepTrace.push({
        step_id: `${snapshot.tool}-${params.stepTrace.length + 1}`,
        tool: snapshot.tool,
        title: snapshot.title,
        status: event.isError ? "error" : "success",
        duration_ms: Date.now() - snapshot.startedAt,
        input_summary: snapshot.inputSummary,
        output_summary: event.isError
          ? extractToolResultText(event.result) || "工具执行失败"
          : buildToolOutputSummary(snapshot.tool, event.result),
        error_code: event.isError ? "AGENT_TOOL_EXECUTION_FAILED" : undefined,
      });

      if (event.isError && snapshot.tool === "knowledge_search") {
        appendWarning(params.warnings, "KNOWLEDGE_SEARCH_FAILED");
      }

      if (event.isError && snapshot.tool === "report_generation") {
        appendWarning(params.warnings, "REPORT_GENERATION_FAILED");
      }
    }
  };
}
