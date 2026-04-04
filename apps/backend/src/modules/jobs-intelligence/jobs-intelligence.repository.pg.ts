/**
 * 文件作用：提供岗位智能处理域的 PostgreSQL 仓储实现。
 * 职责边界：负责任务、岗位画像读写，不承载业务编排逻辑。
 */

import { createHash } from "node:crypto";

import type { Pool } from "pg";

import type {
  CanonicalRoleRecord,
  CanonicalRoleProfileDraft,
  CanonicalRolesListParams,
  CanonicalRolesListResponse,
  JobFactsListParams,
  JobFactsListResponse,
  JobPipelineMode,
  JobPipelineTaskRecord,
  JobPipelineTaskStatus,
  JobProfileV2Record,
  JobProfilesV2ListParams,
  JobProfilesV2ListResponse,
  JobRecord,
  PostingProfileFacts,
} from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";
import type {
  JobFactsCreateInput,
  JobProfileV2CreateInput,
  JobsIntelligenceRepository,
  PipelineJobRecord,
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

function mapPipelineJob(row: Record<string, unknown>): PipelineJobRecord {
  const base = mapJob(row);
  return {
    ...base,
    normalized_title_hint: (row.normalized_title_hint as string | null) ?? null,
    normalized_job_family_hint: (row.normalized_job_family_hint as string | null) ?? null,
    normalization_confidence_hint:
      row.normalization_confidence_hint == null
        ? null
        : Number(row.normalization_confidence_hint),
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
    graph_covered_jobs: Number(row.graph_covered_jobs ?? 0),
    graph_isolated_ratio: Number(row.graph_isolated_ratio ?? 0),
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

function mapCanonicalRole(row: Record<string, unknown>): CanonicalRoleRecord {
  const summaryPayload = (row.summary_payload as Record<string, unknown> | null) ?? {};
  return {
    role_key: String(row.role_key),
    canonical_version: Number(row.canonical_version ?? 1),
    content_hash: String(row.content_hash ?? ""),
    normalized_title: String(row.normalized_title),
    job_family: String(row.job_family),
    level_band: String(row.level_band),
    sample_size: Number(row.sample_size),
    core_required_skills: Array.isArray(row.core_required_skills)
      ? row.core_required_skills.map(String)
      : [],
    common_required_skills: Array.isArray(row.common_required_skills)
      ? row.common_required_skills.map(String)
      : [],
    bonus_required_skills: Array.isArray(row.bonus_required_skills)
      ? row.bonus_required_skills.map(String)
      : [],
    core_tools: Array.isArray(row.core_tools) ? row.core_tools.map(String) : [],
    soft_skills: Array.isArray(row.soft_skills) ? row.soft_skills.map(String) : [],
    representative_responsibilities: Array.isArray(row.representative_responsibilities)
      ? row.representative_responsibilities.map(String)
      : [],
    summary_version: "v1",
    summary: {
      role_overview: String(summaryPayload.role_overview ?? ""),
      core_responsibilities: Array.isArray(summaryPayload.core_responsibilities)
        ? summaryPayload.core_responsibilities.map(String)
        : [],
      core_requirements: Array.isArray(summaryPayload.core_requirements)
        ? summaryPayload.core_requirements.map(String)
        : [],
      bonus_items: Array.isArray(summaryPayload.bonus_items)
        ? summaryPayload.bonus_items.map(String)
        : [],
      entry_path: Array.isArray(summaryPayload.entry_path)
        ? summaryPayload.entry_path.map(String)
        : [],
      development_directions: Array.isArray(summaryPayload.development_directions)
        ? summaryPayload.development_directions.map(String)
        : [],
    },
    confidence: Number(row.confidence),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function buildCanonicalContentHash(input: CanonicalRoleProfileDraft): string {
  const payload = {
    normalized_title: input.normalized_title,
    job_family: input.job_family,
    level_band: input.level_band,
    sample_size: input.sample_size,
    core_required_skills: input.core_required_skills,
    common_required_skills: input.common_required_skills,
    bonus_required_skills: input.bonus_required_skills,
    core_tools: input.core_tools,
    soft_skills: input.soft_skills,
    representative_responsibilities: input.representative_responsibilities,
    summary_version: input.summary_version,
    summary: input.summary,
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function mapFactRow(
  row: Record<string, unknown>,
  evidence: Array<{
    field: "required_skills" | "preferred_skills" | "tools" | "certificates" | "education_requirement" | "experience_requirement" | "soft_skills";
    text: string;
    source: "job_description" | "title" | "company_intro";
  }>,
): PostingProfileFacts {
  return {
    job_id: Number(row.job_id),
    normalized_title: String(row.normalized_title),
    job_family: String(row.job_family),
    job_level: Number(row.job_level),
    responsibilities: Array.isArray(row.responsibilities) ? row.responsibilities.map(String) : [],
    required_skills: Array.isArray(row.required_skills) ? row.required_skills.map(String) : [],
    preferred_skills: Array.isArray(row.preferred_skills) ? row.preferred_skills.map(String) : [],
    tools: Array.isArray(row.tools) ? row.tools.map(String) : [],
    certificates: Array.isArray(row.certificates) ? row.certificates.map(String) : [],
    education_requirement: String(row.education_requirement ?? ""),
    experience_requirement: String(row.experience_requirement ?? ""),
    soft_skills: Array.isArray(row.soft_skills) ? row.soft_skills.map(String) : [],
    industry_context: Array.isArray(row.industry_context) ? row.industry_context.map(String) : [],
    evidence,
    confidence: Number(row.confidence ?? 0),
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
            graph_covered_jobs INTEGER NOT NULL DEFAULT 0,
            graph_isolated_ratio DOUBLE PRECISION NOT NULL DEFAULT 0,
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
          ALTER TABLE v2_pipeline_tasks
          ADD COLUMN IF NOT EXISTS graph_covered_jobs INTEGER NOT NULL DEFAULT 0
        `);
        await pool.query(`
          ALTER TABLE v2_pipeline_tasks
          ADD COLUMN IF NOT EXISTS graph_isolated_ratio DOUBLE PRECISION NOT NULL DEFAULT 0
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
          CREATE TABLE IF NOT EXISTS v2_job_facts (
            id BIGSERIAL PRIMARY KEY,
            job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            normalized_title TEXT NOT NULL,
            job_family TEXT NOT NULL,
            job_level INTEGER NOT NULL,
            responsibilities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            required_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            preferred_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            tools TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            certificates TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            education_requirement TEXT NOT NULL DEFAULT '',
            experience_requirement TEXT NOT NULL DEFAULT '',
            soft_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            industry_context TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            confidence DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS v2_job_facts_job_idx
          ON v2_job_facts (job_id, created_at DESC)
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS v2_job_fact_evidence (
            id BIGSERIAL PRIMARY KEY,
            fact_id BIGINT NOT NULL REFERENCES v2_job_facts(id) ON DELETE CASCADE,
            field TEXT NOT NULL,
            text TEXT NOT NULL,
            source TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS v2_job_fact_evidence_fact_idx
          ON v2_job_fact_evidence (fact_id)
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS v2_canonical_roles (
            id BIGSERIAL PRIMARY KEY,
            role_key TEXT NOT NULL UNIQUE,
            canonical_version INTEGER NOT NULL DEFAULT 1,
            content_hash TEXT NOT NULL DEFAULT '',
            normalized_title TEXT NOT NULL,
            job_family TEXT NOT NULL,
            level_band TEXT NOT NULL,
            sample_size INTEGER NOT NULL,
            core_required_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            common_required_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            bonus_required_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            core_tools TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            soft_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            representative_responsibilities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            confidence DOUBLE PRECISION NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
          await pool.query(`
            ALTER TABLE v2_canonical_roles
            ADD COLUMN IF NOT EXISTS summary_version TEXT NOT NULL DEFAULT 'v1'
          `);
          await pool.query(`
            ALTER TABLE v2_canonical_roles
            ADD COLUMN IF NOT EXISTS summary_payload JSONB NOT NULL DEFAULT '{}'::jsonb
          `);
          await pool.query(`
            ALTER TABLE v2_canonical_roles
            ADD COLUMN IF NOT EXISTS canonical_version INTEGER NOT NULL DEFAULT 1
          `);
          await pool.query(`
            ALTER TABLE v2_canonical_roles
            ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT ''
          `);

          await pool.query(`
            CREATE TABLE IF NOT EXISTS v2_canonical_role_versions (
              id BIGSERIAL PRIMARY KEY,
              role_key TEXT NOT NULL,
              canonical_version INTEGER NOT NULL,
              content_hash TEXT NOT NULL,
              payload JSONB NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE (role_key, content_hash)
            )
          `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS v2_canonical_roles_family_level_idx
          ON v2_canonical_roles (job_family, level_band, updated_at DESC)
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
          graph_covered_jobs = COALESCE($9, graph_covered_jobs),
          graph_isolated_ratio = COALESCE($10, graph_isolated_ratio),
          family_count = COALESCE($11, family_count),
          message = COALESCE($12, message),
          error_message = COALESCE($13, error_message),
          started_at = COALESCE($14::timestamptz, started_at),
          finished_at = COALESCE($15::timestamptz, finished_at),
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
        input.graph_covered_jobs ?? null,
        input.graph_isolated_ratio ?? null,
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

  async function listPipelineJobs(mode: JobPipelineMode): Promise<PipelineJobRecord[]> {
    await ensureSchema();

    const baseSelect = `
      SELECT
        j.*,
        norm.normalized_title AS normalized_title_hint,
        norm.normalized_job_family AS normalized_job_family_hint,
        norm.confidence AS normalization_confidence_hint
      FROM jobs j
      LEFT JOIN LATERAL (
        SELECT
          n.normalized_title,
          n.normalized_job_family,
          n.confidence
        FROM job_normalized n
        WHERE
          n.normalized_title = j.title
          OR (
            j.source_row_id IS NOT NULL
            AND n.normalized_payload ->> 'source_row_id' = j.source_row_id
          )
        ORDER BY n.confidence DESC, n.updated_at DESC
        LIMIT 1
      ) norm ON true
    `;

    const result =
      mode === "incremental"
        ? await pool.query(
            `
              ${baseSelect}
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
              ${baseSelect}
              ORDER BY id ASC
            `,
          );

    return result.rows.map((row) => mapPipelineJob(row));
  }

  /**
   * 作用：写入单条岗位帖事实与字段证据。
   * 参数：input 为 posting facts 结构化结果。
   * 注意：该方法只负责持久化，不做事实正确性推断。
   */
  async function createJobFacts(input: JobFactsCreateInput): Promise<void> {
    await ensureSchema();
    const factResult = await pool.query(
      `
        INSERT INTO v2_job_facts (
          job_id,
          normalized_title,
          job_family,
          job_level,
          responsibilities,
          required_skills,
          preferred_skills,
          tools,
          certificates,
          education_requirement,
          experience_requirement,
          soft_skills,
          industry_context,
          confidence
        )
        VALUES (
          $1, $2, $3, $4,
          $5::text[], $6::text[], $7::text[], $8::text[], $9::text[],
          $10, $11, $12::text[], $13::text[], $14
        )
        RETURNING id
      `,
      [
        input.job_id,
        input.normalized_title,
        input.job_family,
        input.job_level,
        input.responsibilities,
        input.required_skills,
        input.preferred_skills,
        input.tools,
        input.certificates,
        input.education_requirement,
        input.experience_requirement,
        input.soft_skills,
        input.industry_context,
        input.confidence,
      ],
    );

    const factId = Number(factResult.rows[0]?.id);
    if (!Number.isFinite(factId)) {
      throw new Error("JOB_FACT_INSERT_FAILED");
    }

    for (const item of input.evidence) {
      await pool.query(
        `
          INSERT INTO v2_job_fact_evidence (fact_id, field, text, source)
          VALUES ($1, $2, $3, $4)
        `,
        [factId, item.field, item.text, item.source],
      );
    }
  }

  async function listLatestJobFactsForCanonical(): Promise<PostingProfileFacts[]> {
    await ensureSchema();
    const factsResult = await pool.query(
      `
        WITH latest AS (
          SELECT DISTINCT ON (job_id) *
          FROM v2_job_facts
          ORDER BY job_id, created_at DESC
        )
        SELECT *
        FROM latest
        ORDER BY job_id ASC
      `,
    );

    if (!factsResult.rowCount) {
      return [];
    }

    const factIds = factsResult.rows.map((row) => Number(row.id));
    const evidenceResult = await pool.query(
      `
        SELECT fact_id, field, text, source
        FROM v2_job_fact_evidence
        WHERE fact_id = ANY($1::bigint[])
      `,
      [factIds],
    );

    const evidenceByFactId = new Map<
      number,
      Array<{ field: PostingProfileFacts["evidence"][number]["field"]; text: string; source: PostingProfileFacts["evidence"][number]["source"] }>
    >();
    for (const row of evidenceResult.rows) {
      const factId = Number(row.fact_id);
      const list = evidenceByFactId.get(factId) ?? [];
      list.push({
        field: String(row.field) as PostingProfileFacts["evidence"][number]["field"],
        text: String(row.text),
        source: String(row.source) as PostingProfileFacts["evidence"][number]["source"],
      });
      evidenceByFactId.set(factId, list);
    }

    return factsResult.rows.map((row) => {
      const factId = Number(row.id);
      return mapFactRow(row, evidenceByFactId.get(factId) ?? []);
    });
  }

  async function listJobFacts(params: JobFactsListParams): Promise<JobFactsListResponse> {
    const allFacts = await listLatestJobFactsForCanonical();
    const filtered = allFacts.filter((item) => {
      if (params.job_family && item.job_family !== params.job_family) {
        return false;
      }
      if (params.keyword) {
        const keyword = params.keyword.toLowerCase();
        const haystack = [item.normalized_title, item.job_family, ...item.required_skills]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }
      return true;
    });

    return {
      total: filtered.length,
      items: filtered.slice(params.offset, params.offset + params.limit),
    };
  }

  async function getLatestJobFactByJobId(jobId: number): Promise<PostingProfileFacts | null> {
    await ensureSchema();
    const factResult = await pool.query(
      `
        SELECT *
        FROM v2_job_facts
        WHERE job_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [jobId],
    );

    if (!factResult.rowCount) {
      return null;
    }

    const row = factResult.rows[0] as Record<string, unknown>;
    const factId = Number(row.id);
    const evidenceResult = await pool.query(
      `
        SELECT field, text, source
        FROM v2_job_fact_evidence
        WHERE fact_id = $1
      `,
      [factId],
    );

    const evidence = evidenceResult.rows.map((item) => ({
      field: String(item.field) as
        | "required_skills"
        | "preferred_skills"
        | "tools"
        | "certificates"
        | "education_requirement"
        | "experience_requirement"
        | "soft_skills",
      text: String(item.text),
      source: String(item.source) as "job_description" | "title" | "company_intro",
    }));

    return mapFactRow(row, evidence);
  }

  async function upsertCanonicalRoleProfile(input: CanonicalRoleProfileDraft): Promise<void> {
    await ensureSchema();
    const contentHash = buildCanonicalContentHash(input);
    const existingResult = await pool.query(
      `
        SELECT canonical_version, content_hash
        FROM v2_canonical_roles
        WHERE role_key = $1
        LIMIT 1
      `,
      [input.role_key],
    );

    const existingVersion = existingResult.rowCount
      ? Number(existingResult.rows[0].canonical_version ?? 1)
      : 0;
    const existingHash = existingResult.rowCount
      ? String(existingResult.rows[0].content_hash ?? "")
      : "";

    const nextVersion = existingVersion > 0 ? existingVersion + 1 : 1;

    if (existingVersion > 0 && existingHash === contentHash) {
      await pool.query(
        `
          UPDATE v2_canonical_roles
          SET updated_at = NOW()
          WHERE role_key = $1
        `,
        [input.role_key],
      );
      await pool.query(
        `
          INSERT INTO v2_canonical_role_versions (role_key, canonical_version, content_hash, payload)
          VALUES ($1, $2, $3, $4::jsonb)
          ON CONFLICT (role_key, content_hash) DO NOTHING
        `,
        [input.role_key, existingVersion, contentHash, JSON.stringify(input)],
      );
      return;
    }

    await pool.query(
      `
        INSERT INTO v2_canonical_roles (
          role_key,
          canonical_version,
          content_hash,
          normalized_title,
          job_family,
          level_band,
          sample_size,
          core_required_skills,
          common_required_skills,
          bonus_required_skills,
          core_tools,
          soft_skills,
          representative_responsibilities,
          summary_version,
          summary_payload,
          confidence,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::text[],
          $14, $15::jsonb, $16, NOW()
        )
        ON CONFLICT (role_key)
        DO UPDATE
        SET
          canonical_version = EXCLUDED.canonical_version,
          content_hash = EXCLUDED.content_hash,
          normalized_title = EXCLUDED.normalized_title,
          job_family = EXCLUDED.job_family,
          level_band = EXCLUDED.level_band,
          sample_size = EXCLUDED.sample_size,
          core_required_skills = EXCLUDED.core_required_skills,
          common_required_skills = EXCLUDED.common_required_skills,
          bonus_required_skills = EXCLUDED.bonus_required_skills,
          core_tools = EXCLUDED.core_tools,
          soft_skills = EXCLUDED.soft_skills,
          representative_responsibilities = EXCLUDED.representative_responsibilities,
          summary_version = EXCLUDED.summary_version,
          summary_payload = EXCLUDED.summary_payload,
          confidence = EXCLUDED.confidence,
          updated_at = NOW()
      `,
      [
        input.role_key,
        nextVersion,
        contentHash,
        input.normalized_title,
        input.job_family,
        input.level_band,
        input.sample_size,
        input.core_required_skills,
        input.common_required_skills,
        input.bonus_required_skills,
        input.core_tools,
        input.soft_skills,
        input.representative_responsibilities,
        input.summary_version,
        JSON.stringify(input.summary),
        input.confidence,
      ],
    );

    await pool.query(
      `
        INSERT INTO v2_canonical_role_versions (role_key, canonical_version, content_hash, payload)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (role_key, content_hash) DO NOTHING
      `,
      [input.role_key, nextVersion, contentHash, JSON.stringify(input)],
    );
  }

  async function listCanonicalRoles(
    params: CanonicalRolesListParams,
  ): Promise<CanonicalRolesListResponse> {
    await ensureSchema();
    const values: unknown[] = [];
    const filters: string[] = [];

    if (params.keyword) {
      values.push(`%${params.keyword.toLowerCase()}%`);
      filters.push(`LOWER(normalized_title) LIKE $${values.length}`);
    }
    if (params.job_family) {
      values.push(params.job_family);
      filters.push(`job_family = $${values.length}`);
    }
    if (params.level_band) {
      values.push(params.level_band);
      filters.push(`level_band = $${values.length}`);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const countSql = `SELECT COUNT(*)::int AS total FROM v2_canonical_roles ${where}`;
    const listSql = `
      SELECT *
      FROM v2_canonical_roles
      ${where}
      ORDER BY sample_size DESC, updated_at DESC
      OFFSET $${values.length + 1}
      LIMIT $${values.length + 2}
    `;

    const [countResult, listResult] = await Promise.all([
      pool.query(countSql, values),
      pool.query(listSql, [...values, params.offset, params.limit]),
    ]);

    return {
      total: Number(countResult.rows[0]?.total ?? 0),
      items: listResult.rows.map((row) => mapCanonicalRole(row)),
    };
  }

  async function getCanonicalRoleByKey(roleKey: string): Promise<CanonicalRoleRecord | null> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM v2_canonical_roles
        WHERE role_key = $1
        LIMIT 1
      `,
      [roleKey],
    );
    if (!result.rowCount) {
      return null;
    }
    return mapCanonicalRole(result.rows[0]);
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
    createJobFacts,
    listLatestJobFactsForCanonical,
    listJobFacts,
    getLatestJobFactByJobId,
    upsertCanonicalRoleProfile,
    listCanonicalRoles,
    getCanonicalRoleByKey,
    getLatestProfileByJobId,
    createJobProfile,
    listLatestProfiles,
    listLatestProfilesForGraph,
    listJobsByIds,
  };
}
