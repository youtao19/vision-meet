/**
 * 文件作用：提供 Agent 任务运行快照的 PostgreSQL 仓储实现。
 * 职责边界：只负责任务快照持久化与读取，不参与任务规划和工具调度。
 */

import type { Pool } from "pg";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";
import type { AgentRepository, AgentTaskCreateInput, AgentTaskRecord } from "./agent.repository.js";

function mapAgentTaskRecord(row: Record<string, unknown>): AgentTaskRecord {
  return {
    id: Number(row.id),
    trace_id: String(row.trace_id),
    model: (row.model as string | null) ?? null,
    status: row.status as AgentTaskRecord["status"],
    student_profile_id: Number(row.student_profile_id),
    job_id: Number(row.job_id),
    objective: String(row.objective),
    deliverables: (row.deliverables as AgentTaskRecord["deliverables"]) ?? [],
    force_recalculate: Boolean(row.force_recalculate),
    top_k: Number(row.top_k),
    planned_steps: (row.planned_steps as AgentTaskRecord["planned_steps"]) ?? [],
    step_trace: (row.step_trace as AgentTaskRecord["step_trace"]) ?? [],
    result: row.result as AgentTaskRecord["result"],
    error_code: (row.error_code as string | undefined) ?? undefined,
    error_message: (row.error_message as string | undefined) ?? undefined,
    created_at: new Date(String(row.created_at)).toISOString(),
    finished_at: new Date(String(row.finished_at)).toISOString(),
  };
}

export function createPgAgentRepository(pool: Pool): AgentRepository {
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS agent_tasks (
            id BIGSERIAL PRIMARY KEY,
            trace_id TEXT NOT NULL,
            model TEXT,
            status TEXT NOT NULL,
            student_profile_id BIGINT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
            job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            objective TEXT NOT NULL,
            deliverables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            force_recalculate BOOLEAN NOT NULL DEFAULT FALSE,
            top_k INTEGER NOT NULL,
            planned_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
            step_trace JSONB NOT NULL DEFAULT '[]'::jsonb,
            result JSONB NOT NULL,
            error_code TEXT,
            error_message TEXT,
            created_at TIMESTAMPTZ NOT NULL,
            finished_at TIMESTAMPTZ NOT NULL
          )
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS agent_tasks_trace_idx
          ON agent_tasks (trace_id)
        `);
      })();
    }

    return schemaReady;
  }

  async function createTask(input: AgentTaskCreateInput): Promise<AgentTaskRecord> {
    await ensureSchema();
    const result = await pool.query(
      `
        INSERT INTO agent_tasks (
          trace_id,
          model,
          status,
          student_profile_id,
          job_id,
          objective,
          deliverables,
          force_recalculate,
          top_k,
          planned_steps,
          step_trace,
          result,
          error_code,
          error_message,
          created_at,
          finished_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7::text[], $8, $9,
          $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15::timestamptz, $16::timestamptz
        )
        RETURNING *
      `,
      [
        input.trace_id,
        input.model,
        input.status,
        input.student_profile_id,
        input.job_id,
        input.objective,
        input.deliverables,
        input.force_recalculate,
        input.top_k,
        JSON.stringify(input.planned_steps),
        JSON.stringify(input.step_trace),
        JSON.stringify(input.result),
        input.error_code ?? null,
        input.error_message ?? null,
        input.created_at,
        input.finished_at,
      ],
    );
    return mapAgentTaskRecord(result.rows[0]);
  }

  async function getTaskById(taskId: number): Promise<AgentTaskRecord | undefined> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM agent_tasks
        WHERE id = $1
        LIMIT 1
      `,
      [taskId],
    );
    return result.rowCount ? mapAgentTaskRecord(result.rows[0]) : undefined;
  }

  return {
    createTask,
    getTaskById,
  };
}
