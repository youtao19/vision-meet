/**
 * 文件作用：验证自动构图规则（晋升/换岗）与边解释字段的稳定性。
 * 职责边界：只覆盖纯函数 buildAutoCareerGraph，不依赖数据库与外部服务。
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { JobProfileV2Record } from "@career/contracts/types";

import { buildAutoCareerGraph } from "../jobs-intelligence.graph.js";

function buildProfile(input: {
  id: number;
  family: string;
  level: number;
  skills: string[];
  title?: string;
}): JobProfileV2Record {
  return {
    id: input.id,
    job_id: input.id,
    profile_version: 1,
    normalized_title: input.title ?? `岗位-${input.id}`,
    job_family: input.family,
    job_level: input.level,
    professional_skills: input.skills,
    certificate_requirements: [],
    innovation_score: 60,
    learning_score: 60,
    stress_tolerance_score: 60,
    communication_score: 60,
    internship_score: 60,
    summary: "summary",
    confidence: 0.8,
    generation_model: "mock",
    generation_mode: "agent",
    extracted_features: {},
    created_at: new Date().toISOString(),
  };
}

test("buildAutoCareerGraph: 应输出带版本元信息的图谱快照", () => {
  const profiles = [
    buildProfile({ id: 1, family: "frontend", level: 1, skills: ["typescript", "vue", "css"] }),
    buildProfile({ id: 2, family: "frontend", level: 2, skills: ["typescript", "vue", "node"] }),
  ];

  const snapshot = buildAutoCareerGraph(
    profiles,
    new Map([
      [1, "前端工程师"],
      [2, "前端高级工程师"],
    ]),
  );
  assert.equal(typeof snapshot.graph_version, "string");
  assert.ok(snapshot.graph_version.length > 0);
  assert.equal(typeof snapshot.generated_at, "string");
  assert.equal(snapshot.nodes.length, 2);
});

test("buildAutoCareerGraph: 晋升边必须满足同岗位族且 level+1", () => {
  const profiles = [
    buildProfile({ id: 11, family: "frontend", level: 1, skills: ["typescript", "vue", "css"] }),
    buildProfile({ id: 12, family: "frontend", level: 2, skills: ["typescript", "vue", "node"] }),
    buildProfile({ id: 13, family: "backend", level: 2, skills: ["java", "sql", "spring"] }),
    buildProfile({
      id: 14,
      family: "frontend",
      level: 3,
      skills: ["typescript", "node", "system-design"],
    }),
  ];

  const snapshot = buildAutoCareerGraph(profiles, new Map());
  const promotionEdges = snapshot.edges.filter((edge) => edge.relation_type === "promotion");

  assert.ok(promotionEdges.some((edge) => edge.source === "job-11" && edge.target === "job-12"));
  assert.equal(
    promotionEdges.some((edge) => edge.source === "job-11" && edge.target === "job-13"),
    false,
  );
  assert.equal(
    promotionEdges.some((edge) => edge.source === "job-11" && edge.target === "job-14"),
    false,
  );
});

test("buildAutoCareerGraph: 换岗边必须跨岗位族且满足可迁移技能阈值", () => {
  const profiles = [
    buildProfile({
      id: 21,
      family: "frontend",
      level: 2,
      skills: ["typescript", "react", "css", "node"],
    }),
    buildProfile({ id: 22, family: "data", level: 2, skills: ["python", "sql", "pandas"] }),
    buildProfile({ id: 23, family: "product", level: 2, skills: ["typescript", "react", "axure"] }),
    buildProfile({ id: 24, family: "frontend", level: 2, skills: ["typescript", "react", "css"] }),
  ];

  const snapshot = buildAutoCareerGraph(profiles, new Map());
  const transitionEdges = snapshot.edges.filter((edge) => edge.relation_type === "transition");

  assert.ok(transitionEdges.some((edge) => edge.source === "job-21" && edge.target === "job-23"));
  assert.equal(
    transitionEdges.some((edge) => edge.source === "job-21" && edge.target === "job-22"),
    false,
  );
  assert.equal(
    transitionEdges.some((edge) => edge.source === "job-21" && edge.target === "job-24"),
    false,
  );
});

test("buildAutoCareerGraph: 每条边都应具备可解释字段", () => {
  const profiles = [
    buildProfile({ id: 31, family: "backend", level: 1, skills: ["java", "sql", "redis"] }),
    buildProfile({
      id: 32,
      family: "backend",
      level: 2,
      skills: ["java", "sql", "redis", "kafka"],
    }),
  ];

  const snapshot = buildAutoCareerGraph(profiles, new Map());
  assert.ok(snapshot.edges.length > 0);

  for (const edge of snapshot.edges) {
    assert.ok(edge.reason.trim().length > 0);
    assert.ok(edge.required_skills.length > 0);
    assert.ok(edge.direction_label === "晋升" || edge.direction_label === "换岗");
    assert.ok(edge.score >= 0 && edge.score <= 100);
  }
});
