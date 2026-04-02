/**
 * 文件作用：提供 jobs 领域的 PostgreSQL 仓储实现。
 * 职责边界：负责岗位与岗位画像的建表、查询和写入，不承载岗位解析或画像生成规则。
 */

import type { Pool } from "pg";

import type {
  JobProfileRecord,
  JobRecord,
  JobsListParams,
  JobsListResponse,
} from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";
import type { JobCreateInput, JobProfileCreateInput, JobsRepository } from "./jobs.repository.js";

function mapJobRecord(row: Record<string, unknown>): JobRecord {
  return {
    id: Number(row.id),
    source_row_id: (row.source_row_id as string | null) ?? null,
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

function mapJobProfileRecord(row: Record<string, unknown>): JobProfileRecord {
  return {
    id: Number(row.id),
    job_id: Number(row.job_id),
    profile_version: Number(row.profile_version),
    hard_skills: Array.isArray(row.hard_skills) ? (row.hard_skills as string[]) : [],
    certificates: Array.isArray(row.certificates) ? (row.certificates as string[]) : [],
    soft_skills: Array.isArray(row.soft_skills) ? (row.soft_skills as string[]) : [],
    skill_weights: (row.skill_weights as Record<string, number>) ?? {},
    summary: String(row.summary),
    confidence: Number(row.confidence),
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
          CREATE TABLE IF NOT EXISTS job_profiles (
            id BIGSERIAL PRIMARY KEY,
            job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            profile_version INTEGER NOT NULL,
            hard_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            certificates TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            soft_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            skill_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
            summary TEXT NOT NULL,
            confidence DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(job_id, profile_version)
          )
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS jobs_list_idx
          ON jobs (industry, id DESC)
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS job_profiles_latest_idx
          ON job_profiles (job_id, profile_version DESC)
        `);
      })();
    }

    return schemaReady;
  }

  async function addJobs(rows: JobCreateInput[]): Promise<{ imported: number; insertedJobs: JobRecord[] }> {
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
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
            RETURNING *
          `,
          [
            row.source_row_id,
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

  async function getLatestProfileByJobId(jobId: number): Promise<JobProfileRecord | null> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM job_profiles
        WHERE job_id = $1
        ORDER BY profile_version DESC
        LIMIT 1
      `,
      [jobId],
    );
    return result.rowCount ? mapJobProfileRecord(result.rows[0]) : null;
  }

  async function createJobProfile(profile: JobProfileCreateInput): Promise<JobProfileRecord> {
    await ensureSchema();
    const result = await pool.query(
      `
        INSERT INTO job_profiles (
          job_id,
          profile_version,
          hard_skills,
          certificates,
          soft_skills,
          skill_weights,
          summary,
          confidence
        )
        VALUES ($1, $2, $3::text[], $4::text[], $5::text[], $6::jsonb, $7, $8)
        RETURNING *
      `,
      [
        profile.job_id,
        profile.profile_version,
        profile.hard_skills,
        profile.certificates,
        profile.soft_skills,
        JSON.stringify(profile.skill_weights ?? {}),
        profile.summary,
        profile.confidence,
      ],
    );
    return mapJobProfileRecord(result.rows[0]);
  }

  return {
    addJobs,
    listJobs,
    getJobById,
    getLatestProfileByJobId,
    createJobProfile,
  };
}
