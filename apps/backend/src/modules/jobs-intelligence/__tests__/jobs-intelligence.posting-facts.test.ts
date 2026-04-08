/**
 * 文件作用：验证岗位帖事实抽取（posting facts）在证据绑定约束下的核心行为。
 * 职责边界：该测试只覆盖纯函数抽取逻辑，不涉及数据库与外部 Agent。
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { JobRecord } from "@career/contracts/types";

import {
  buildCanonicalRoleProfile,
  groupPostingFactsByRole,
  extractPostingProfileFacts,
  type PostingProfileFacts,
} from "../jobs-intelligence.profile.js";

function buildJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: 1,
    source_row_id: null,
    normalized_source_key: null,
    title: "Java后端开发工程师",
    location: "上海",
    salary_range: "15-25k",
    company_name: "测试公司",
    industry: "互联网",
    company_size: "100-499",
    company_type: "民营",
    job_code: null,
    job_description:
      "负责后端服务开发与接口设计，要求熟悉 Java、SQL 与 Linux，熟悉 Docker 和 Kubernetes，具备良好沟通协作能力，本科及以上，3年经验优先。",
    company_intro: "技术驱动业务增长",
    raw_payload: {},
    created_at: new Date("2026-04-04T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function hasEvidenceForField(
  facts: PostingProfileFacts,
  field: PostingProfileFacts["evidence"][number]["field"],
): boolean {
  return facts.evidence.some((item) => item.field === field && item.text.trim().length > 0);
}

test("extractPostingProfileFacts: 应提取技能/工具并绑定证据", () => {
  const job = buildJob();

  const facts = extractPostingProfileFacts(job, {
    normalized_title_hint: "Java后端开发工程师",
    normalized_job_family_hint: "backend_engineering",
  });

  assert.equal(facts.normalized_title, "Java后端开发工程师");
  assert.equal(facts.job_family, "backend_engineering");
  assert.ok(facts.required_skills.includes("java"));
  assert.ok(facts.required_skills.includes("sql"));
  assert.ok(facts.tools.includes("docker"));
  assert.ok(hasEvidenceForField(facts, "required_skills"));
  assert.ok(hasEvidenceForField(facts, "tools"));
  assert.ok(facts.confidence >= 0.55);
});

test("extractPostingProfileFacts: 无证据时应降置信度并避免伪造字段", () => {
  const job = buildJob({
    title: "岗位待定",
    job_description: null,
    company_intro: null,
    industry: null,
  });

  const facts = extractPostingProfileFacts(job);

  assert.equal(facts.required_skills.length, 0);
  assert.equal(facts.tools.length, 0);
  assert.equal(facts.evidence.length, 0);
  assert.ok(facts.confidence <= 0.4);
});

test("buildCanonicalRoleProfile: 应按频率分层聚合技能", () => {
  const baseFacts: PostingProfileFacts[] = [
    {
      job_id: 1,
      normalized_title: "前端开发工程师",
      job_family: "frontend_engineering",
      job_level: 2,
      responsibilities: ["负责页面开发"],
      required_skills: ["javascript", "typescript", "vue"],
      preferred_skills: ["node"],
      tools: ["git"],
      certificates: [],
      education_requirement: "本科",
      experience_requirement: "2年",
      soft_skills: ["沟通"],
      industry_context: ["互联网"],
      evidence: [
        {
          field: "required_skills",
          text: "熟悉 JavaScript、TypeScript、Vue",
          source: "job_description",
        },
      ],
      confidence: 0.8,
    },
    {
      job_id: 2,
      normalized_title: "前端开发工程师",
      job_family: "frontend_engineering",
      job_level: 2,
      responsibilities: ["负责前端工程化"],
      required_skills: ["javascript", "typescript", "vue", "css"],
      preferred_skills: [],
      tools: ["git"],
      certificates: [],
      education_requirement: "本科",
      experience_requirement: "3年",
      soft_skills: ["协作"],
      industry_context: ["互联网"],
      evidence: [
        {
          field: "required_skills",
          text: "掌握 JavaScript、TypeScript、Vue、CSS",
          source: "job_description",
        },
      ],
      confidence: 0.82,
    },
    {
      job_id: 3,
      normalized_title: "前端开发工程师",
      job_family: "frontend_engineering",
      job_level: 2,
      responsibilities: ["负责组件开发"],
      required_skills: ["javascript", "typescript", "react"],
      preferred_skills: [],
      tools: ["git"],
      certificates: [],
      education_requirement: "本科",
      experience_requirement: "1年",
      soft_skills: ["学习"],
      industry_context: ["互联网"],
      evidence: [
        {
          field: "required_skills",
          text: "掌握 JavaScript、TypeScript、React",
          source: "job_description",
        },
      ],
      confidence: 0.76,
    },
  ];

  const canonical = buildCanonicalRoleProfile(baseFacts);
  assert.equal(canonical.role_key, "frontend_engineering|前端开发工程师|L2");
  assert.ok(canonical.core_required_skills.includes("javascript"));
  assert.ok(canonical.core_required_skills.includes("typescript"));
  assert.ok(canonical.common_required_skills.includes("vue"));
  assert.ok(canonical.common_required_skills.includes("react"));
  assert.ok(canonical.common_required_skills.includes("css"));
  assert.equal(canonical.sample_size, 3);
});

test("groupPostingFactsByRole: 应按岗位族+标准标题+职级分组", () => {
  const factsList: PostingProfileFacts[] = [
    {
      job_id: 11,
      normalized_title: "前端开发工程师",
      job_family: "frontend_engineering",
      job_level: 2,
      responsibilities: [],
      required_skills: ["javascript"],
      preferred_skills: [],
      tools: [],
      certificates: [],
      education_requirement: "",
      experience_requirement: "",
      soft_skills: [],
      industry_context: [],
      evidence: [{ field: "required_skills", text: "掌握 javascript", source: "job_description" }],
      confidence: 0.75,
    },
    {
      job_id: 12,
      normalized_title: "前端开发工程师",
      job_family: "frontend_engineering",
      job_level: 2,
      responsibilities: [],
      required_skills: ["typescript"],
      preferred_skills: [],
      tools: [],
      certificates: [],
      education_requirement: "",
      experience_requirement: "",
      soft_skills: [],
      industry_context: [],
      evidence: [{ field: "required_skills", text: "掌握 typescript", source: "job_description" }],
      confidence: 0.77,
    },
    {
      job_id: 13,
      normalized_title: "前端开发工程师",
      job_family: "frontend_engineering",
      job_level: 3,
      responsibilities: [],
      required_skills: ["系统设计"],
      preferred_skills: [],
      tools: [],
      certificates: [],
      education_requirement: "",
      experience_requirement: "",
      soft_skills: [],
      industry_context: [],
      evidence: [{ field: "required_skills", text: "熟悉系统设计", source: "job_description" }],
      confidence: 0.8,
    },
  ];

  const grouped = groupPostingFactsByRole(factsList);
  assert.equal(grouped.size, 2);
  assert.ok(grouped.has("frontend_engineering|前端开发工程师|L2"));
  assert.ok(grouped.has("frontend_engineering|前端开发工程师|L3"));
  assert.equal(grouped.get("frontend_engineering|前端开发工程师|L2")?.length, 2);
});

test("groupPostingFactsByRole: 无证据或低置信度事实不应进入聚合", () => {
  const factsList: PostingProfileFacts[] = [
    {
      job_id: 31,
      normalized_title: "数据分析师",
      job_family: "data_analyst",
      job_level: 2,
      responsibilities: [],
      required_skills: ["sql"],
      preferred_skills: [],
      tools: ["excel"],
      certificates: [],
      education_requirement: "",
      experience_requirement: "",
      soft_skills: ["沟通"],
      industry_context: [],
      evidence: [{ field: "required_skills", text: "熟悉 SQL", source: "job_description" }],
      confidence: 0.75,
    },
    {
      job_id: 32,
      normalized_title: "数据分析师",
      job_family: "data_analyst",
      job_level: 2,
      responsibilities: [],
      required_skills: ["python"],
      preferred_skills: [],
      tools: ["pandas"],
      certificates: [],
      education_requirement: "",
      experience_requirement: "",
      soft_skills: ["沟通"],
      industry_context: [],
      evidence: [],
      confidence: 0.82,
    },
    {
      job_id: 33,
      normalized_title: "数据分析师",
      job_family: "data_analyst",
      job_level: 2,
      responsibilities: [],
      required_skills: ["bi"],
      preferred_skills: [],
      tools: ["tableau"],
      certificates: [],
      education_requirement: "",
      experience_requirement: "",
      soft_skills: ["沟通"],
      industry_context: [],
      evidence: [{ field: "required_skills", text: "掌握 BI", source: "job_description" }],
      confidence: 0.35,
    },
  ];

  const grouped = groupPostingFactsByRole(factsList);
  const group = grouped.get("data_analyst|数据分析师|L2") || [];
  assert.equal(group.length, 1);
  assert.equal(group[0]?.job_id, 31);
});

test("buildCanonicalRoleProfile: 软技能应只保留可解释白名单项", () => {
  const factsList: PostingProfileFacts[] = [
    {
      job_id: 21,
      normalized_title: "测试工程师",
      job_family: "testing_engineering",
      job_level: 2,
      responsibilities: [],
      required_skills: ["测试"],
      preferred_skills: [],
      tools: [],
      certificates: [],
      education_requirement: "",
      experience_requirement: "",
      soft_skills: ["沟通", "积极乐观"],
      industry_context: [],
      evidence: [],
      confidence: 0.8,
    },
    {
      job_id: 22,
      normalized_title: "测试工程师",
      job_family: "testing_engineering",
      job_level: 2,
      responsibilities: [],
      required_skills: ["自动化"],
      preferred_skills: [],
      tools: [],
      certificates: [],
      education_requirement: "",
      experience_requirement: "",
      soft_skills: ["协作", "积极乐观"],
      industry_context: [],
      evidence: [],
      confidence: 0.79,
    },
  ];

  const canonical = buildCanonicalRoleProfile(factsList);
  assert.ok(canonical.soft_skills.includes("沟通") || canonical.soft_skills.includes("协作"));
  assert.equal(canonical.soft_skills.includes("积极乐观"), false);
});

test("buildCanonicalRoleProfile: 应产出稳定的结构化岗位总结", () => {
  const factsList: PostingProfileFacts[] = [
    {
      job_id: 41,
      normalized_title: "后端开发工程师",
      job_family: "backend_engineering",
      job_level: 2,
      responsibilities: ["负责服务开发", "接口设计"],
      required_skills: ["java", "sql", "spring"],
      preferred_skills: [],
      tools: ["docker"],
      certificates: [],
      education_requirement: "本科",
      experience_requirement: "2年",
      soft_skills: ["沟通"],
      industry_context: ["互联网"],
      evidence: [
        { field: "required_skills", text: "熟悉 Java、SQL、Spring", source: "job_description" },
      ],
      confidence: 0.82,
    },
    {
      job_id: 42,
      normalized_title: "后端开发工程师",
      job_family: "backend_engineering",
      job_level: 2,
      responsibilities: ["负责服务开发"],
      required_skills: ["java", "sql"],
      preferred_skills: [],
      tools: ["docker"],
      certificates: [],
      education_requirement: "本科",
      experience_requirement: "1年",
      soft_skills: ["协作"],
      industry_context: ["互联网"],
      evidence: [{ field: "required_skills", text: "掌握 Java 与 SQL", source: "job_description" }],
      confidence: 0.79,
    },
  ];

  const canonical = buildCanonicalRoleProfile(factsList);
  assert.equal(canonical.summary_version, "v1");
  assert.match(canonical.summary.role_overview, /后端开发工程师/);
  assert.ok(canonical.summary.core_requirements.length > 0);
  assert.ok(canonical.summary.entry_path.length > 0);
  assert.ok(canonical.summary.development_directions.length > 0);
});
