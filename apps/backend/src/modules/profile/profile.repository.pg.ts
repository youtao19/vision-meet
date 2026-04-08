/**
 * 文件作用：提供学生画像领域的 PostgreSQL 仓储实现。
 * 职责边界：负责画像记录的建表、读取和持久化，不处理画像评分与简历解析规则。
 */

import type { Pool } from "pg";

import type { ListStudentProfilesResponse, StudentProfileRecord } from "@career/contracts/types";

import { ensureCareerCoreSchema } from "../../shared/db/career-schema.js";
import type { ProfileRepository, StudentProfileCreateInput } from "./profile.repository.js";

function mapStudentProfileRecord(row: Record<string, unknown>): StudentProfileRecord {
  return {
    id: Number(row.id),
    source_type: row.source_type as StudentProfileRecord["source_type"],
    source_digest: String(row.source_digest),
    name: String(row.name),
    target_role: String(row.target_role),
    education_level: (row.education_level as string | null) ?? null,
    major: (row.major as string | null) ?? null,
    graduation_year: row.graduation_year === null ? null : Number(row.graduation_year),
    skills: Array.isArray(row.skills) ? (row.skills as string[]) : [],
    certificates: Array.isArray(row.certificates) ? (row.certificates as string[]) : [],
    experience: row.experience as StudentProfileRecord["experience"],
    self_assessment: row.self_assessment as StudentProfileRecord["self_assessment"],
    dimension_scores: row.dimension_scores as StudentProfileRecord["dimension_scores"],
    completeness_score: Number(row.completeness_score),
    competitiveness_score: Number(row.competitiveness_score),
    missing_items: Array.isArray(row.missing_items) ? (row.missing_items as string[]) : [],
    personal_summary: (row.personal_summary as string | null) ?? null,
    summary: String(row.summary),
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

export function createPgProfileRepository(pool: Pool): ProfileRepository {
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureCareerCoreSchema(pool);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS student_profiles (
            id BIGSERIAL PRIMARY KEY,
            source_type TEXT NOT NULL,
            source_digest TEXT NOT NULL,
            name TEXT NOT NULL,
            target_role TEXT NOT NULL,
            education_level TEXT,
            major TEXT,
            graduation_year INTEGER,
            skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            certificates TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            experience JSONB NOT NULL,
            self_assessment JSONB NOT NULL,
            dimension_scores JSONB NOT NULL,
            completeness_score DOUBLE PRECISION NOT NULL,
            competitiveness_score DOUBLE PRECISION NOT NULL,
            missing_items TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            personal_summary TEXT,
            summary TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS student_profiles_target_role_idx
            ON student_profiles (target_role, id DESC)
          `);
      })();
    }

    return schemaReady;
  }

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

  async function createStudentProfile(
    input: StudentProfileCreateInput,
  ): Promise<StudentProfileRecord> {
    await ensureSchema();
    const result = await pool.query(
      `
        INSERT INTO student_profiles (
          source_type,
          source_digest,
          name,
          target_role,
          education_level,
          major,
          graduation_year,
          skills,
          certificates,
          experience,
          self_assessment,
          dimension_scores,
          completeness_score,
          competitiveness_score,
          missing_items,
          personal_summary,
          summary
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8::text[], $9::text[], $10::jsonb, $11::jsonb, $12::jsonb,
          $13, $14, $15::text[], $16, $17
        )
        RETURNING *
      `,
      [
        input.source_type,
        input.source_digest,
        input.name,
        input.target_role,
        input.education_level,
        input.major,
        input.graduation_year,
        input.skills,
        input.certificates,
        JSON.stringify(input.experience),
        JSON.stringify(input.self_assessment),
        JSON.stringify(input.dimension_scores),
        input.completeness_score,
        input.competitiveness_score,
        input.missing_items,
        input.personal_summary,
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
