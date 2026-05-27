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
import { createLegacyReportSection, REPORT_SECTION_ORDER } from "./report.sections.js";

function normalizeStoredSections(sections: CareerReportSection[]): CareerReportSection[] {
  const sectionMap = new Map(sections.map((section) => [section.key, section]));
  return REPORT_SECTION_ORDER.map((key) => sectionMap.get(key) ?? createLegacyReportSection(key));
}

function mapCareerReportRecord(row: Record<string, unknown>): CareerReportRecord {
  const sections = Array.isArray(row.sections) ? (row.sections as CareerReportSection[]) : [];
  return {
    id: Number(row.id),
    match_id: Number(row.match_id),
    version: Number(row.version),
    student_profile_id: Number(row.student_profile_id),
    title: String(row.title || "职业规划报告"),
    total_score: Number(row.total_score),
    sections: normalizeStoredSections(sections),
    generator_mode: row.generator_mode === "ai" ? "ai" : "template",
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
            title TEXT NOT NULL DEFAULT '职业规划报告',
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
          ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '职业规划报告'
        `);
        // 数据迁移：将旧的通用标题更新为包含岗位名称的更具辨识度的标题
        await pool.query(`
          UPDATE career_reports cr
          SET title = '职业规划报告 - ' || COALESCE(
            (SELECT COALESCE(jp.job_name, m.job_portrait_name)
             FROM match_results m
             LEFT JOIN v2_manual_job_portraits jp ON m.job_portrait_name = jp.job_name
             WHERE m.id = cr.match_id),
            '未知岗位'
          )
          WHERE cr.title = '职业规划报告';
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
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'career_reports'
                AND column_name = 'job_id'
            ) THEN
              ALTER TABLE career_reports ALTER COLUMN job_id DROP NOT NULL;
            END IF;
          END $$;
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
          title,
          total_score,
          sections,
          generator_mode,
          evidence_refs,
          action_plan
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::text[], $9::jsonb)
        RETURNING *
      `,
      [
        input.match_id,
        input.version,
        input.student_profile_id,
        input.title || "职业规划报告",
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
    const result = params.match_id
      ? await pool.query(
          `
            SELECT *
            FROM career_reports
            WHERE match_id = $1
            ORDER BY version DESC
          `,
          [params.match_id],
        )
      : await pool.query(
          `
            SELECT *
            FROM career_reports
            ORDER BY updated_at DESC, id DESC
          `,
        );

    const items = result.rows.map((row) => {
      const record = mapCareerReportRecord(row);
      return {
        id: record.id,
        match_id: record.match_id,
        version: record.version,
        student_profile_id: record.student_profile_id,
        title: record.title,
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
    update: { sections?: CareerReportSection[]; title?: string },
  ): Promise<CareerReportRecord | null> {
    await ensureSchema();

    let query = "UPDATE career_reports SET updated_at = NOW()";
    const values: unknown[] = [reportId];
    let paramIndex = 2;

    if (update.sections) {
      query += `, sections = $${paramIndex}::jsonb`;
      values.push(JSON.stringify(update.sections));
      paramIndex++;
    }

    if (update.title !== undefined) {
      query += `, title = $${paramIndex}`;
      values.push(update.title);
      paramIndex++;
    }

    query += ` WHERE id = $1 RETURNING *`;

    const result = await pool.query(query, values);
    return result.rowCount ? mapCareerReportRecord(result.rows[0]) : null;
  }

  async function deleteReport(reportId: number): Promise<boolean> {
    await ensureSchema();
    const result = await pool.query(
      `
        DELETE FROM career_reports
        WHERE id = $1
      `,
      [reportId],
    );
    return Boolean(result.rowCount);
  }

  return {
    createReport,
    listReports,
    getReportById,
    updateReport,
    deleteReport,
  };
}
