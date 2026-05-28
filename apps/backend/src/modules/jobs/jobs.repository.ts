/**
 * 文件作用：定义岗位管理域的数据访问抽象与 PostgreSQL 实现。
 * 设计约束：service 只依赖该接口，具体数据库实现在同文件 createJobsRepository 中完成。
 */

import type { Pool } from "pg";

import type {
  JobRecord,
  JobsListParams,
  JobsListResponse,
} from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";

export type JobCreateInput = Omit<JobRecord, "id" | "created_at">;

export interface JobsRepository {
  addJobs(rows: JobCreateInput[]): Promise<{ imported: number; insertedJobs: JobRecord[] }>;
  listJobs(params: JobsListParams): Promise<JobsListResponse>;
  getJobById(jobId: number): Promise<JobRecord | null>;
  findBestJobByTargetRole(targetRole: string): Promise<JobRecord | null>;
}

function mapJobRecord(row: Record<string, unknown>): JobRecord {
  return {
    id: Number(row.id),
    source_row_id: (row.source_row_id as string | null) ?? null,
    normalized_source_key: (row.normalized_source_key as string | null) ?? null,
    title: String(row.title),
    location: (row.location as string | null) ?? null,
    salary_range: (row.salary_range as string | null) ?? null,
    company_name: (row.company_name as string | null) ?? null,
    industry: (row.industry as string | null) ?? null,
    company_size: (row.company_size as string | null) ?? null,
    company_type: (row.company_type as string | null) ?? null,
    job_code: (row.job_code as string | null) ?? null,
    job_description: (row.job_description as string | null) ?? null,
    company_intro: (row.company_intro as string | null) ?? null,
    raw_payload: (row.raw_payload as Record<string, unknown>) ?? {},
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

export function createJobsRepository(pool: Pool): JobsRepository {
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS jobs (
            id BIGSERIAL PRIMARY KEY,
            source_row_id TEXT,
            normalized_source_key TEXT,
            title TEXT NOT NULL,
            location TEXT,
            salary_range TEXT,
            company_name TEXT,
            industry TEXT,
            company_size TEXT,
            company_type TEXT,
            job_code TEXT,
            job_description TEXT,
            company_intro TEXT,
            raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`
          ALTER TABLE jobs
          ADD COLUMN IF NOT EXISTS normalized_source_key TEXT
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS jobs_list_idx
          ON jobs (industry, id DESC)
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS jobs_normalized_source_key_idx
          ON jobs (normalized_source_key)
        `);
      })();
    }

    return schemaReady;
  }

  async function addJobs(
    rows: JobCreateInput[],
  ): Promise<{ imported: number; insertedJobs: JobRecord[] }> {
    await ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const insertedJobs: JobRecord[] = [];
      for (const row of rows) {
        const inserted = await client.query(
          `
            INSERT INTO jobs (
              source_row_id,
              normalized_source_key,
              title,
              location,
              salary_range,
              company_name,
              industry,
              company_size,
              company_type,
              job_code,
              job_description,
              company_intro,
              raw_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
            RETURNING *
          `,
          [
            row.source_row_id,
            row.normalized_source_key,
            row.title,
            row.location,
            row.salary_range,
            row.company_name,
            row.industry,
            row.company_size,
            row.company_type,
            row.job_code,
            row.job_description,
            row.company_intro,
            JSON.stringify(row.raw_payload ?? {}),
          ],
        );
        insertedJobs.push(mapJobRecord(inserted.rows[0]));
      }
      await client.query("COMMIT");
      return {
        imported: insertedJobs.length,
        insertedJobs,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function listJobs(params: JobsListParams): Promise<JobsListResponse> {
    await ensureSchema();

    const filters: string[] = [];
    const values: unknown[] = [];

    if (params.keyword) {
      values.push(`%${params.keyword.toLowerCase()}%`);
      filters.push(
        `(LOWER(COALESCE(title, '')) LIKE $${values.length}
          OR LOWER(COALESCE(job_description, '')) LIKE $${values.length}
          OR LOWER(COALESCE(company_name, '')) LIKE $${values.length})`,
      );
    }

    if (params.industry) {
      values.push(params.industry);
      filters.push(`industry = $${values.length}`);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const countSql = `SELECT COUNT(*)::int AS total FROM jobs ${whereClause}`;
    const listSql = `
      SELECT *
      FROM jobs
      ${whereClause}
      ORDER BY id DESC
      OFFSET $${values.length + 1}
      LIMIT $${values.length + 2}
    `;

    const [countResult, listResult] = await Promise.all([
      pool.query(countSql, values),
      pool.query(listSql, [...values, params.offset, params.limit]),
    ]);

    return {
      total: Number(countResult.rows[0]?.total ?? 0),
      items: listResult.rows.map((row) => mapJobRecord(row)),
    };
  }

  async function getJobById(jobId: number): Promise<JobRecord | null> {
    await ensureSchema();
    const result = await pool.query("SELECT * FROM jobs WHERE id = $1 LIMIT 1", [jobId]);
    return result.rowCount ? mapJobRecord(result.rows[0]) : null;
  }

  async function findBestJobByTargetRole(targetRole: string): Promise<JobRecord | null> {
    await ensureSchema();

    const normalizedTargetRole = targetRole.trim();
    if (!normalizedTargetRole) {
      return null;
    }

    const fuzzyKeyword = `%${normalizedTargetRole.toLowerCase()}%`;
    const result = await pool.query(
      `
        SELECT
          j.*,
          CASE
            WHEN LOWER(j.title) = LOWER($1) THEN 0
            WHEN LOWER(j.title) LIKE $2 THEN 1
            ELSE 9
          END AS match_rank
        FROM jobs j
        WHERE LOWER(j.title) = LOWER($1)
          OR LOWER(j.title) LIKE $2
        ORDER BY
          match_rank ASC,
          ABS(CHAR_LENGTH(j.title) - CHAR_LENGTH($1)) ASC,
          j.id DESC
        LIMIT 1
      `,
      [normalizedTargetRole, fuzzyKeyword],
    );

    return result.rowCount ? mapJobRecord(result.rows[0]) : null;
  }

  return {
    addJobs,
    listJobs,
    getJobById,
    findBestJobByTargetRole,
  };
}
