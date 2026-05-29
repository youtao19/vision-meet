/**
 * 文件作用：通用 Pi Agent 会话运行器的再导出兼容层。
 * 实际实现已迁移到 shared/agent/pi-session.runner.ts。
 */
export {
  runPiSession,
  type PiSessionRunResult,
  type PiSessionImageInput,
} from "../../../shared/agent/pi-session.runner.js";
