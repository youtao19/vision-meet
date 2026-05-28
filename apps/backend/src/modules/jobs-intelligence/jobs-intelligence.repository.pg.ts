/**
 * 文件作用：提供岗位智能处理域的 PostgreSQL 仓储实现。
 * 职责边界：负责任务、岗位画像读写，不承载业务编排逻辑。
 * 当前只保留人工岗位画像和 v2_job_profiles 方法。
 */

import type { Pool } from "pg";

import type {
  ManualJobPortraitRecord,
  JobProfileV2Record,
  JobProfilesV2ListParams,
  JobProfilesV2ListResponse,
} from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";
import type {
  JobProfileV2CreateInput,
  JobsIntelligenceRepository,
  ManualJobPortraitUpsertInput,
} from "./jobs-intelligence.repository.js";

function mapJobProfileV2(row: Record<string, unknown>): JobProfileV2Record {
  return {
    id: Number(row.id),
    job_id: Number(row.job_id),
    profile_version: Number(row.profile_version),
    normalized_title: String(row.normalized_title),
    job_family: String(row.job_family),
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
    summary: String(row.summary),
    confidence: Number(row.confidence),
    generation_model: (row.generation_model as string | null) ?? null,
    generation_mode: (row.generation_mode as JobProfileV2Record["generation_mode"]) ?? "heuristic",
    extracted_features: (row.extracted_features as Record<string, unknown>) ?? {},
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

function mapManualJobPortrait(row: Record<string, unknown>): ManualJobPortraitRecord {
  const payload = (row.payload as Record<string, unknown> | null) ?? {};
  const profileDetail = payload.profile_detail;
  if (!profileDetail || typeof profileDetail !== "object") {
    throw new Error(`MANUAL_JOB_PORTRAIT_PROFILE_DETAIL_MISSING:${String(row.job_name)}`);
  }
  const fallbackId = row.fallback_job_id == null ? null : Number(row.fallback_job_id);
  const resolvedId = row.job_id == null ? fallbackId : Number(row.job_id);
  return {
    job_id: resolvedId,
    job_name: String(row.job_name),
    category: String(row.category),
    comic_image_url:
      typeof payload.comic_image_url === "string" && payload.comic_image_url.trim()
        ? payload.comic_image_url
        : null,
    comic_generated_at:
      typeof payload.comic_generated_at === "string" && payload.comic_generated_at.trim()
        ? payload.comic_generated_at
        : null,
    profile_detail: profileDetail as ManualJobPortraitRecord["profile_detail"],
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

export function createPgJobsIntelligenceRepository(pool: Pool): JobsIntelligenceRepository {
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS v2_job_profiles (
            id BIGSERIAL PRIMARY KEY,
            job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            profile_version INTEGER NOT NULL,
            normalized_title TEXT NOT NULL,
            job_family TEXT NOT NULL,
            job_level INTEGER NOT NULL,
            professional_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            certificate_requirements TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            innovation_score INTEGER NOT NULL,
            learning_score INTEGER NOT NULL,
            stress_tolerance_score INTEGER NOT NULL,
            communication_score INTEGER NOT NULL,
            internship_score INTEGER NOT NULL,
            summary TEXT NOT NULL,
            confidence DOUBLE PRECISION NOT NULL,
            generation_model TEXT,
            generation_mode TEXT NOT NULL DEFAULT 'heuristic',
            extracted_features JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (job_id, profile_version)
          )
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS v2_job_profiles_latest_idx
          ON v2_job_profiles (job_id, profile_version DESC)
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS v2_job_profiles_family_idx
          ON v2_job_profiles (job_family, job_level, created_at DESC)
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS v2_manual_job_portraits (
            job_name TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS v2_manual_job_portraits_category_idx
          ON v2_manual_job_portraits (category, updated_at DESC)
        `);
      })();
    }

    return schemaReady;
  }

  async function listManualJobPortraits(): Promise<ManualJobPortraitRecord[]> {
    await ensureSchema();
    const result = await pool.query(`
      SELECT
        p.*,
        (
          SELECT j.id
          FROM jobs j
          WHERE lower(trim(j.title)) = lower(trim(p.job_name))
          ORDER BY j.id DESC
          LIMIT 1
        ) AS fallback_job_id,
        (
          SELECT j2.id
          FROM jobs j2
          WHERE
            lower(trim(j2.title)) = lower(trim(p.job_name))
            OR (
              regexp_replace(lower(trim(j2.title)), '[^a-z0-9\\u4e00-\\u9fa5+#]+', '', 'g') =
              regexp_replace(lower(trim(p.job_name)), '[^a-z0-9\\u4e00-\\u9fa5+#]+', '', 'g')
            )
            OR (
              length(j2.title) >= 2 AND (
                lower(p.job_name) LIKE '%' || lower(j2.title) || '%'
                OR lower(j2.title) LIKE '%' || lower(p.job_name) || '%'
              )
            )
          ORDER BY
            CASE WHEN lower(trim(j2.title)) = lower(trim(p.job_name)) THEN 0 ELSE 1 END ASC,
            j2.id DESC
          LIMIT 1
        ) AS job_id
      FROM v2_manual_job_portraits p
      ORDER BY p.created_at ASC, p.job_name ASC
    `);
    return result.rows.map((row) => mapManualJobPortrait(row));
  }

  async function getManualJobPortraitByName(
    jobName: string,
  ): Promise<ManualJobPortraitRecord | null> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT
          p.*,
          (
            SELECT j.id
            FROM jobs j
            WHERE lower(trim(j.title)) = lower(trim(p.job_name))
            ORDER BY j.id DESC
            LIMIT 1
          ) AS fallback_job_id,
          (
            SELECT j2.id
            FROM jobs j2
            WHERE
              lower(trim(j2.title)) = lower(trim(p.job_name))
              OR (
                regexp_replace(lower(trim(j2.title)), '[^a-z0-9\\u4e00-\\u9fa5+#]+', '', 'g') =
                regexp_replace(lower(trim(p.job_name)), '[^a-z0-9\\u4e00-\\u9fa5+#]+', '', 'g')
              )
              OR (
                length(j2.title) >= 2 AND (
                  lower(p.job_name) LIKE '%' || lower(j2.title) || '%'
                  OR lower(j2.title) LIKE '%' || lower(p.job_name) || '%'
                )
              )
            ORDER BY
              CASE WHEN lower(trim(j2.title)) = lower(trim(p.job_name)) THEN 0 ELSE 1 END ASC,
              j2.id DESC
            LIMIT 1
          ) AS job_id
        FROM v2_manual_job_portraits p
        WHERE p.job_name = $1
        LIMIT 1
      `,
      [jobName],
    );
    return result.rowCount ? mapManualJobPortrait(result.rows[0]) : null;
  }

  async function replaceManualJobPortraits(input: ManualJobPortraitUpsertInput[]): Promise<void> {
    await ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM v2_manual_job_portraits`);

      for (const item of input) {
        const payload = {
          profile_detail: item.profile_detail,
          comic_image_url: item.comic_image_url ?? null,
          comic_generated_at: item.comic_generated_at ?? null,
        };

        await client.query(
          `
            INSERT INTO v2_manual_job_portraits (job_name, category, payload, created_at, updated_at)
            VALUES ($1, $2, $3::jsonb, NOW(), NOW())
          `,
          [item.job_name, item.category, JSON.stringify(payload)],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function getLatestProfileByJobId(jobId: number): Promise<JobProfileV2Record | null> {
    await ensureSchema();
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
    return result.rowCount ? mapJobProfileV2(result.rows[0]) : null;
  }

  async function createJobProfile(input: JobProfileV2CreateInput): Promise<JobProfileV2Record> {
    await ensureSchema();
    const result = await pool.query(
      `
        INSERT INTO v2_job_profiles (
          job_id,
          profile_version,
          normalized_title,
          job_family,
          job_level,
          professional_skills,
          certificate_requirements,
          innovation_score,
          learning_score,
          stress_tolerance_score,
          communication_score,
          internship_score,
          summary,
          confidence,
          generation_model,
          generation_mode,
          extracted_features
        )
        VALUES (
          $1, $2, $3, $4, $5, $6::text[], $7::text[], $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb
        )
        RETURNING *
      `,
      [
        input.job_id,
        input.profile_version,
        input.normalized_title,
        input.job_family,
        input.job_level,
        input.professional_skills,
        input.certificate_requirements,
        input.innovation_score,
        input.learning_score,
        input.stress_tolerance_score,
        input.communication_score,
        input.internship_score,
        input.summary,
        input.confidence,
        input.generation_model,
        input.generation_mode,
        JSON.stringify(input.extracted_features ?? {}),
      ],
    );
    return mapJobProfileV2(result.rows[0]);
  }

  async function listLatestProfiles(
    params: JobProfilesV2ListParams,
  ): Promise<JobProfilesV2ListResponse> {
    await ensureSchema();
    const values: unknown[] = [];
    const filters: string[] = [];

    if (params.keyword) {
      values.push(`%${params.keyword.toLowerCase()}%`);
      filters.push(`LOWER(p.normalized_title) LIKE $${values.length}`);
    }
    if (params.job_family) {
      values.push(params.job_family);
      filters.push(`p.job_family = $${values.length}`);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const latestCte = `
      WITH latest AS (
        SELECT DISTINCT ON (job_id) *
        FROM v2_job_profiles
        ORDER BY job_id, profile_version DESC
      )
    `;
    const countSql = `${latestCte} SELECT COUNT(*)::int AS total FROM latest p ${where}`;
    const listSql = `${latestCte}
      SELECT p.*
      FROM latest p
      ${where}
      ORDER BY p.created_at DESC
      OFFSET $${values.length + 1}
      LIMIT $${values.length + 2}
    `;

    const [countResult, listResult] = await Promise.all([
      pool.query(countSql, values),
      pool.query(listSql, [...values, params.offset, params.limit]),
    ]);

    return {
      total: Number(countResult.rows[0]?.total ?? 0),
      items: listResult.rows.map((row) => mapJobProfileV2(row)),
    };
  }

  return {
    listManualJobPortraits,
    getManualJobPortraitByName,
    replaceManualJobPortraits,
    getLatestProfileByJobId,
    createJobProfile,
    listLatestProfiles,
  };
}
