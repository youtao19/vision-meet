/**
 * 文件作用：验证岗位智能流水线在 canonical 产物约束下的任务状态判定。
 * 职责边界：该测试使用内存桩，不依赖数据库或外部 Agent。
 */

import test from "node:test";
import assert from "node:assert/strict";

import type {
  JobFactsListResponse,
  JobPipelineTaskRecord,
  JobProfileV2Record,
  JobRecord,
} from "@career/contracts/types";

import type { AppEnv } from "../../../shared/config/env.js";
import { HttpError } from "../../../shared/errors/http-error.js";
import {
  createJobsIntelligenceService,
} from "../jobs-intelligence.service.js";
import type {
  JobsIntelligenceGraphRepository,
} from "../jobs-intelligence.repository.neo4j.js";
import type {
  JobsIntelligenceRepository,
} from "../jobs-intelligence.repository.js";
import type { PostingProfileFacts } from "../jobs-intelligence.profile.js";

function buildEnv(): AppEnv {
  return {
    APP_ENV: "test",
    PORT: 8000,
    REPORT_EXPORT_DIR: "./tmp",
    MATCH_SCORING_VERSION: "v2",
    PGHOST: "127.0.0.1",
    PGPORT: 5432,
    PGDATABASE: "career_agent",
    PGUSER: "career",
    PGPASSWORD: "career_dev_password",
    PGVECTOR_DIM: 32,
    NEO4J_URI: "neo4j://127.0.0.1:7687",
    NEO4J_USERNAME: "neo4j",
    NEO4J_PASSWORD: "career_dev_password",
    KNOWLEDGE_TOP_K: 5,
    KNOWLEDGE_REINDEX_BATCH_SIZE: 20,
    MOONSHOT_BASE_URL: undefined,
    MOONSHOT_API_KEY: undefined,
    MOONSHOT_MODEL: undefined,
    KIMI_BASE_URL: undefined,
    KIMI_API_KEY: undefined,
    KIMICODE_API_KEY: undefined,
    KIMI_MODEL: undefined,
    AGENT_PI_DIR: ".tmp/pi-agent",
    AGENT_SESSION_STORE_DIR: ".tmp/pi-agent/sessions",
    AGENT_MODEL: "kimi-coding/k2p5",
    AGENT_THINKING_LEVEL: "off",
  };
}

function buildProfile(jobId: number, family: string): JobProfileV2Record {
  return {
    id: jobId,
    job_id: jobId,
    profile_version: 1,
    normalized_title: `岗位-${jobId}`,
    job_family: family,
    job_level: 2,
    professional_skills: ["typescript"],
    certificate_requirements: [],
    innovation_score: 60,
    learning_score: 60,
    stress_tolerance_score: 60,
    communication_score: 60,
    internship_score: 60,
    summary: "summary",
    confidence: 0.8,
    generation_model: "mock",
    generation_mode: "heuristic",
    extracted_features: {},
    created_at: new Date().toISOString(),
  };
}

function buildFacts(jobId: number, family: string, title: string): PostingProfileFacts {
  return {
    job_id: jobId,
    normalized_title: title,
    job_family: family,
    job_level: 2,
    responsibilities: ["职责"],
    required_skills: ["typescript"],
    preferred_skills: [],
    tools: ["git"],
    certificates: [],
    education_requirement: "本科",
    experience_requirement: "2年",
    soft_skills: ["沟通"],
    industry_context: ["互联网"],
    evidence: [
      { field: "required_skills", text: "熟悉 typescript", source: "job_description" },
    ],
    confidence: 0.8,
  };
}

