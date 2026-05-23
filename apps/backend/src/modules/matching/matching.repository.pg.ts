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
} from "./matching.repository.js";
import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";

function mapMatchResultDetail(row: Record<string, unknown>): MatchResultDetail {
  return {
    id: Number(row.id),
    student_profile_id: Number(row.student_profile_id),
    job_portrait_name: String(row.job_portrait_name || row.job_title || ""),
    job_portrait_snapshot:
      (row.job_portrait_snapshot as MatchResultDetail["job_portrait_snapshot"] | null) ?? null,
    job_title: (row.job_title as string | null) ?? String(row.job_portrait_name || ""),
    job_profile_version: Number(row.job_profile_version),
    scoring_version: String(row.scoring_version),
    input_fingerprint: String(row.input_fingerprint),
    from_cache: Boolean(row.from_cache),
    dimension_scores: row.dimension_scores as MatchResultDetail["dimension_scores"],
    total_score: Number(row.total_score),
    confidence: Number(row.confidence ?? 0),
    level: (row.level as MatchResultDetail["level"] | null) ?? "basic_match",
    gaps: (row.gaps as MatchResultDetail["gaps"]) ?? [],
    suggestions: (row.suggestions as string[]) ?? [],
    explanations: (row.explanations as MatchResultDetail["explanations"]) ?? [],
    path_recommendations:
      (row.path_recommendations as MatchResultDetail["path_recommendations"]) ?? [],
    evidence_refs: Array.isArray(row.evidence_refs) ? (row.evidence_refs as string[]) : [],
    requirement_scores:
      (row.requirement_scores as MatchResultDetail["requirement_scores"] | null) ?? [],
    blocking_gaps: (row.blocking_gaps as MatchResultDetail["blocking_gaps"] | null) ?? [],
    matched_requirements:
      (row.matched_requirements as MatchResultDetail["matched_requirements"] | null) ?? [],
    weak_requirements:
      (row.weak_requirements as MatchResultDetail["weak_requirements"] | null) ?? [],
    scoring_snapshot: (row.scoring_snapshot as MatchResultDetail["scoring_snapshot"] | null) ?? {
      algorithm_version: String(row.scoring_version || "unknown"),
      dimension_weights: {
        base_requirements: 0.2,
        professional_skills: 0.45,
        professional_quality: 0.2,
        development_potential: 0.15,
      },
      requirement_count: 0,
      evidence_coverage: 0,
    },
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

function toSummary(record: MatchResultDetail): MatchResultSummary {
  return {
    id: record.id,
    student_profile_id: record.student_profile_id,
    job_portrait_name: record.job_portrait_name,
    job_portrait_snapshot: record.job_portrait_snapshot,
    job_title: record.job_title ?? null,
    job_profile_version: record.job_profile_version,
    scoring_version: record.scoring_version,
    input_fingerprint: record.input_fingerprint,
    from_cache: record.from_cache,
    dimension_scores: record.dimension_scores,
    total_score: record.total_score,
    confidence: record.confidence,
    level: record.level,
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
            job_portrait_name TEXT NOT NULL DEFAULT '',
            job_portrait_snapshot JSONB,
            job_profile_version INTEGER NOT NULL,
            scoring_version TEXT NOT NULL,
            input_fingerprint TEXT NOT NULL,
            from_cache BOOLEAN NOT NULL DEFAULT FALSE,
            dimension_scores JSONB NOT NULL,
            total_score DOUBLE PRECISION NOT NULL,
            confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
            level TEXT NOT NULL DEFAULT 'basic_match',
            gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
            suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
            explanations JSONB NOT NULL DEFAULT '[]'::jsonb,
            path_recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
            evidence_refs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            requirement_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
            blocking_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
            matched_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
            weak_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
            scoring_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`
          ALTER TABLE match_results
          ADD COLUMN IF NOT EXISTS job_portrait_name TEXT NOT NULL DEFAULT ''
        `);
        await pool.query(`
          ALTER TABLE match_results
          ADD COLUMN IF NOT EXISTS job_portrait_snapshot JSONB
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
          ALTER TABLE match_results
          ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION NOT NULL DEFAULT 0
        `);
        await pool.query(`
          ALTER TABLE match_results
          ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'basic_match'
        `);
        await pool.query(`
          ALTER TABLE match_results
          ADD COLUMN IF NOT EXISTS requirement_scores JSONB NOT NULL DEFAULT '[]'::jsonb
        `);
        await pool.query(`
          ALTER TABLE match_results
          ADD COLUMN IF NOT EXISTS blocking_gaps JSONB NOT NULL DEFAULT '[]'::jsonb
        `);
        await pool.query(`
          ALTER TABLE match_results
          ADD COLUMN IF NOT EXISTS matched_requirements JSONB NOT NULL DEFAULT '[]'::jsonb
        `);
        await pool.query(`
          ALTER TABLE match_results
          ADD COLUMN IF NOT EXISTS weak_requirements JSONB NOT NULL DEFAULT '[]'::jsonb
        `);
        await pool.query(`
          ALTER TABLE match_results
          ADD COLUMN IF NOT EXISTS scoring_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS match_results_portrait_list_idx
          ON match_results (student_profile_id, job_portrait_name, created_at DESC)
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS match_results_reuse_idx
          ON match_results (
            student_profile_id,
            job_portrait_name,
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
          job_portrait_name,
          job_portrait_snapshot,
          job_profile_version,
          scoring_version,
          input_fingerprint,
          from_cache,
          dimension_scores,
          total_score,
          confidence,
          level,
          gaps,
          suggestions,
          explanations,
          path_recommendations,
          evidence_refs,
          requirement_scores,
          blocking_gaps,
          matched_requirements,
          weak_requirements,
          scoring_snapshot
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::text[], $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb)
        RETURNING *
      `,
      [
        input.student_profile_id,
        input.job_portrait_name,
        JSON.stringify(input.job_portrait_snapshot ?? null),
        input.job_profile_version,
        input.scoring_version,
        input.input_fingerprint,
        input.from_cache ?? false,
        JSON.stringify(input.dimension_scores),
        input.total_score,
        input.confidence,
        input.level,
        JSON.stringify(input.gaps),
        JSON.stringify(input.suggestions),
        JSON.stringify(input.explanations),
        JSON.stringify(input.path_recommendations ?? []),
        input.evidence_refs ?? [],
        JSON.stringify(input.requirement_scores ?? []),
        JSON.stringify(input.blocking_gaps ?? []),
        JSON.stringify(input.matched_requirements ?? []),
        JSON.stringify(input.weak_requirements ?? []),
        JSON.stringify(input.scoring_snapshot ?? {}),
      ],
    );

    return mapMatchResultDetail(result.rows[0]);
  }

  async function getMatchResultById(matchId: number): Promise<MatchResultDetail | null> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT mr.*
        FROM match_results mr
        WHERE mr.id = $1
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
      filters.push(`mr.student_profile_id = $${values.length}`);
    }

    if (params.job_portrait_name !== undefined) {
      values.push(params.job_portrait_name);
      filters.push(`mr.job_portrait_name = $${values.length}`);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const [countResult, listResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM match_results mr ${whereClause}`, values),
      pool.query(
        `
          SELECT mr.*
          FROM match_results mr
          ${whereClause}
          ORDER BY mr.created_at DESC
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
        SELECT mr.*
        FROM match_results mr
        WHERE
          mr.student_profile_id = $1 AND
          mr.job_portrait_name = $2 AND
          mr.job_profile_version = $3 AND
          mr.scoring_version = $4 AND
          mr.input_fingerprint = $5
        ORDER BY mr.created_at DESC
        LIMIT 1
      `,
      [
        uniqueKey.student_profile_id,
        uniqueKey.job_portrait_name,
        uniqueKey.job_profile_version,
        uniqueKey.scoring_version,
        uniqueKey.input_fingerprint,
      ],
    );

    return result.rowCount ? mapMatchResultDetail(result.rows[0]) : null;
  }

  return {
    createMatchResult,
    getMatchResultById,
    listMatchResults,
    findReusableResult,
  };
}
