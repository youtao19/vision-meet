/**
 * 文件作用：定义 Pi 工具工厂的公共上下文。
 * 设计边界：工具只依赖这份上下文，不直接感知 Pi 会话装配细节。
 */

import type { AiWarningCode } from "@career/contracts/types";

import type {
  AiAgentDependencies,
  AiAgentRunOptions,
  AiAgentRuntimeState,
} from "../ai/runtime/ai-agent.types.js";

export type PiToolFactoryContext = {
  dependencies: AiAgentDependencies;
  options: AiAgentRunOptions;
  state: AiAgentRuntimeState;
  warnings: AiWarningCode[];
};
