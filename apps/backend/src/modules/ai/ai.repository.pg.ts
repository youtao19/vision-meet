/**
 * 文件作用：提供 AI 中枢任务快照的 PostgreSQL 仓储实现。
 * 设计说明：当前先复用既有 agent 任务表，实现统一入口建设，不在这一轮重复改动已验证的持久化结构。
 */

import type { Pool } from "pg";

import { createPgAgentRepository } from "../agent/agent.repository.pg.js";
import type { AiRepository } from "./ai.repository.js";

export function createPgAiRepository(pool: Pool): AiRepository {
  return createPgAgentRepository(pool);
}
