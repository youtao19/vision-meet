import type { Pool } from "pg";

import type { ManualJobPortraitRecord } from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";
import type {
  JobPortraitsRepository,
  ManualJobPortraitUpsertInput,
} from "./job-portraits.repository.js";

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

export function createPgJobPortraitsRepository(pool: Pool): JobPortraitsRepository {
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

  async function listManualJobPortraits(): Promise<ManualJobPortraitRecord[]> {
    await ensureSchema();
    const result = await pool.query(`
      SELECT p.*
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
        SELECT p.*
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

  return {
    listManualJobPortraits,
    getManualJobPortraitByName,
    replaceManualJobPortraits,
  };
}
