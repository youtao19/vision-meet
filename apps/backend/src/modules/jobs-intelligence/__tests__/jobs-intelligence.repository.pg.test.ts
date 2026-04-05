/**
 * 文件作用：验证岗位事实入库仓储行为（job_facts + job_fact_evidence）。
 * 职责边界：该测试通过 mock pool 校验 SQL 调用，不依赖真实数据库。
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createPgJobsIntelligenceRepository } from "../jobs-intelligence.repository.pg.js";

type QueryCall = {
  sql: string;
  params?: unknown[];
};

function createPoolStub() {
  const calls: QueryCall[] = [];
  let factId = 1001;

  return {
    calls,
    pool: {
      async query(sql: string, params?: unknown[]) {
        calls.push({ sql, params });

        if (sql.includes("INSERT INTO v2_job_facts")) {
          return { rowCount: 1, rows: [{ id: factId++ }] };
        }

        return { rowCount: 1, rows: [{ total: 0 }] };
      },
    },
  };
}

test("createJobFacts: 应写入事实主表与证据表", async () => {
  const { pool, calls } = createPoolStub();
  const repository = createPgJobsIntelligenceRepository(pool as never);

  await repository.createJobFacts({
    job_id: 1,
    normalized_title: "Java后端开发工程师",
    job_family: "backend_engineering",
    job_level: 2,
    responsibilities: ["负责服务开发"],
    required_skills: ["java", "sql"],
    preferred_skills: [],
    tools: ["docker"],
    certificates: [],
    education_requirement: "本科及以上",
    experience_requirement: "3年以上",
    soft_skills: ["沟通"],
    industry_context: ["互联网"],
    confidence: 0.78,
    evidence: [
      {
        field: "required_skills",
        text: "要求熟悉 Java、SQL",
        source: "job_description",
      },
      {
        field: "tools",
        text: "熟悉 Docker",
        source: "job_description",
      },
    ],
  });

  const factInsert = calls.find((call) => call.sql.includes("INSERT INTO v2_job_facts"));
  assert.ok(factInsert, "应写入 v2_job_facts");

  const evidenceInsert = calls.filter((call) =>
    call.sql.includes("INSERT INTO v2_job_fact_evidence"),
  );
  assert.ok(evidenceInsert.length >= 1, "应写入 v2_job_fact_evidence");
});

test("upsertCanonicalRoleProfile: 同内容重跑应保持幂等不重复升版", async () => {
  const calls: QueryCall[] = [];
  const state: { version: number; hash: string } = { version: 0, hash: "" };

  const pool = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });

      if (
        sql.includes("SELECT canonical_version, content_hash") &&
        sql.includes("v2_canonical_roles")
      ) {
        if (state.version === 0) {
          return { rowCount: 0, rows: [] };
        }
        return {
          rowCount: 1,
          rows: [{ canonical_version: state.version, content_hash: state.hash }],
        };
      }

      if (sql.includes("INSERT INTO v2_canonical_roles")) {
        const canonicalVersion = Number((params || [])[1]);
        const contentHash = String((params || [])[2] || "");
        state.version = canonicalVersion;
        state.hash = contentHash;
        return { rowCount: 1, rows: [] };
      }

      if (sql.includes("UPDATE v2_canonical_roles") && sql.includes("updated_at = NOW()")) {
        return { rowCount: 1, rows: [] };
      }

      return { rowCount: 1, rows: [{ total: 0 }] };
    },
  };

  const repository = createPgJobsIntelligenceRepository(pool as never);
  const draft = {
    role_key: "backend_engineering|后端开发工程师|L2",
    canonical_version: 1,
    content_hash: "",
    normalized_title: "后端开发工程师",
    job_family: "backend_engineering",
    level_band: "L2",
    sample_size: 8,
    core_required_skills: ["java", "sql"],
    common_required_skills: ["spring"],
    bonus_required_skills: [],
    core_tools: ["docker"],
    soft_skills: ["沟通"],
    representative_responsibilities: ["服务开发"],
    summary_version: "v1" as const,
    summary: {
      role_overview: "后端开发工程师负责后端服务开发。",
      core_responsibilities: ["服务开发"],
      core_requirements: ["java", "sql"],
      bonus_items: ["spring"],
      entry_path: ["完成后端项目"],
      development_directions: ["后端骨干"],
    },
    confidence: 0.8,
  };

  await repository.upsertCanonicalRoleProfile(draft);
  await repository.upsertCanonicalRoleProfile(draft);

  const canonicalInsertCount = calls.filter((call) =>
    call.sql.includes("INSERT INTO v2_canonical_roles"),
  ).length;
  const canonicalTouchCount = calls.filter(
    (call) =>
      call.sql.includes("UPDATE v2_canonical_roles") && call.sql.includes("updated_at = NOW()"),
  ).length;

  assert.equal(canonicalInsertCount, 1);
  assert.equal(canonicalTouchCount, 1);
});
