import type { Pool } from "pg";
import type { ManualJobPortraitRecord } from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";
import type {
  JobComicsRepository,
  ManualJobPortraitComicUpdateInput,
} from "./job-comics.repository.js";

/**
 * 作用：把数据库行转换为前后端共享的人工岗位画像结构。
 * 参数：row 为 v2_manual_job_portraits 查询结果。
 * 返回：标准 ManualJobPortraitRecord。
 */
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

/**
 * 文件作用：岗位绘本模块的 PostgreSQL 数据适配器。
 * 设计边界：只读写 v2_manual_job_portraits 中漫画相关 payload 字段。
 */
export function createPgJobComicsRepository(pool: Pool): JobComicsRepository {
  let schemaReady: Promise<void> | null = null;

  /**
   * 作用：确保岗位漫画依赖的人工岗位画像表存在。
   * 返回：建表或确认完成后 resolve。
   */
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

  /**
   * 作用：按岗位名读取人工岗位画像。
   * 参数：jobName 为岗位画像主键名称。
   * 返回：存在则返回画像记录，否则返回 null。
   */
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

  /**
   * 作用：把漫画图片地址写回人工岗位画像 payload。
   * 参数：input 包含岗位名、图片 URL 和生成时间。
   * 返回：更新后的岗位画像记录。
   */
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
