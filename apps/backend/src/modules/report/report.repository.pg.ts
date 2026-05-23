/**
 * 文件作用：提供报告领域的 PostgreSQL 仓储实现。
 * 职责边界：负责报告版本记录的建表、读取和更新，不处理报告生成策略。
 */

import type { Pool } from "pg";

import type {
  CareerReportRecord,
  CareerReportSection,
  ReportListParams,
  ReportListResponse,
} from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";
import type { CareerReportCreateInput, ReportRepository } from "./report.repository.js";

function mapCareerReportRecord(row: Record<string, unknown>): CareerReportRecord {
  return {
    id: Number(row.id),
    match_id: Number(row.match_id),
    version: Number(row.version),
    student_profile_id: Number(row.student_profile_id),
    total_score: Number(row.total_score),
    sections: (row.sections as CareerReportSection[]) ?? [],
    // 历史数据里可能残留 llm 标记；当前系统已删除独立 LLM 链路，读取时统一归并为 template。
    generator_mode: "template",
    evidence_refs: Array.isArray(row.evidence_refs) ? (row.evidence_refs as string[]) : [],
    action_plan: (row.action_plan as CareerReportRecord["action_plan"]) ?? {
      short_term: [],
      mid_term: [],
    },
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

export function createPgReportRepository(pool: Pool): ReportRepository {
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS career_reports (
            id BIGSERIAL PRIMARY KEY,
            match_id BIGINT NOT NULL REFERENCES match_results(id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            student_profile_id BIGINT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
            total_score DOUBLE PRECISION NOT NULL,
            sections JSONB NOT NULL DEFAULT '[]'::jsonb,
            generator_mode TEXT NOT NULL DEFAULT 'template',
            evidence_refs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            action_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(match_id, version)
          )
        `);
        await pool.query(`
          ALTER TABLE career_reports
          ADD COLUMN IF NOT EXISTS generator_mode TEXT NOT NULL DEFAULT 'template'
        `);
        await pool.query(`
          ALTER TABLE career_reports
          ADD COLUMN IF NOT EXISTS evidence_refs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
        `);
        await pool.query(`
          ALTER TABLE career_reports
          ADD COLUMN IF NOT EXISTS action_plan JSONB NOT NULL DEFAULT '{}'::jsonb
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS career_reports_match_idx
          ON career_reports (match_id, version DESC)
        `);
      })();
    }

    return schemaReady;
  }

  async function createReport(input: CareerReportCreateInput): Promise<CareerReportRecord> {
    await ensureSchema();
    const result = await pool.query(
      `
        INSERT INTO career_reports (
          match_id,
          version,
          student_profile_id,
          total_score,
          sections,
          generator_mode,
          evidence_refs,
          action_plan
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::text[], $8::jsonb)
        RETURNING *
      `,
      [
        input.match_id,
        input.version,
        input.student_profile_id,
        input.total_score,
        JSON.stringify(input.sections),
        input.generator_mode,
        input.evidence_refs ?? [],
        JSON.stringify(input.action_plan ?? { short_term: [], mid_term: [] }),
      ],
    );
    return mapCareerReportRecord(result.rows[0]);
  }

  async function listReports(params: ReportListParams): Promise<ReportListResponse> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM career_reports
        WHERE match_id = $1
        ORDER BY version DESC
      `,
      [params.match_id],
    );

    const items = result.rows.map((row) => {
      const record = mapCareerReportRecord(row);
      return {
        id: record.id,
        match_id: record.match_id,
        version: record.version,
        student_profile_id: record.student_profile_id,
        total_score: record.total_score,
        created_at: record.created_at,
        updated_at: record.updated_at,
      };
    });

    return {
      total: items.length,
      items,
    };
  }

  async function getReportById(reportId: number): Promise<CareerReportRecord | null> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM career_reports
        WHERE id = $1
        LIMIT 1
      `,
      [reportId],
    );
    return result.rowCount ? mapCareerReportRecord(result.rows[0]) : null;
  }

  async function updateReport(
    reportId: number,
    sections: CareerReportSection[],
  ): Promise<CareerReportRecord | null> {
    await ensureSchema();
    const result = await pool.query(
      `
        UPDATE career_reports
        SET
          sections = $2::jsonb,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [reportId, JSON.stringify(sections)],
    );
    return result.rowCount ? mapCareerReportRecord(result.rows[0]) : null;
  }

  return {
    createReport,
    listReports,
    getReportById,
    updateReport,
  };
}
