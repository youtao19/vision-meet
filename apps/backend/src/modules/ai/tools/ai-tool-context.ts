/**
 * 文件作用：定义 AI 业务工具工厂的公共上下文。
 * 设计边界：工具只依赖这份上下文，不直接感知 Pi 会话装配细节，便于后续从兼容层平滑迁移。
 */

import type { AgentWarningCode } from "@career/contracts/types";

import type {
  AiAgentDependencies,
  AiAgentRunOptions,
  AiAgentRuntimeState,
} from "../runtime/ai-agent.types.js";

export type AiToolFactoryContext = {
  dependencies: AiAgentDependencies;
  options: AiAgentRunOptions;
  state: AiAgentRuntimeState;
  warnings: AgentWarningCode[];
};
