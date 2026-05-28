/**
 * 文件作用：验证岗位智能流水线在 canonical 产物约束下的任务状态判定。
 * 职责边界：该测试使用内存桩，不依赖数据库或外部 Agent。
 */

import test from "node:test";
import assert from "node:assert/strict";

import type {
  ManualJobPortraitRecord,
  JobProfileV2Record,
  JobRecord,
} from "@career/contracts/types";

import type { AppEnv } from "../../../shared/config/env.js";
import { HttpError } from "../../../shared/errors/http-error.js";
import { createJobsIntelligenceService } from "../jobs-intelligence.service.js";
import type { JobsIntelligenceGraphRepository } from "../jobs-intelligence.repository.neo4j.js";
import type { JobsIntelligenceRepository } from "../jobs-intelligence.repository.js";

function buildEnv(): AppEnv {
  return {
    APP_ENV: "test",
    PORT: 8000,
    REPORT_EXPORT_DIR: "./tmp",
    JOB_PICTURE_BOOK_OUTPUT_DIR: "./tmp/job-picture-books",
    BAOYU_IMAGINE_SCRIPT: undefined,
    TTS_ENGINE: "say",
    TTS_VOICE: "Tingting",
    VOLCENGINE_TTS_APP_ID: undefined,
    VOLCENGINE_TTS_ACCESS_TOKEN: undefined,
    VOLCENGINE_TTS_CLUSTER: "volcano_tts",
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
    KIMI_BASE_URL: undefined,
    KIMI_API_KEY: undefined,
    KIMICODE_API_KEY: undefined,
    AGENT_PI_DIR: ".tmp/pi-agent",
    AGENT_SESSION_STORE_DIR: ".tmp/pi-agent/sessions",
    AGENT_THINKING_LEVEL: "off",
    AGENT_REPORT_THINKING_LEVEL: "minimal",
    AGENT_RESUME_TIMEOUT_MS: 60000,
    AGENT_REPORT_TIMEOUT_MS: 60000,
    JOBS_PIPELINE_CONCURRENCY: 3,
    JOBS_PIPELINE_RETRY_MAX_ATTEMPTS: 3,
    JOBS_PIPELINE_RETRY_BASE_MS: 100,
    JOBS_PIPELINE_RETRY_MAX_MS: 500,
  };
}

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
      return {
        graph_version: "v2.1",
        generated_at: new Date().toISOString(),
        nodes: [],
        edges: [],
      };
    },
    async close() {},
  };

  const service = createJobsIntelligenceService(repository, graphRepository, buildEnv());
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
      return {
        graph_version: "v2.1",
        generated_at: new Date().toISOString(),
        nodes: [],
        edges: [],
      };
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
      return {
        graph_version: "v2.1",
        generated_at: new Date().toISOString(),
        nodes: [],
        edges: [],
      };
    },
    async close() {},
  };

  await assert.rejects(
    async () =>
      createJobsIntelligenceService(repository, graphRepository, buildEnv()).getJobFact(100),
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
      return {
        graph_version: "v2.1",
        generated_at: new Date().toISOString(),
        nodes: [],
        edges: [],
      };
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

test("getCareerPathGraph: 应支持边过滤并返回图谱元信息", async () => {
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
    async listLatestProfilesForGraph() {
      return [];
    },
    async listJobsByIds() {
      return [
        {
          id: 1,
          source_row_id: null,
          normalized_source_key: null,
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
            relation_type: "promotion" as const,
            reason: "同族晋升",
            required_skills: ["typescript", "node"],
            gap_skills: ["node"],
            transition_cost: "medium" as const,
            direction_label: "晋升",
            score: 80,
          },
          {
            id: "transition-1-3",
            source: "job-1",
            target: "job-3",
            relation_type: "transition" as const,
            reason: "跨岗迁移",
            required_skills: ["typescript", "沟通"],
            gap_skills: ["沟通"],
            transition_cost: "medium" as const,
            direction_label: "换岗",
            score: 65,
          },
        ],
      };
    },
    async close() {},
  };

  const result = await createJobsIntelligenceService(
    repository,
    graphRepository,
    buildEnv(),
  ).getCareerPathGraph(1, {
    depth: 2,
    relation_type: "promotion",
    min_score: 70,
  });

  assert.equal(result.graph_version, "v2.1");
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0]?.relation_type, "promotion");
  assert.equal(result.graph_stats.edge_count, 1);
});

