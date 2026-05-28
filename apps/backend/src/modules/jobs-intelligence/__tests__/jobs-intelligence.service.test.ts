/**
 * 文件作用：验证岗位智能核心服务在 canonical 产物约束下的正确性。
 * 职责边界：该测试使用内存桩，不依赖数据库或外部 Agent。
 */

import test from "node:test";
import assert from "node:assert/strict";

import type {
  ManualJobPortraitRecord,
  JobProfileV2Record,
  JobRecord,
} from "@career/contracts/types";

import { HttpError } from "../../../shared/errors/http-error.js";
import { createJobsIntelligenceService } from "../jobs-intelligence.service.js";
import type { JobsIntelligenceRepository } from "../jobs-intelligence.repository.js";

function buildManualPortrait(
  jobName: string,
  category: string,
  skills: string[],
  input: Partial<ManualJobPortraitRecord> = {},
): ManualJobPortraitRecord {
  const now = new Date().toISOString();
  return {
    job_id: input.job_id ?? null,
    job_name: jobName,
    category,
    profile_detail: {
      name: jobName,
      category,
      description: `${jobName}岗位画像`,
      educationRequirements: ["计算机相关专业"],
      skills,
      softSkills: ["沟通能力", "协作能力"],
      certificates: ["软考中级"],
      innovationAbility: "中高",
      learningAbility: "高",
      stressResistance: "中",
      communicationAbility: "高",
      internshipAbility: "建议有项目经验",
      careerPath: [jobName, `高级${jobName}`],
      subIndustries: [
        {
          industry: `${jobName}方向`,
          description: `${jobName}子行业`,
          representCompanies: ["示例公司"],
          skills,
          softSkills: ["沟通能力"],
          certificates: [],
          innovationAbility: "中高",
          learningAbility: "高",
          stressResistance: "中",
          communicationAbility: "高",
          internshipAbility: "建议有项目经验",
          salaryLevel: "高",
          overtimeLevel: "中",
          industryFeatures: ["迭代快"],
          recommendedProjects: ["业务系统"],
        },
      ],
    },
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
  };
}

