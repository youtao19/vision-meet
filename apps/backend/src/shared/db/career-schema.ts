/**
 * 文件作用：统一初始化业务主数据表，避免各 repository 首次访问时因外键依赖顺序不同而建表失败。
 * 职责边界：这里只保证表骨架存在；具体查询优化索引和字段读写逻辑仍由各领域 repository 自行维护。
 */

import type { Pool } from "pg";

let schemaReady = new WeakMap<Pool, Promise<void>>();

export async function ensureCareerCoreSchema(pool: Pool): Promise<void> {
  const existing = schemaReady.get(pool);
  if (existing) {
    return existing;
  }

  const initializing = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id BIGSERIAL PRIMARY KEY,
        source_row_id TEXT,
        normalized_source_key TEXT,
        title TEXT NOT NULL,
        location TEXT,
        salary_range TEXT,
        company_name TEXT,
        industry TEXT,
        company_size TEXT,
        company_type TEXT,
        job_code TEXT,
        job_description TEXT,
        company_intro TEXT,
        raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      ALTER TABLE jobs
      ADD COLUMN IF NOT EXISTS normalized_source_key TEXT
    `);

    // 历史 raw_job_posts/job_normalized/career_nodes 等表已从运行链路移除；
    // 当前岗位主数据统一落在 jobs，路径图谱统一落在 Neo4j。

    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_profiles (
        id BIGSERIAL PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_digest TEXT NOT NULL,
        basic_info JSONB NOT NULL,
        preference JSONB NOT NULL,
        education JSONB NOT NULL,
        skills JSONB NOT NULL DEFAULT '[]'::jsonb,
        certificates JSONB NOT NULL DEFAULT '[]'::jsonb,
        experiences JSONB NOT NULL DEFAULT '[]'::jsonb,
        self_assessment JSONB NOT NULL,
        evidences JSONB NOT NULL DEFAULT '[]'::jsonb,
        evaluation JSONB NOT NULL,
        parse_meta JSONB NOT NULL,
        summary TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

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
      CREATE TABLE IF NOT EXISTS career_reports (
        id BIGSERIAL PRIMARY KEY,
        match_id BIGINT NOT NULL REFERENCES match_results(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        student_profile_id BIGINT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
        job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        total_score DOUBLE PRECISION NOT NULL,
        sections JSONB NOT NULL DEFAULT '[]'::jsonb,
        generator_mode TEXT NOT NULL DEFAULT 'template',
        evidence_refs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        action_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(match_id, version)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS career_report_exports (
        id BIGSERIAL PRIMARY KEY,
        report_id BIGINT NOT NULL REFERENCES career_reports(id) ON DELETE CASCADE,
        format TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size_bytes BIGINT NOT NULL,
        download_path TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_resume_html_records (
        id BIGSERIAL PRIMARY KEY,
        trace_id TEXT NOT NULL,
        model TEXT,
        basic_name TEXT NOT NULL,
        target_position TEXT NOT NULL,
        summary TEXT,
        input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        html TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS ai_resume_html_records_created_idx
      ON ai_resume_html_records (created_at DESC)
    `);
  })();

  schemaReady.set(pool, initializing);
  return initializing;
}
