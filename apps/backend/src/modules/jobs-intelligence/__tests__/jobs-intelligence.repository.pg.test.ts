/**
 * 文件作用：验证人工岗位画像仓储行为（v2_manual_job_portraits）。
 * 职责边界：该测试通过 mock pool 校验 SQL 调用，不依赖真实数据库。
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createPgJobsIntelligenceRepository } from "../jobs-intelligence.repository.pg.js";

test("replaceManualJobPortraits + listManualJobPortraits: 应完整写入并读出", async () => {
  const stored: Array<Record<string, unknown>> = [];
  let inTransaction = false;
  let schemaTables: string[] = [];

  const pool = {
    async query(sql: string, _params?: unknown[]) {
      if (sql.includes("CREATE TABLE IF NOT EXISTS")) {
        const match = sql.match(/v2_\w+/);
        if (match && !schemaTables.includes(match[0])) {
          schemaTables.push(match[0]);
        }
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("CREATE INDEX IF NOT EXISTS")) {
        return { rowCount: 0, rows: [] };
      }

      if (sql.trim() === "BEGIN") {
        inTransaction = true;
        return { rowCount: 0, rows: [] };
      }
      if (sql.trim() === "COMMIT") {
        inTransaction = false;
        return { rowCount: 0, rows: [] };
      }
      if (sql.trim() === "ROLLBACK") {
        inTransaction = false;
        return { rowCount: 0, rows: [] };
      }

      if (sql.includes("DELETE FROM v2_manual_job_portraits")) {
        stored.length = 0;
        return { rowCount: 0, rows: [] };
      }

      if (sql.includes("INSERT INTO v2_manual_job_portraits")) {
        const jobName = String((_params || [])[0]);
        const category = String((_params || [])[1]);
        stored.push({ job_name: jobName, category, payload: _params?.[2] ?? "{}" });
        return { rowCount: 1, rows: [] };
      }

      if (sql.includes("FROM v2_manual_job_portraits p")) {
        return {
          rowCount: stored.length,
          rows: stored.map((row) => ({
            ...row,
            fallback_job_id: null,
            job_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
        };
      }

      if (sql.includes("SELECT COUNT")) {
        return { rowCount: 1, rows: [{ total: 0 }] };
      }

      return { rowCount: 0, rows: [] };
    },
    async connect() {
      return {
        query: async (sql: string, params?: unknown[]) => this.query(sql, params),
        release() {},
      };
    },
  };

  const repository = createPgJobsIntelligenceRepository(pool as never);

  await repository.replaceManualJobPortraits?.([
    {
      job_name: "前端开发工程师",
      category: "frontend",
      profile_detail: {
        name: "前端开发工程师",
        category: "frontend",
        description: "负责前端页面开发",
        educationRequirements: ["计算机相关专业"],
        skills: ["JavaScript", "TypeScript"],
        softSkills: ["沟通能力"],
        certificates: [],
        innovationAbility: "高",
        learningAbility: "高",
        stressResistance: "中",
        communicationAbility: "高",
        internshipAbility: "建议有项目经验",
        careerPath: ["中级前端", "高级前端"],
        subIndustries: [],
      },
    },
  ]);

  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.job_name, "前端开发工程师");

  const portraits = await repository.listManualJobPortraits?.();
  assert.ok(portraits);
  assert.equal(portraits.length, 1);
  assert.equal(portraits[0]?.job_name, "前端开发工程师");
});
