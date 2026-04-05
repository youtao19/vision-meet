/**
 * 文件作用：提供 AI 中枢任务快照与简历 HTML 记录的 PostgreSQL 仓储实现。
 * 设计说明：任务快照复用 agent 仓储实现，简历记录使用独立表，便于前端历史查看与新标签页回放。
 */

import type { Pool } from "pg";

import type {
  CreateResumeHtmlRequest,
  ResumeHtmlListItem,
  ResumeHtmlListResponse,
  ResumeHtmlRecord,
} from "@career/contracts/types";

import { createPgAgentRepository } from "../agent/agent.repository.pg.js";
import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";
import type { AiRepository, ResumeHtmlListQuery, ResumeHtmlRecordCreateInput } from "./ai.repository.js";

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

export function createPgAiRepository(pool: Pool): AiRepository {
  const taskRepository = createPgAgentRepository(pool);
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);
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

  async function listResumeHtmlRecords(query: ResumeHtmlListQuery): Promise<ResumeHtmlListResponse> {
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
    ...taskRepository,
    createResumeHtmlRecord,
    listResumeHtmlRecords,
    getResumeHtmlRecordById,
  };
}
