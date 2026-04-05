/**
 * 文件作用：提供 matching 领域的 PostgreSQL 仓储实现。
 * 职责边界：负责匹配结果的存储、查询与复用命中，不承载评分算法本身。
 */

import type { Pool } from "pg";

import type {
  MatchListParams,
  MatchResultDetail,
  MatchResultListResponse,
  MatchResultSummary,
} from "@career/contracts/types";

import type {
  MatchResultCreateInput,
  MatchResultUniqueKey,
  MatchingRepository,
  NormalizedJobHint,
} from "./matching.repository.js";
import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";

function mapMatchResultDetail(row: Record<string, unknown>): MatchResultDetail {
  return {
    id: Number(row.id),
    student_profile_id: Number(row.student_profile_id),
    job_id: Number(row.job_id),
    job_profile_version: Number(row.job_profile_version),
    scoring_version: String(row.scoring_version),
    input_fingerprint: String(row.input_fingerprint),
    from_cache: Boolean(row.from_cache),
    dimension_scores: row.dimension_scores as MatchResultDetail["dimension_scores"],
    total_score: Number(row.total_score),
    gaps: (row.gaps as MatchResultDetail["gaps"]) ?? [],
    suggestions: (row.suggestions as string[]) ?? [],
    explanations: (row.explanations as MatchResultDetail["explanations"]) ?? [],
    path_recommendations:
      (row.path_recommendations as MatchResultDetail["path_recommendations"]) ?? [],
    evidence_refs: Array.isArray(row.evidence_refs) ? (row.evidence_refs as string[]) : [],
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

function toSummary(record: MatchResultDetail): MatchResultSummary {
  return {
    id: record.id,
    student_profile_id: record.student_profile_id,
    job_id: record.job_id,
    job_profile_version: record.job_profile_version,
    scoring_version: record.scoring_version,
    input_fingerprint: record.input_fingerprint,
    from_cache: record.from_cache,
    dimension_scores: record.dimension_scores,
    total_score: record.total_score,
    created_at: record.created_at,
  };
}

export function createPgMatchingRepository(pool: Pool): MatchingRepository {
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS match_results (
            id BIGSERIAL PRIMARY KEY,
            student_profile_id BIGINT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
            job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            job_profile_version INTEGER NOT NULL,
            scoring_version TEXT NOT NULL,
            input_fingerprint TEXT NOT NULL,
            from_cache BOOLEAN NOT NULL DEFAULT FALSE,
            dimension_scores JSONB NOT NULL,
            total_score DOUBLE PRECISION NOT NULL,
            gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
            suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
            explanations JSONB NOT NULL DEFAULT '[]'::jsonb,
            path_recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
            evidence_refs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`
          ALTER TABLE match_results
          ADD COLUMN IF NOT EXISTS path_recommendations JSONB NOT NULL DEFAULT '[]'::jsonb
        `);
        await pool.query(`
          ALTER TABLE match_results
          ADD COLUMN IF NOT EXISTS evidence_refs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS match_results_list_idx
          ON match_results (student_profile_id, job_id, created_at DESC)
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS match_results_reuse_idx
          ON match_results (
            student_profile_id,
            job_id,
            job_profile_version,
            scoring_version,
            input_fingerprint
          )
        `);
      })();
    }

    return schemaReady;
  }

  async function createMatchResult(input: MatchResultCreateInput): Promise<MatchResultDetail> {
    await ensureSchema();
    const result = await pool.query(
      `
        INSERT INTO match_results (
          student_profile_id,
          job_id,
          job_profile_version,
          scoring_version,
          input_fingerprint,
          from_cache,
          dimension_scores,
          total_score,
          gaps,
          suggestions,
          explanations,
          path_recommendations,
          evidence_refs
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::text[])
        RETURNING *
      `,
      [
        input.student_profile_id,
        input.job_id,
        input.job_profile_version,
        input.scoring_version,
        input.input_fingerprint,
        input.from_cache ?? false,
        JSON.stringify(input.dimension_scores),
        input.total_score,
        JSON.stringify(input.gaps),
        JSON.stringify(input.suggestions),
        JSON.stringify(input.explanations),
        JSON.stringify(input.path_recommendations ?? []),
        input.evidence_refs ?? [],
      ],
    );

    return mapMatchResultDetail(result.rows[0]);
  }

  async function getMatchResultById(matchId: number): Promise<MatchResultDetail | null> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM match_results
        WHERE id = $1
        LIMIT 1
      `,
      [matchId],
    );

    return result.rowCount ? mapMatchResultDetail(result.rows[0]) : null;
  }

  async function listMatchResults(params: MatchListParams): Promise<MatchResultListResponse> {
    await ensureSchema();

    const filters: string[] = [];
    const values: unknown[] = [];

    if (params.student_profile_id !== undefined) {
      values.push(params.student_profile_id);
      filters.push(`student_profile_id = $${values.length}`);
    }

    if (params.job_id !== undefined) {
      values.push(params.job_id);
      filters.push(`job_id = $${values.length}`);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const [countResult, listResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM match_results ${whereClause}`, values),
      pool.query(
        `
          SELECT *
          FROM match_results
          ${whereClause}
          ORDER BY created_at DESC
          OFFSET $${values.length + 1}
          LIMIT $${values.length + 2}
        `,
        [...values, params.offset, params.limit],
      ),
    ]);

    return {
      total: Number(countResult.rows[0]?.total ?? 0),
      items: listResult.rows.map((row) => toSummary(mapMatchResultDetail(row))),
    };
  }

  async function findReusableResult(
    uniqueKey: MatchResultUniqueKey,
  ): Promise<MatchResultDetail | null> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM match_results
        WHERE
          student_profile_id = $1 AND
          job_id = $2 AND
          job_profile_version = $3 AND
          scoring_version = $4 AND
          input_fingerprint = $5
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [
        uniqueKey.student_profile_id,
        uniqueKey.job_id,
        uniqueKey.job_profile_version,
        uniqueKey.scoring_version,
        uniqueKey.input_fingerprint,
      ],
    );

    return result.rowCount ? mapMatchResultDetail(result.rows[0]) : null;
  }

  async function getNormalizedJobHint(jobId: number): Promise<NormalizedJobHint | null> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT
          n.normalized_title,
          n.normalized_job_family,
          n.confidence
        FROM jobs j
        LEFT JOIN LATERAL (
          SELECT normalized_title, normalized_job_family, confidence
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
        WHERE j.id = $1
        LIMIT 1
      `,
      [jobId],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0] as Record<string, unknown>;
    return {
      normalized_title: (row.normalized_title as string | null) ?? null,
      normalized_job_family: (row.normalized_job_family as string | null) ?? null,
      confidence: row.confidence == null ? null : Number(row.confidence),
    };
  }

  return {
    createMatchResult,
    getMatchResultById,
    listMatchResults,
    findReusableResult,
    getNormalizedJobHint,
  };
}
