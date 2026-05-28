/**
 * 文件作用：提供职业路径图谱所需的 PostgreSQL 数据源。
 * 职责边界：只读取人工岗位画像和岗位记录，不承载图谱生成逻辑。
 */

import type { Pool } from "pg";
import type { ManualJobPortraitRecord } from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";

export interface CareerGraphPgRepository {
  listManualJobPortraitsFromTable(): Promise<ManualJobPortraitRecord[]>;
}

/**
 * 从数据库行记录映射为 ManualJobPortraitRecord。
 * portrait id 直接来自 v2_manual_job_portraits 自增主键。
 */
function mapManualJobPortrait(row: Record<string, unknown>): ManualJobPortraitRecord {
  const payload = (row.payload as Record<string, unknown> | null) ?? {};
  const profileDetail = payload.profile_detail;
  if (!profileDetail || typeof profileDetail !== "object") {
    throw new Error(`MANUAL_JOB_PORTRAIT_PROFILE_DETAIL_MISSING:${String(row.job_name)}`);
  }
  return {
    id: Number(row.id),
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

export function createCareerGraphPgRepository(pool: Pool): CareerGraphPgRepository {
  // 惰性初始化 schema，确保依赖的表/视图存在
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS v2_manual_job_portraits (
            id BIGSERIAL PRIMARY KEY,
            job_name TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await pool.query(`
          CREATE SEQUENCE IF NOT EXISTS v2_manual_job_portraits_id_seq
        `);

        await pool.query(`
          ALTER TABLE v2_manual_job_portraits
          ADD COLUMN IF NOT EXISTS id BIGINT
        `);

        await pool.query(`
          UPDATE v2_manual_job_portraits
          SET id = nextval('v2_manual_job_portraits_id_seq')
          WHERE id IS NULL
        `);

        await pool.query(`
          SELECT setval(
            'v2_manual_job_portraits_id_seq',
            GREATEST((SELECT COALESCE(MAX(id), 0) FROM v2_manual_job_portraits), 1),
            true
          )
        `);

        await pool.query(`
          ALTER TABLE v2_manual_job_portraits
          ALTER COLUMN id SET DEFAULT nextval('v2_manual_job_portraits_id_seq')
        `);

        await pool.query(`
          ALTER TABLE v2_manual_job_portraits
          ALTER COLUMN id SET NOT NULL
        `);

        await pool.query(`
          DO $$
          DECLARE
            constraint_name text;
            primary_columns text[];
          BEGIN
            SELECT
              c.conname,
              array_agg(a.attname ORDER BY u.ordinality)
            INTO constraint_name, primary_columns
            FROM pg_constraint c
            JOIN unnest(c.conkey) WITH ORDINALITY AS u(attnum, ordinality) ON true
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
            WHERE c.conrelid = 'v2_manual_job_portraits'::regclass
              AND c.contype = 'p'
            GROUP BY c.conname
            LIMIT 1;

            IF constraint_name IS NOT NULL AND primary_columns <> ARRAY['id']::text[] THEN
              EXECUTE format('ALTER TABLE v2_manual_job_portraits DROP CONSTRAINT %I', constraint_name);
            END IF;

            IF NOT EXISTS (
              SELECT 1
              FROM pg_constraint
              WHERE conrelid = 'v2_manual_job_portraits'::regclass
                AND contype = 'p'
            ) THEN
              ALTER TABLE v2_manual_job_portraits
              ADD CONSTRAINT v2_manual_job_portraits_pkey PRIMARY KEY (id);
            END IF;
          END $$;
        `);

        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS v2_manual_job_portraits_job_name_idx
          ON v2_manual_job_portraits (job_name)
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
   * 列出所有人工岗位画像。
   */
  async function listManualJobPortraitsFromTable(): Promise<ManualJobPortraitRecord[]> {
    await ensureSchema();
    const result = await pool.query(`
      SELECT p.*
      FROM v2_manual_job_portraits p
      ORDER BY p.created_at ASC, p.job_name ASC
    `);
    return result.rows.map((row) => mapManualJobPortrait(row));
  }

  return {
    listManualJobPortraitsFromTable,
  };
}
