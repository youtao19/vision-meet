/**
 * 文件作用：提供 AI 中枢任务快照与简历 HTML 记录的 PostgreSQL 仓储实现。
 * 设计说明：AI 任务快照独立落在 ai_tasks，避免继续保留旧 agent 模块和旧表名。
 */

import type { Pool } from "pg";

import type {
  CreateResumeHtmlRequest,
  ResumeHtmlListItem,
  ResumeHtmlListResponse,
  ResumeHtmlRecord,
} from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";
import type {
  AiTaskCreateInput,
  AiTaskRecord,
  AiRepository,
  ResumeHtmlListQuery,
  ResumeHtmlRecordCreateInput,
} from "./ai.repository.js";

function mapResumeHtmlRecord(row: Record<string, unknown>): ResumeHtmlRecord {
  return {
    id: Number(row.id),
    trace_id: String(row.trace_id),
    model: (row.model as string | null) ?? null,
    basic_name: String(row.basic_name),
    target_position: String(row.target_position),
    summary: (row.summary as string | null) ?? null,
    input_payload: row.input_payload as CreateResumeHtmlRequest,
    html: String(row.html),
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

function mapResumeHtmlListItem(row: Record<string, unknown>): ResumeHtmlListItem {
  return {
    id: Number(row.id),
    trace_id: String(row.trace_id),
    model: (row.model as string | null) ?? null,
    basic_name: String(row.basic_name),
    target_position: String(row.target_position),
    summary: (row.summary as string | null) ?? null,
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

function mapAiTaskRecord(row: Record<string, unknown>): AiTaskRecord {
  return {
    id: Number(row.id),
    trace_id: String(row.trace_id),
    model: (row.model as string | null) ?? null,
    status: row.status as AiTaskRecord["status"],
    student_profile_id: Number(row.student_profile_id),
    job_id: Number(row.job_id),
    objective: String(row.objective),
    deliverables: (row.deliverables as AiTaskRecord["deliverables"]) ?? [],
    force_recalculate: Boolean(row.force_recalculate),
    top_k: Number(row.top_k),
    planned_steps: (row.planned_steps as AiTaskRecord["planned_steps"]) ?? [],
    step_trace: (row.step_trace as AiTaskRecord["step_trace"]) ?? [],
    result: row.result as AiTaskRecord["result"],
    error_code: (row.error_code as string | undefined) ?? undefined,
    error_message: (row.error_message as string | undefined) ?? undefined,
    created_at: new Date(String(row.created_at)).toISOString(),
    finished_at: new Date(String(row.finished_at)).toISOString(),
  };
}

export function createPgAiRepository(pool: Pool): AiRepository {
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS ai_tasks (
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
          CREATE INDEX IF NOT EXISTS ai_tasks_trace_idx
          ON ai_tasks (trace_id)
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS ai_resume_html_records (
            id BIGSERIAL PRIMARY KEY,
            trace_id TEXT NOT NULL,
            model TEXT,
            basic_name TEXT NOT NULL,
            target_position TEXT NOT NULL,
            summary TEXT,
            input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            html TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS ai_resume_html_records_created_idx
          ON ai_resume_html_records (created_at DESC)
        `);
      })();
    }

    await schemaReady;
  }

  async function createTask(input: AiTaskCreateInput): Promise<AiTaskRecord> {
    await ensureSchema();
    const result = await pool.query(
      `
        INSERT INTO ai_tasks (
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
    return mapAiTaskRecord(result.rows[0]);
  }

  async function getTaskById(taskId: number): Promise<AiTaskRecord | undefined> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM ai_tasks
        WHERE id = $1
        LIMIT 1
      `,
      [taskId],
    );
    return result.rowCount ? mapAiTaskRecord(result.rows[0]) : undefined;
  }

  async function createResumeHtmlRecord(
    input: ResumeHtmlRecordCreateInput,
  ): Promise<ResumeHtmlRecord> {
    await ensureSchema();
    const result = await pool.query(
      `
        INSERT INTO ai_resume_html_records (
          trace_id,
          model,
          basic_name,
          target_position,
          summary,
          input_payload,
          html
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        RETURNING *
      `,
      [
        input.trace_id,
        input.model,
        input.basic_name,
        input.target_position,
        input.summary,
        JSON.stringify(input.input_payload),
        input.html,
      ],
    );

    return mapResumeHtmlRecord(result.rows[0]);
  }

  async function listResumeHtmlRecords(
    query: ResumeHtmlListQuery,
  ): Promise<ResumeHtmlListResponse> {
    await ensureSchema();
    const [listResult, countResult] = await Promise.all([
      pool.query(
        `
          SELECT id, trace_id, model, basic_name, target_position, summary, created_at
          FROM ai_resume_html_records
          ORDER BY created_at DESC
          OFFSET $1
          LIMIT $2
        `,
        [query.offset, query.limit],
      ),
      pool.query(`SELECT COUNT(*)::BIGINT AS total FROM ai_resume_html_records`),
    ]);

    return {
      total: Number(countResult.rows[0]?.total || 0),
      items: listResult.rows.map((row) => mapResumeHtmlListItem(row as Record<string, unknown>)),
    };
  }

  async function getResumeHtmlRecordById(resumeId: number): Promise<ResumeHtmlRecord | null> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM ai_resume_html_records
        WHERE id = $1
        LIMIT 1
      `,
      [resumeId],
    );

    return result.rowCount ? mapResumeHtmlRecord(result.rows[0]) : null;
  }

  return {
    createTask,
    getTaskById,
    createResumeHtmlRecord,
    listResumeHtmlRecords,
    getResumeHtmlRecordById,
  };
}
