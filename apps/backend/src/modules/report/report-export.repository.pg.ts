/**
 * 文件作用：提供报告导出记录的 PostgreSQL 仓储实现。
 * 职责边界：负责导出记录编号分配和查询，不负责实际文件生成与落盘。
 */

import type { Pool } from "pg";

import type { CareerReportExportRecord, ReportExportListResponse } from "@career/contracts/types";

import type {
  CareerReportExportCreateInput,
  ReportExportRepository,
} from "./report-export.repository.js";
import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";

function mapCareerReportExportRecord(row: Record<string, unknown>): CareerReportExportRecord {
  return {
    id: Number(row.id),
    report_id: Number(row.report_id),
    format: row.format as CareerReportExportRecord["format"],
    file_name: String(row.file_name),
    file_size_bytes: Number(row.file_size_bytes),
    created_at: new Date(String(row.created_at)).toISOString(),
    download_path: String(row.download_path),
  };
}

export function createPgReportExportRepository(pool: Pool): ReportExportRepository {
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS career_report_exports (
            id BIGSERIAL PRIMARY KEY,
            report_id BIGINT NOT NULL REFERENCES career_reports(id) ON DELETE CASCADE,
            format TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_size_bytes BIGINT NOT NULL,
            download_path TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS career_report_exports_report_idx
          ON career_report_exports (report_id, created_at DESC)
        `);
      })();
    }

    return schemaReady;
  }

  async function reserveNextExportId(): Promise<number> {
    await ensureSchema();
    const result = await pool.query(`SELECT nextval('career_report_exports_id_seq') AS id`);
    return Number(result.rows[0].id);
  }

  async function createExportRecord(
    input: CareerReportExportCreateInput,
  ): Promise<CareerReportExportRecord> {
    await ensureSchema();
    const result = await pool.query(
      `
        INSERT INTO career_report_exports (
          id,
          report_id,
          format,
          file_name,
          file_size_bytes,
          download_path
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        input.id,
        input.report_id,
        input.format,
        input.file_name,
        input.file_size_bytes,
        input.download_path,
      ],
    );
    return mapCareerReportExportRecord(result.rows[0]);
  }

  async function listExportRecordsByReportId(reportId: number): Promise<ReportExportListResponse> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM career_report_exports
        WHERE report_id = $1
        ORDER BY created_at DESC
      `,
      [reportId],
    );
    return {
      total: result.rowCount ?? result.rows.length,
      items: result.rows.map((row) => mapCareerReportExportRecord(row)),
    };
  }

  async function getExportRecordById(exportId: number): Promise<CareerReportExportRecord | null> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM career_report_exports
        WHERE id = $1
        LIMIT 1
      `,
      [exportId],
    );
    return result.rowCount ? mapCareerReportExportRecord(result.rows[0]) : null;
  }

  return {
    reserveNextExportId,
    createExportRecord,
    listExportRecordsByReportId,
    getExportRecordById,
  };
}