test("runPipelineNow: 标准岗位数不足10时应判定失败", async () => {
  let taskId = 1;
  const tasks = new Map<number, JobPipelineTaskRecord>();
  const upsertedCanonical: string[] = [];

  const repository: JobsIntelligenceRepository = {
    async createPipelineTask(mode) {
      const task: JobPipelineTaskRecord = {
        id: taskId++,
        mode,
        status: "queued",
        total_jobs: 0,
        processed_jobs: 0,
        success_profiles: 0,
        failed_profiles: 0,
        graph_nodes: 0,
        graph_edges: 0,
        family_count: 0,
        message: null,
        error_message: null,
        started_at: null,
        finished_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      tasks.set(task.id, task);
      return task;
    },
    async getPipelineTask(taskIdValue) {
      return tasks.get(taskIdValue) ?? null;
    },
    async updatePipelineTask(taskIdValue, input) {
      const current = tasks.get(taskIdValue);
      if (!current) {
        throw new Error("task not found");
      }
      const next = {
        ...current,
        ...input,
        updated_at: new Date().toISOString(),
      };
      tasks.set(taskIdValue, next);
      return next;
    },
    async listPipelineJobs() {
      return [];
    },
    async createJobFacts() {},
    async listLatestJobFactsForCanonical() {
      // 仅 2 个 canonical 分组，低于目标 10。
      return [
        buildFacts(1, "frontend_engineering", "前端开发工程师"),
        buildFacts(2, "backend_engineering", "后端开发工程师"),
      ];
    },
    async listJobFacts() {
      return { total: 0, items: [] };
    },
    async getLatestJobFactByJobId() {
      return null;
    },
    async upsertCanonicalRoleProfile(input) {
      upsertedCanonical.push(input.role_key);
    },
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
    async listLatestProfilesForGraph() {
      // 提供 >=10 岗位族，避免旧规则直接失败，专门验证 canonical 约束。
      return [
        buildProfile(1, "f1"),
        buildProfile(2, "f2"),
        buildProfile(3, "f3"),
        buildProfile(4, "f4"),
        buildProfile(5, "f5"),
        buildProfile(6, "f6"),
        buildProfile(7, "f7"),
        buildProfile(8, "f8"),
        buildProfile(9, "f9"),
        buildProfile(10, "f10"),
      ];
    },
    async listJobsByIds(jobIds: number[]) {
      const jobs: JobRecord[] = jobIds.map((id) => ({
        id,
        source_row_id: null,
        title: `岗位-${id}`,
        location: null,
        salary_range: null,
        company_name: null,
        industry: null,
        company_size: null,
        company_type: null,
        job_code: null,
        job_description: null,
        company_intro: null,
        raw_payload: {},
        created_at: new Date().toISOString(),
      }));
      return jobs;
    },
  };

  const graphRepository: JobsIntelligenceGraphRepository = {
    async syncGraph(snapshot) {
      return { nodes_upserted: snapshot.nodes.length, edges_upserted: snapshot.edges.length };
    },
    async getSubgraphByJobId() {
      return { nodes: [], edges: [] };
    },
    async close() {},
  };

  const service = createJobsIntelligenceService(repository, graphRepository, buildEnv());
  const result = await service.runPipelineNow({ mode: "incremental" });

  assert.equal(upsertedCanonical.length, 2);
  assert.equal(result.status, "failed");
  assert.match(result.error_message || "", /标准岗位数量不足 10/);
});

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
    async createPipelineTask() {
      throw new Error("not used");
    },
    async getPipelineTask() {
      return null;
    },
    async updatePipelineTask() {
      throw new Error("not used");
    },
    async listPipelineJobs() {
      return [];
    },
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
    async listLatestProfilesForGraph() {
      return [];
    },
    async listJobsByIds() {
      return [];
    },
  };

  const graphRepository: JobsIntelligenceGraphRepository = {
    async syncGraph() {
      return { nodes_upserted: 0, edges_upserted: 0 };
    },
    async getSubgraphByJobId() {
      return { nodes: [], edges: [] };
    },
    async close() {},
  };

  const service = createJobsIntelligenceService(repository, graphRepository, buildEnv());
  const result = await service.listCanonicalRoles({ offset: 0, limit: 20 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.role_key, "frontend_engineering|前端开发工程师|L2");
});

test("listJobFacts: 应返回抽取层分页结果", async () => {
  const expected: JobFactsListResponse = {
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
        evidence: [{ field: "required_skills", text: "熟悉 SQL", source: "job_description" }],
        confidence: 0.8,
      },
    ],
  };

  const repository: JobsIntelligenceRepository = {
    async createPipelineTask() {
      throw new Error("not used");
    },
    async getPipelineTask() {
      return null;
    },
    async updatePipelineTask() {
      throw new Error("not used");
    },
    async listPipelineJobs() {
      return [];
    },
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
    async listLatestProfilesForGraph() {
      return [];
    },
    async listJobsByIds() {
      return [];
    },
  };

  const graphRepository: JobsIntelligenceGraphRepository = {
    async syncGraph() {
      return { nodes_upserted: 0, edges_upserted: 0 };
    },
    async getSubgraphByJobId() {
      return { nodes: [], edges: [] };
    },
    async close() {},
  };

  const service = createJobsIntelligenceService(repository, graphRepository, buildEnv());
  const result = await service.listJobFacts({ offset: 0, limit: 20 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.job_id, 100);
});

test("getJobFact: 目标岗位事实不存在时应返回404", async () => {
  const repository: JobsIntelligenceRepository = {
    async createPipelineTask() {
      throw new Error("not used");
    },
    async getPipelineTask() {
      return null;
    },
    async updatePipelineTask() {
      throw new Error("not used");
    },
    async listPipelineJobs() {
      return [];
    },
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
    async listLatestProfilesForGraph() {
      return [];
    },
    async listJobsByIds() {
      return [];
    },
  };

  const graphRepository: JobsIntelligenceGraphRepository = {
    async syncGraph() {
      return { nodes_upserted: 0, edges_upserted: 0 };
    },
    async getSubgraphByJobId() {
      return { nodes: [], edges: [] };
    },
    async close() {},
  };

  await assert.rejects(
    async () => createJobsIntelligenceService(repository, graphRepository, buildEnv()).getJobFact(100),
    (error: unknown) => error instanceof HttpError && error.status === 404,
  );
});

test("getCanonicalRole: 应返回标准岗位详情", async () => {
  const expectedRoleKey = "frontend_engineering|前端开发工程师|L2";
  const repository: JobsIntelligenceRepository = {
    async createPipelineTask() {
      throw new Error("not used");
    },
    async getPipelineTask() {
      return null;
    },
    async updatePipelineTask() {
      throw new Error("not used");
    },
    async listPipelineJobs() {
      return [];
    },
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
    async listLatestProfilesForGraph() {
      return [];
    },
    async listJobsByIds() {
      return [];
    },
  };

  const graphRepository: JobsIntelligenceGraphRepository = {
    async syncGraph() {
      return { nodes_upserted: 0, edges_upserted: 0 };
    },
    async getSubgraphByJobId() {
      return { nodes: [], edges: [] };
    },
    async close() {},
  };

  const result = await createJobsIntelligenceService(
    repository,
    graphRepository,
    buildEnv(),
  ).getCanonicalRole(expectedRoleKey);
  assert.equal(result.role_key, expectedRoleKey);
});