test("generateCareerPathGraph: 应从 v2_manual_job_portraits 生成并写入图谱", async () => {
  let syncedSnapshotNodes = 0;
  let syncedSnapshotEdges = 0;
  let syncedEdgeIds: string[] = [];
  let syncedNodeTitles: string[] = [];

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
    async listManualJobPortraitsFromTable() {
      const now = new Date().toISOString();
      return [
        buildManualPortrait(
          "前端开发工程师",
          "frontend_engineering",
          ["typescript", "vue", "playwright"],
          {
            created_at: now,
            updated_at: now,
          },
        ),
        buildManualPortrait(
          "前端高级工程师",
          "frontend_engineering",
          ["typescript", "node", "架构"],
          { created_at: now, updated_at: now },
        ),
        buildManualPortrait(
          "后端开发工程师",
          "backend_engineering",
          ["node", "typescript", "api"],
          {
            created_at: now,
            updated_at: now,
          },
        ),
        buildManualPortrait(
          "测试开发工程师",
          "quality_engineering",
          ["typescript", "自动化", "测试", "playwright"],
          { created_at: now, updated_at: now },
        ),
        buildManualPortrait("产品经理", "product_management", ["需求分析", "沟通", "协作"], {
          created_at: now,
          updated_at: now,
        }),
      ];
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
      syncedSnapshotNodes = snapshot.nodes.length;
      syncedSnapshotEdges = snapshot.edges.length;
      syncedNodeTitles = snapshot.nodes.map((node) => node.title);
      syncedEdgeIds = snapshot.edges.map((edge) => edge.id);
      return { nodes_upserted: snapshot.nodes.length, edges_upserted: snapshot.edges.length };
    },
    async getSubgraphByJobId() {
      return {
        graph_version: "v2.1",
        generated_at: new Date().toISOString(),
        nodes: [],
        edges: [],
      };
    },
    async close() {},
  };

  const service = createJobsIntelligenceService(repository, graphRepository, buildEnv());
  const result = await service.generateCareerPathGraph({ max_candidates_per_node: 20 });

  assert.equal(result.nodes_written, syncedSnapshotNodes);
  assert.equal(result.edges_written, syncedSnapshotEdges);
  assert.ok(result.nodes_written >= 5);
  assert.ok(result.edges_written > 0);
  assert.ok(result.transition_edges + result.skill_migration_edges > 0);
  assert.ok(syncedNodeTitles.includes("高级前端开发工程师"));
  assert.ok(syncedEdgeIds.some((id) => id.startsWith("promotion-")));
  assert.ok(syncedEdgeIds.some((id) => id.startsWith("transition-")));
});

test("generateCareerPathGraph: 岗位 ID 映射应优先使用岗位画像表中的 job_id", async () => {
  let syncedNodeIds: string[] = [];

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
    async listManualJobPortraitsFromTable() {
      const now = new Date().toISOString();
      return [
        buildManualPortrait("前端开发工程师", "frontend_engineering", ["typescript", "vue"], {
          job_id: 8888,
          created_at: now,
          updated_at: now,
        }),
        buildManualPortrait(
          "前端高级工程师",
          "frontend_engineering",
          ["typescript", "node", "架构"],
          { job_id: 9999, created_at: now, updated_at: now },
        ),
      ];
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
      syncedNodeIds = snapshot.nodes.map((node) => node.id);
      return { nodes_upserted: snapshot.nodes.length, edges_upserted: snapshot.edges.length };
    },
    async getSubgraphByJobId() {
      return {
        graph_version: "v2.1",
        generated_at: new Date().toISOString(),
        nodes: [],
        edges: [],
      };
    },
    async close() {},
  };

  await createJobsIntelligenceService(
    repository,
    graphRepository,
    buildEnv(),
  ).generateCareerPathGraph({
    max_candidates_per_node: 20,
  });

  assert.ok(syncedNodeIds.includes("job-8888"));
  assert.equal(syncedNodeIds.includes("job-11"), false);
});