test("listCanonicalRoles: 应返回标准岗位分页结果", async () => {
  const expected = {
    total: 1,
    items: [
      {
        role_key: "frontend_engineering|前端开发工程师|L2",
        canonical_version: 1,
        content_hash: "test-hash-1",
        normalized_title: "前端开发工程师",
        job_family: "frontend_engineering",
        level_band: "L2",
        sample_size: 26,
        core_required_skills: ["javascript", "typescript"],
        common_required_skills: ["vue"],
        bonus_required_skills: [],
        core_tools: ["git"],
        soft_skills: ["沟通"],
        representative_responsibilities: ["负责前端页面开发"],
        summary_version: "v1" as const,
        summary: {
          role_overview: "前端开发工程师负责页面与交互实现。",
          core_responsibilities: ["负责前端页面开发"],
          core_requirements: ["javascript", "typescript"],
          bonus_items: ["vue"],
          entry_path: ["完成基础项目"],
          development_directions: ["前端骨干"],
        },
        confidence: 0.82,
        updated_at: new Date().toISOString(),
      },
    ],
  };

  const repository: JobsIntelligenceRepository = {
    async createJobFacts() {},
    async listLatestJobFactsForCanonical() {
      return [];
    },
    async upsertCanonicalRoleProfile() {},
    async listCanonicalRoles() {
      return expected;
    },
    async getCanonicalRoleByKey() {
      return null;
    },
    async listJobFacts() {
      return { total: 0, items: [] };
    },
    async getLatestJobFactByJobId() {
      return null;
    },
    async getLatestProfileByJobId() {
      return null;
    },
    async createJobProfile() {
      throw new Error("not used");
    },
    async listLatestProfiles() {
      return { total: 0, items: [] };
    },
  };

  const service = createJobsIntelligenceService(repository);
  const result = await service.listCanonicalRoles({ offset: 0, limit: 20 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.role_key, "frontend_engineering|前端开发工程师|L2");
});

test("listJobFacts: 应返回抽取层分页结果", async () => {
  const expected = {
    total: 1,
    items: [
      {
        job_id: 100,
        normalized_title: "数据分析师",
        job_family: "data_analyst",
        job_level: 2,
        responsibilities: ["负责数据分析"],
        required_skills: ["sql"],
        preferred_skills: [],
        tools: ["excel"],
        certificates: [],
        education_requirement: "本科",
        experience_requirement: "2年",
        soft_skills: ["沟通"],
        industry_context: ["互联网"],
        evidence: [{ field: "required_skills" as const, text: "熟悉 SQL", source: "job_description" as const }],
        confidence: 0.8,
      },
    ],
  };

  const repository: JobsIntelligenceRepository = {
    async createJobFacts() {},
    async listLatestJobFactsForCanonical() {
      return [];
    },
    async upsertCanonicalRoleProfile() {},
    async listCanonicalRoles() {
      return { total: 0, items: [] };
    },
    async getCanonicalRoleByKey() {
      return null;
    },
    async listJobFacts() {
      return expected;
    },
    async getLatestJobFactByJobId() {
      return null;
    },
    async getLatestProfileByJobId() {
      return null;
    },
    async createJobProfile() {
      throw new Error("not used");
    },
    async listLatestProfiles() {
      return { total: 0, items: [] };
    },
  };

  const service = createJobsIntelligenceService(repository);
  const result = await service.listJobFacts({ offset: 0, limit: 20 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.job_id, 100);
});

test("getJobFact: 目标岗位事实不存在时应返回404", async () => {
  const repository: JobsIntelligenceRepository = {
    async createJobFacts() {},
    async listLatestJobFactsForCanonical() {
      return [];
    },
    async listJobFacts() {
      return { total: 0, items: [] };
    },
    async getLatestJobFactByJobId() {
      return null;
    },
    async upsertCanonicalRoleProfile() {},
    async listCanonicalRoles() {
      return { total: 0, items: [] };
    },
    async getCanonicalRoleByKey() {
      return null;
    },
    async getLatestProfileByJobId() {
      return null;
    },
    async createJobProfile() {
      throw new Error("not used");
    },
    async listLatestProfiles() {
      return { total: 0, items: [] };
    },
  };

  await assert.rejects(
    async () => createJobsIntelligenceService(repository).getJobFact(100),
    (error: unknown) => error instanceof HttpError && error.status === 404,
  );
});

test("getCanonicalRole: 应返回标准岗位详情", async () => {
  const expectedRoleKey = "frontend_engineering|前端开发工程师|L2";
  const repository: JobsIntelligenceRepository = {
    async createJobFacts() {},
    async listLatestJobFactsForCanonical() {
      return [];
    },
    async listJobFacts() {
      return { total: 0, items: [] };
    },
    async getLatestJobFactByJobId() {
      return null;
    },
    async upsertCanonicalRoleProfile() {},
    async listCanonicalRoles() {
      return { total: 0, items: [] };
    },
    async getCanonicalRoleByKey(roleKey: string) {
      if (roleKey !== expectedRoleKey) {
        return null;
      }
      return {
        role_key: expectedRoleKey,
        canonical_version: 1,
        content_hash: "test-hash-2",
        normalized_title: "前端开发工程师",
        job_family: "frontend_engineering",
        level_band: "L2",
        sample_size: 12,
        core_required_skills: ["javascript"],
        common_required_skills: ["vue"],
        bonus_required_skills: [],
        core_tools: ["git"],
        soft_skills: ["沟通"],
        representative_responsibilities: ["负责页面开发"],
        summary_version: "v1" as const,
        summary: {
          role_overview: "前端开发工程师负责页面与交互实现。",
          core_responsibilities: ["负责页面开发"],
          core_requirements: ["javascript"],
          bonus_items: ["vue"],
          entry_path: ["完成基础项目"],
          development_directions: ["前端骨干"],
        },
        confidence: 0.82,
        updated_at: new Date().toISOString(),
      };
    },
    async getLatestProfileByJobId() {
      return null;
    },
    async createJobProfile() {
      throw new Error("not used");
    },
    async listLatestProfiles() {
      return { total: 0, items: [] };
    },
  };

  const result = await createJobsIntelligenceService(repository).getCanonicalRole(expectedRoleKey);
  assert.equal(result.role_key, expectedRoleKey);
});
