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
        graph_covered_jobs: 0,
        graph_isolated_ratio: 0,
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
      return { graph_version: "v2.1", generated_at: new Date().toISOString(), nodes: [], edges: [] };
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
      return { graph_version: "v2.1", generated_at: new Date().toISOString(), nodes: [], edges: [] };
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
      return { graph_version: "v2.1", generated_at: new Date().toISOString(), nodes: [], edges: [] };
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
      return { graph_version: "v2.1", generated_at: new Date().toISOString(), nodes: [], edges: [] };
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
      return { graph_version: "v2.1", generated_at: new Date().toISOString(), nodes: [], edges: [] };
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

test("runPipelineNow: 图谱覆盖岗位不足时应判定失败", async () => {
  let taskId = 1;
  const tasks = new Map<number, JobPipelineTaskRecord>();

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
        graph_covered_jobs: 0,
        graph_isolated_ratio: 0,
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
      const next = { ...current, ...input, updated_at: new Date().toISOString() };
      tasks.set(taskIdValue, next);
      return next;
    },
    async listPipelineJobs() {
      return [];
    },
    async createJobFacts() {},
    async listLatestJobFactsForCanonical() {
      const groups: PostingProfileFacts[] = [];
      for (let index = 0; index < 10; index += 1) {
        groups.push(
          buildFacts(index + 1, `family_${index + 1}`, `岗位-${index + 1}`),
        );
      }
      return groups;
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
      // 每个岗位技能互不重叠，确保构图阶段几乎无有效边。
      return Array.from({ length: 10 }).map((_, index) => ({
        ...buildProfile(index + 1, `family_${index + 1}`),
        professional_skills: [`skill_${index + 1}`],
      }));
    },
    async listJobsByIds(jobIds: number[]) {
      return jobIds.map((id) => ({
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
    },
  };

  const graphRepository: JobsIntelligenceGraphRepository = {
    async syncGraph(snapshot) {
      return { nodes_upserted: snapshot.nodes.length, edges_upserted: snapshot.edges.length };
    },
    async getSubgraphByJobId() {
      return { graph_version: "v2.1", generated_at: new Date().toISOString(), nodes: [], edges: [] };
    },
    async close() {},
  };

  const result = await createJobsIntelligenceService(repository, graphRepository, buildEnv()).runPipelineNow({
    mode: "incremental",
  });

  assert.equal(result.status, "failed");
  assert.match(result.error_message || "", /图谱覆盖岗位数量不足/);
});

test("getCareerPathGraph: 应支持边过滤并返回图谱元信息", async () => {
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
      return [
        {
          id: 1,
          source_row_id: null,
          title: "前端工程师",
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
        },
      ];
    },
  };

  const graphRepository: JobsIntelligenceGraphRepository = {
    async syncGraph() {
      return { nodes_upserted: 0, edges_upserted: 0 };
    },
    async getSubgraphByJobId() {
      return {
        graph_version: "v2.1",
        generated_at: new Date().toISOString(),
        nodes: [
          {
            id: "job-1",
            job_id: 1,
            title: "前端工程师",
            family: "frontend",
            level: 2,
            skills: ["typescript"],
            summary: "summary",
          },
          {
            id: "job-2",
            job_id: 2,
            title: "前端高级工程师",
            family: "frontend",
            level: 3,
            skills: ["typescript", "node"],
            summary: "summary",
          },
        ],
        edges: [
          {
            id: "promotion-1-2",
            source: "job-1",
            target: "job-2",
            relation_type: "promotion",
            reason: "同族晋升",
            required_skills: ["typescript", "node"],
            gap_skills: ["node"],
            transition_cost: "medium",
            direction_label: "晋升",
            score: 80,
          },
          {
            id: "transition-1-3",
            source: "job-1",
            target: "job-3",
            relation_type: "transition",
            reason: "跨岗迁移",
            required_skills: ["typescript", "沟通"],
            gap_skills: ["沟通"],
            transition_cost: "medium",
            direction_label: "换岗",
            score: 65,
          },
        ],
      };
    },
    async close() {},
  };

  const result = await createJobsIntelligenceService(repository, graphRepository, buildEnv()).getCareerPathGraph(1, {
    depth: 2,
    relation_type: "promotion",
    min_score: 70,
  });

  assert.equal(result.graph_version, "v2.1");
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0]?.relation_type, "promotion");
  assert.equal(result.graph_stats.edge_count, 1);
});

test("retryPipelineTask: 应按原任务模式创建并执行重跑任务", async () => {
  let taskSeq = 100;
  const tasks = new Map<number, JobPipelineTaskRecord>();

  const baseTask: JobPipelineTaskRecord = {
    id: 1,
    mode: "incremental",
    status: "failed",
    total_jobs: 10,
    processed_jobs: 10,
    success_profiles: 8,
    failed_profiles: 2,
    graph_nodes: 10,
    graph_edges: 6,
    graph_covered_jobs: 8,
    graph_isolated_ratio: 0.2,
    family_count: 10,
    message: "历史失败任务",
    error_message: "图谱覆盖岗位数量不足 5",
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  tasks.set(baseTask.id, baseTask);

  const repository: JobsIntelligenceRepository = {
    async createPipelineTask(mode) {
      const task: JobPipelineTaskRecord = {
        id: taskSeq++,
        mode,
        status: "queued",
        total_jobs: 0,
        processed_jobs: 0,
        success_profiles: 0,
        failed_profiles: 0,
        graph_nodes: 0,
        graph_edges: 0,
        graph_covered_jobs: 0,
        graph_isolated_ratio: 0,
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
    async getPipelineTask(taskId) {
      return tasks.get(taskId) ?? null;
    },
    async updatePipelineTask(taskId, input) {
      const current = tasks.get(taskId);
      if (!current) {
        throw new Error("task not found");
      }
      const next = { ...current, ...input, updated_at: new Date().toISOString() };
      tasks.set(taskId, next);
      return next;
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
    async syncGraph(snapshot) {
      return { nodes_upserted: snapshot.nodes.length, edges_upserted: snapshot.edges.length };
    },
    async getSubgraphByJobId() {
      return { graph_version: "v2.1", generated_at: new Date().toISOString(), nodes: [], edges: [] };
    },
    async close() {},
  };

  const service = createJobsIntelligenceService(repository, graphRepository, buildEnv());
  const retried = await service.retryPipelineTask(1);

  assert.equal(retried.id, 100);
  assert.equal(retried.mode, "incremental");
  assert.match(retried.message || "", /重跑来源任务：1/);
});
