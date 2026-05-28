/**
 * 文件作用：提供职业路径图谱所需的 PostgreSQL 数据源。
 * 职责边界：只读取人工岗位画像和岗位记录，不承载图谱生成逻辑。
 */

import type { Pool } from "pg";
import type { JobRecord, ManualJobPortraitRecord } from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";

export interface CareerGraphPgRepository {
  listManualJobPortraitsFromTable(): Promise<ManualJobPortraitRecord[]>;
  listJobsByIds(jobIds: number[]): Promise<JobRecord[]>;
}

/**
 * 从数据库行记录映射为 ManualJobPortraitRecord。
 * 解析 JSON payload 中的 profile_detail，回退 job_id 为空时使用 fallback_job_id。
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

/** 从数据库行记录映射为 JobRecord */
function mapJob(row: Record<string, unknown>): JobRecord {
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

export function createCareerGraphPgRepository(pool: Pool): CareerGraphPgRepository {
  // 惰性初始化 schema，确保依赖的表/视图存在
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);
      })();
    }
    return schemaReady;
  }

  /**
   * 列出所有人工岗位画像。
   * 通过子查询从 jobs 表匹配 job_id（精确匹配同名岗位的第一条记录），
   * 如果职业名称匹配不上则 fallback_job_id 为空。
   */
  async function listManualJobPortraitsFromTable(): Promise<ManualJobPortraitRecord[]> {
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
          WHERE lower(trim(j2.title)) = lower(trim(p.job_name))
            AND regexp_replace(lower(trim(j2.title)), '[^a-z0-9\\u4e00-\\u9fa5+#]+', '', 'g') =
              regexp_replace(lower(trim(p.job_name)), '[^a-z0-9\\u4e00-\\u9fa5+#]+', '', 'g')
          ORDER BY j2.id DESC
          LIMIT 1
        ) AS job_id
      FROM v2_manual_job_portraits p
      ORDER BY p.created_at ASC, p.job_name ASC
    `);
    return result.rows.map((row) => mapManualJobPortrait(row));
  }

  /**
   * 按 job_id 列表批量查询岗位基础记录。
   * 用于在图谱查询时获取目标岗位的标题信息。
   */
  async function listJobsByIds(jobIds: number[]): Promise<JobRecord[]> {
    await ensureSchema();
    if (jobIds.length === 0) {
      return [];
    }
    const result = await pool.query(
      `SELECT * FROM jobs WHERE id = ANY($1::bigint[])`,
      [jobIds],
    );
    return result.rows.map((row) => mapJob(row));
  }

  return {
    listManualJobPortraitsFromTable,
    listJobsByIds,
  };
}
