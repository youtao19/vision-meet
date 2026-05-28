/**
 * 文件作用：定义岗位绘本模块需要的画像读写能力与 PostgreSQL 实现。
 * 设计边界：只暴露漫画生成所需的最小数据接口，不承接岗位智能流水线逻辑。
 */

import type { Pool } from "pg";
import type { ManualJobPortraitRecord } from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";

export type ManualJobPortraitComicUpdateInput = {
  job_name: string;
  comic_image_url: string;
  comic_generated_at: string;
};

export interface JobComicsRepository {
  getManualJobPortraitByName(jobName: string): Promise<ManualJobPortraitRecord | null>;
  updateManualJobPortraitComic(
    input: ManualJobPortraitComicUpdateInput,
  ): Promise<ManualJobPortraitRecord>;
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

export function createJobComicsRepository(pool: Pool): JobComicsRepository {
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);
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

  async function updateManualJobPortraitComic(
    input: ManualJobPortraitComicUpdateInput,
  ): Promise<ManualJobPortraitRecord> {
    await ensureSchema();
    const result = await pool.query(
      `
        UPDATE v2_manual_job_portraits
        SET
          payload = payload || $2::jsonb,
          updated_at = NOW()
        WHERE job_name = $1
        RETURNING *
      `,
      [
        input.job_name,
        JSON.stringify({
          comic_image_url: input.comic_image_url,
          comic_generated_at: input.comic_generated_at,
        }),
      ],
    );
    return mapManualJobPortrait(result.rows[0]);
  }

  return {
    getManualJobPortraitByName,
    updateManualJobPortraitComic,
  };
}
