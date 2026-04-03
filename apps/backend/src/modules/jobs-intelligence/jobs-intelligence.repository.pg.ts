/**
 * 文件作用：提供岗位智能处理域的 PostgreSQL 仓储实现。
 * 职责边界：负责任务、岗位画像读写，不承载业务编排逻辑。
 */

import type { Pool } from "pg";

import type {
  JobPipelineMode,
  JobPipelineTaskRecord,
  JobPipelineTaskStatus,
  JobProfileV2Record,
  JobProfilesV2ListParams,
  JobProfilesV2ListResponse,
  JobRecord,
} from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";
import type {
  JobProfileV2CreateInput,
  JobsIntelligenceRepository,
  PipelineTaskUpdateInput,
} from "./jobs-intelligence.repository.js";

function mapJob(row: Record<string, unknown>): JobRecord {
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

function mapPipelineTask(row: Record<string, unknown>): JobPipelineTaskRecord {
  return {
    id: Number(row.id),
    mode: row.mode as JobPipelineMode,
    status: row.status as JobPipelineTaskStatus,
    total_jobs: Number(row.total_jobs),
    processed_jobs: Number(row.processed_jobs),
    success_profiles: Number(row.success_profiles),
    failed_profiles: Number(row.failed_profiles),
    graph_nodes: Number(row.graph_nodes),
    graph_edges: Number(row.graph_edges),
    family_count: Number(row.family_count),
    message: (row.message as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    started_at: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
    finished_at: row.finished_at ? new Date(String(row.finished_at)).toISOString() : null,
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

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

export function createPgJobsIntelligenceRepository(pool: Pool): JobsIntelligenceRepository {
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS v2_pipeline_tasks (
            id BIGSERIAL PRIMARY KEY,
            mode TEXT NOT NULL,
            status TEXT NOT NULL,
            total_jobs INTEGER NOT NULL DEFAULT 0,
            processed_jobs INTEGER NOT NULL DEFAULT 0,
            success_profiles INTEGER NOT NULL DEFAULT 0,
            failed_profiles INTEGER NOT NULL DEFAULT 0,
            graph_nodes INTEGER NOT NULL DEFAULT 0,
            graph_edges INTEGER NOT NULL DEFAULT 0,
            family_count INTEGER NOT NULL DEFAULT 0,
            message TEXT,
            error_message TEXT,
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

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
      })();
    }

    return schemaReady;
  }

  async function createPipelineTask(mode: JobPipelineMode): Promise<JobPipelineTaskRecord> {
    await ensureSchema();
    const result = await pool.query(
      `
        INSERT INTO v2_pipeline_tasks (mode, status)
        VALUES ($1, 'queued')
        RETURNING *
      `,
      [mode],
    );
    return mapPipelineTask(result.rows[0]);
  }

  async function getPipelineTask(taskId: number): Promise<JobPipelineTaskRecord | null> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM v2_pipeline_tasks
        WHERE id = $1
        LIMIT 1
      `,
      [taskId],
    );
    return result.rowCount ? mapPipelineTask(result.rows[0]) : null;
  }

  async function updatePipelineTask(
    taskId: number,
    input: PipelineTaskUpdateInput,
  ): Promise<JobPipelineTaskRecord> {
    await ensureSchema();

    const result = await pool.query(
      `
        UPDATE v2_pipeline_tasks
        SET
          status = COALESCE($2, status),
          total_jobs = COALESCE($3, total_jobs),
          processed_jobs = COALESCE($4, processed_jobs),
          success_profiles = COALESCE($5, success_profiles),
          failed_profiles = COALESCE($6, failed_profiles),
          graph_nodes = COALESCE($7, graph_nodes),
          graph_edges = COALESCE($8, graph_edges),
          family_count = COALESCE($9, family_count),
          message = COALESCE($10, message),
          error_message = COALESCE($11, error_message),
          started_at = COALESCE($12::timestamptz, started_at),
          finished_at = COALESCE($13::timestamptz, finished_at),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        taskId,
        input.status ?? null,
        input.total_jobs ?? null,
        input.processed_jobs ?? null,
        input.success_profiles ?? null,
        input.failed_profiles ?? null,
        input.graph_nodes ?? null,
        input.graph_edges ?? null,
        input.family_count ?? null,
        input.message ?? null,
        input.error_message ?? null,
        input.started_at ?? null,
        input.finished_at ?? null,
      ],
    );

    if (!result.rowCount) {
      throw new Error(`PIPELINE_TASK_NOT_FOUND:${taskId}`);
    }
    return mapPipelineTask(result.rows[0]);
  }

  async function listPipelineJobs(mode: JobPipelineMode): Promise<JobRecord[]> {
    await ensureSchema();
    const result =
      mode === "incremental"
        ? await pool.query(
            `
              SELECT j.*
              FROM jobs j
              LEFT JOIN LATERAL (
                SELECT profile_version
                FROM v2_job_profiles p
                WHERE p.job_id = j.id
                ORDER BY p.profile_version DESC
                LIMIT 1
              ) latest ON true
              WHERE latest.profile_version IS NULL
              ORDER BY j.id ASC
            `,
          )
        : await pool.query(
            `
              SELECT *
              FROM jobs
              ORDER BY id ASC
            `,
          );

    return result.rows.map((row) => mapJob(row));
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

  async function listLatestProfiles(params: JobProfilesV2ListParams): Promise<JobProfilesV2ListResponse> {
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

  async function listLatestProfilesForGraph(): Promise<JobProfileV2Record[]> {
    await ensureSchema();
    const result = await pool.query(`
      WITH latest AS (
        SELECT DISTINCT ON (job_id) *
        FROM v2_job_profiles
        ORDER BY job_id, profile_version DESC
      )
      SELECT *
      FROM latest
      ORDER BY job_id ASC
    `);
    return result.rows.map((row) => mapJobProfileV2(row));
  }

  async function listJobsByIds(jobIds: number[]): Promise<JobRecord[]> {
    await ensureSchema();
    if (jobIds.length === 0) {
      return [];
    }
    const result = await pool.query(
      `
        SELECT *
        FROM jobs
        WHERE id = ANY($1::bigint[])
      `,
      [jobIds],
    );
    return result.rows.map((row) => mapJob(row));
  }

  return {
    createPipelineTask,
    getPipelineTask,
    updatePipelineTask,
    listPipelineJobs,
    getLatestProfileByJobId,
    createJobProfile,
    listLatestProfiles,
    listLatestProfilesForGraph,
    listJobsByIds,
  };
}
