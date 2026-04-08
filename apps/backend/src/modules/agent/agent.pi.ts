/**
 * 文件作用：保留旧 `agent` 模块对 Pi 运行时的兼容导出。
 * 设计说明：实际运行时已迁移到 `modules/ai/runtime`，这里仅用于避免旧 service 和脚本在本轮重构中立即断裂。
 */

export { runAiTaskAgent as runPiCareerAgent } from "../ai/runtime/ai-agent.runtime.js";
export type {
  AiAgentRunResult as PiAgentRunResult,
  AiThinkingLevel as PiThinkingLevel,
} from "../ai/runtime/ai-agent.types.js";
