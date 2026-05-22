/**
 * 文件作用：提供学生画像的 PostgreSQL 仓储实现。
 * 边界说明：本文件只负责建表、兼容旧表结构、JSONB 读写和结果映射，不承载画像评分或解析规则。
 */

import type { Pool } from "pg";

import type { ListStudentProfilesResponse, StudentProfileRecord } from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";
import type { ProfileRepository, StudentProfileCreateInput } from "./profile.repository.js";

/**
 * 读取 JSONB 字段。
 * 逻辑：pg 有时返回对象、有时测试替身或历史数据可能返回字符串；解析失败时返回默认结构，避免旧脏数据拖垮列表页。
 */
function readJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/**
 * 把数据库行映射为学生画像合同对象。
 * 逻辑：所有 JSONB 字段都经过 readJson 兜底，时间字段统一转 ISO 字符串，保证前端拿到稳定结构。
 */
function mapStudentProfileRecord(row: Record<string, unknown>): StudentProfileRecord {
  return {
    id: Number(row.id),
    source_type: row.source_type as StudentProfileRecord["source_type"],
    source_digest: String(row.source_digest),
    basic_info: readJson(row.basic_info, { name: "匿名候选人" }),
    preference: readJson(row.preference, {
      target_role: "",
      preferred_cities: [],
      preferred_industries: [],
    }),
    education: readJson(row.education, {
      school: null,
      level: null,
      major: null,
      graduation_year: null,
      evidence_refs: [],
    }),
    skills: readJson(row.skills, []),
    certificates: readJson(row.certificates, []),
    experiences: readJson(row.experiences, []),
    self_assessment: readJson(row.self_assessment, {
      communication: 3,
      learning: 3,
      stress_tolerance: 3,
      innovation: 3,
    }),
    evidences: readJson(row.evidences, []),
    evaluation: readJson(row.evaluation, {
      dimension_scores: {
        base_requirements: 0,
        professional_skills: 0,
        professional_quality: 0,
        development_potential: 0,
      },
      completeness_score: 0,
      competitiveness_score: 0,
      missing_items: [],
      warnings: [],
    }),
    parse_meta: readJson(row.parse_meta, {
      parser: "manual",
      model: null,
      confidence: 1,
      warnings: [],
    }),
    summary: String(row.summary || ""),
    created_at: new Date(row.created_at as string | Date).toISOString(),
  };
}

/**
 * 判断 student_profiles 是否已经是新版结构。
 * 逻辑：以 basic_info JSONB 列作为结构化画像表的判定点，用于决定是否需要清理旧列。
 */
