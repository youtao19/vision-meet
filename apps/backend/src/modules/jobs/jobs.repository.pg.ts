/**
 * 文件作用：提供 jobs 领域的 PostgreSQL 仓储实现。
 * 职责边界：负责岗位与岗位画像的建表、查询和写入，不承载岗位解析或画像生成规则。
 */

import type { Pool } from "pg";

import type {
  JobProfileV2Record,
  JobRecord,
  JobsListParams,
  JobsListResponse,
} from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";
import type { JobCreateInput, JobsRepository } from "./jobs.repository.js";

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

function mapJobProfileV2Record(row: Record<string, unknown>): JobProfileV2Record {
  const generationMode = String(row.generation_mode || "heuristic");
  return {
    id: Number(row.id),
    job_id: Number(row.job_id),
    profile_version: Number(row.profile_version),
    normalized_title: String(row.normalized_title || ""),
    job_family: String(row.job_family || ""),
    job_level: Number(row.job_level),
    professional_skills: Array.isArray(row.professional_skills)
      ? (row.professional_skills as string[])
      : [],
    certificate_requirements: Array.isArray(row.certificate_requirements)
      ? (row.certificate_requirements as string[])
      : [],
    innovation_score: Number(row.innovation_score),
    learning_score: Number(row.learning_score),
    stress_tolerance_score: Number(row.stress_tolerance_score),
    communication_score: Number(row.communication_score),
    internship_score: Number(row.internship_score),
    summary: String(row.summary || ""),
    confidence: Number(row.confidence),
    generation_model: (row.generation_model as string | null) ?? null,
    generation_mode: generationMode === "agent" ? "agent" : "heuristic",
    extracted_features: (row.extracted_features as Record<string, unknown>) ?? {},
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

export function createPgJobsRepository(pool: Pool): JobsRepository {
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

  /**
   * 作用：根据目标岗位候选词从数据库里挑选最接近的一条岗位记录。
   * 设计说明：简历上传链路只保存字符串目标岗位，因此这里优先做“精确命中 -> 标准岗位命中 -> 模糊命中”的排序，
   * 避免把“待定岗位”或简历里的口语化岗位名直接写入学生画像。
   */
  async function findBestJobByTargetRole(targetRole: string): Promise<JobRecord | null> {
    await ensureSchema();

    const normalizedTargetRole = targetRole.trim();
    if (!normalizedTargetRole) {
      return null;
    }

    const fuzzyKeyword = `%${normalizedTargetRole.toLowerCase()}%`;
    const result = await pool.query(
      `
        SELECT ranked.*
        FROM (
          SELECT
            j.*,
            n.normalized_title,
            n.confidence AS normalized_confidence,
            CASE
              WHEN LOWER(j.title) = LOWER($1) THEN 0
              WHEN LOWER(COALESCE(n.normalized_title, '')) = LOWER($1) THEN 1
              WHEN LOWER(j.title) LIKE $2 THEN 2
              WHEN LOWER(COALESCE(n.normalized_title, '')) LIKE $2 THEN 3
              ELSE 9
            END AS match_rank
          FROM jobs j
          LEFT JOIN LATERAL (
            SELECT normalized_title, confidence
            FROM job_normalized
            WHERE
              (
                j.normalized_source_key IS NOT NULL
                AND (
                  dedup_key = j.normalized_source_key
                  OR normalized_payload ->> 'source_row_id' = j.normalized_source_key
                  OR normalized_payload ->> 'source_job_code' = j.normalized_source_key
                )
              )
              OR normalized_title = j.title
              OR (
                j.source_row_id IS NOT NULL
                AND normalized_payload ->> 'source_row_id' = j.source_row_id
              )
            ORDER BY confidence DESC, updated_at DESC
            LIMIT 1
          ) n ON true
          WHERE
            LOWER(j.title) = LOWER($1)
            OR LOWER(COALESCE(n.normalized_title, '')) = LOWER($1)
            OR LOWER(j.title) LIKE $2
            OR LOWER(COALESCE(n.normalized_title, '')) LIKE $2
        ) ranked
        ORDER BY
          ranked.match_rank ASC,
          ABS(CHAR_LENGTH(COALESCE(ranked.normalized_title, ranked.title)) - CHAR_LENGTH($1)) ASC,
          ranked.normalized_confidence DESC NULLS LAST,
          ranked.id DESC
        LIMIT 1
      `,
      [normalizedTargetRole, fuzzyKeyword],
    );

    return result.rowCount ? mapJobRecord(result.rows[0]) : null;
  }

  /**
   * 作用：读取 v2 岗位画像最新版本。
   * 注意：若尚未初始化 v2 表（例如尚未运行 jobs-intelligence 模块），返回 null 而不是抛错。
   */
  async function getLatestProfileV2ByJobId(jobId: number): Promise<JobProfileV2Record | null> {
    await ensureSchema();
    try {
      const result = await pool.query(
        `
          SELECT *
          FROM v2_job_profiles
          WHERE job_id = $1
          ORDER BY profile_version DESC
          LIMIT 1
        `,
        [jobId],
      );
      return result.rowCount ? mapJobProfileV2Record(result.rows[0]) : null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === "42P01") {
        return null;
      }
      throw error;
    }
  }

  return {
    addJobs,
    listJobs,
    getJobById,
    findBestJobByTargetRole,
    getLatestProfileV2ByJobId,
  };
}
