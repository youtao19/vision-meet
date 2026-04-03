import { agentTaskCreateSchema, agentTaskIdParamsSchema } from "../agent/agent.schemas.js";

/**
 * 文件作用：定义 AI 中枢统一入口的协议层校验规则。
 * 设计边界：当前先沿用既有任务型 Agent 输入结构，等后续扩展多任务协议时再在这里拆分。
 */
export const aiTaskCreateSchema = agentTaskCreateSchema;

export const aiTaskIdParamsSchema = agentTaskIdParamsSchema;