async function hasStructuredProfileColumns(pool: Pool): Promise<boolean> {
  const result = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'student_profiles'
        AND column_name = 'basic_info'
      LIMIT 1
    `,
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * 必要时重置旧版画像表。
 * 逻辑：如果表存在但还没有 basic_info 这类新版 JSONB 列，就清空旧数据并删除旧扁平列，
 * 避免 ALTER TABLE 添加 NOT NULL JSONB 列时和旧结构冲突。
 */
async function resetOldProfileTableIfNeeded(pool: Pool): Promise<void> {
  const tableResult = await pool.query(`
    SELECT to_regclass('student_profiles') AS table_name
  `);
  if (!tableResult.rows[0]?.table_name) {
    return;
  }

  if (await hasStructuredProfileColumns(pool)) {
    return;
  }

  await pool.query("TRUNCATE TABLE student_profiles RESTART IDENTITY CASCADE");
  await pool.query(`
    ALTER TABLE student_profiles
      DROP COLUMN IF EXISTS name,
      DROP COLUMN IF EXISTS target_role,
      DROP COLUMN IF EXISTS education_level,
      DROP COLUMN IF EXISTS major,
      DROP COLUMN IF EXISTS graduation_year,
      DROP COLUMN IF EXISTS skills,
      DROP COLUMN IF EXISTS certificates,
      DROP COLUMN IF EXISTS experience,
      DROP COLUMN IF EXISTS dimension_scores,
      DROP COLUMN IF EXISTS completeness_score,
      DROP COLUMN IF EXISTS competitiveness_score,
      DROP COLUMN IF EXISTS missing_items,
          DROP COLUMN IF EXISTS personal_summary
  `);
  await pool.query("DROP INDEX IF EXISTS student_profiles_target_role_idx");
}

/**
 * 创建 PostgreSQL 学生画像仓储。
 * 逻辑：内部懒加载建表流程，所有公开方法执行前都会先确保表结构可用。
 */
export function createPgProfileRepository(pool: Pool): ProfileRepository {
  let schemaReady: Promise<void> | null = null;

  /**
   * 确保画像表结构存在。
   * 逻辑：先准备核心 schema，再处理旧表兼容，最后创建或补齐新版 JSONB 列与目标岗位索引。
   */
  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);
        await resetOldProfileTableIfNeeded(pool);
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
          ALTER TABLE student_profiles
            ADD COLUMN IF NOT EXISTS basic_info JSONB NOT NULL DEFAULT '{"name":"匿名候选人"}'::jsonb,
            ADD COLUMN IF NOT EXISTS preference JSONB NOT NULL DEFAULT '{"target_role":"","preferred_cities":[],"preferred_industries":[]}'::jsonb,
            ADD COLUMN IF NOT EXISTS education JSONB NOT NULL DEFAULT '{"school":null,"level":null,"major":null,"graduation_year":null,"evidence_refs":[]}'::jsonb,
            ADD COLUMN IF NOT EXISTS skills JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS certificates JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS experiences JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS evidences JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS evaluation JSONB NOT NULL DEFAULT '{"dimension_scores":{"base_requirements":0,"professional_skills":0,"professional_quality":0,"development_potential":0},"completeness_score":0,"competitiveness_score":0,"missing_items":[],"warnings":[]}'::jsonb,
            ADD COLUMN IF NOT EXISTS parse_meta JSONB NOT NULL DEFAULT '{"parser":"manual","model":null,"confidence":1,"warnings":[]}'::jsonb
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS student_profiles_target_role_idx
          ON student_profiles ((preference->>'target_role'), id DESC)
        `);
      })();
    }

    return schemaReady;
  }

  /**
   * 查询学生画像列表。
   * 逻辑：确保 schema 后按 id 倒序读取全量记录，并统一映射成合同对象。
   */
  async function listStudentProfiles(): Promise<ListStudentProfilesResponse> {
    await ensureSchema();
    const result = await pool.query(`
      SELECT *
      FROM student_profiles
      ORDER BY id DESC
    `);

    return {
      total: result.rowCount ?? result.rows.length,
      items: result.rows.map((row) => mapStudentProfileRecord(row)),
    };
  }

  /**
   * 按 ID 查询学生画像。
   * 逻辑：确保 schema 后查单条记录，命中则映射合同对象，未命中返回 null。
   */
  async function getStudentProfileById(profileId: number): Promise<StudentProfileRecord | null> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM student_profiles
        WHERE id = $1
        LIMIT 1
      `,
      [profileId],
    );

    return result.rowCount ? mapStudentProfileRecord(result.rows[0]) : null;
  }

  /**
   * 创建学生画像记录。
   * 逻辑：service 已经完成归一化和评分，这里只把结构化字段序列化为 JSONB 后写入数据库。
   */
  async function createStudentProfile(
    input: StudentProfileCreateInput,
  ): Promise<StudentProfileRecord> {
    await ensureSchema();
    const result = await pool.query(
      `
        INSERT INTO student_profiles (
          source_type,
          source_digest,
          basic_info,
          preference,
          education,
          skills,
          certificates,
          experiences,
          self_assessment,
          evidences,
          evaluation,
          parse_meta,
          summary
        )
        VALUES (
          $1, $2, $3::jsonb, $4::jsonb, $5::jsonb,
          $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb,
          $10::jsonb, $11::jsonb, $12::jsonb, $13
        )
        RETURNING *
      `,
      [
        input.source_type,
        input.source_digest,
        JSON.stringify(input.basic_info),
        JSON.stringify(input.preference),
        JSON.stringify(input.education),
        JSON.stringify(input.skills),
        JSON.stringify(input.certificates),
        JSON.stringify(input.experiences),
        JSON.stringify(input.self_assessment),
        JSON.stringify(input.evidences),
        JSON.stringify(input.evaluation),
        JSON.stringify(input.parse_meta),
        input.summary,
      ],
    );

    return mapStudentProfileRecord(result.rows[0]);
  }

  return {
    listStudentProfiles,
    getStudentProfileById,
    createStudentProfile,
  };
}
