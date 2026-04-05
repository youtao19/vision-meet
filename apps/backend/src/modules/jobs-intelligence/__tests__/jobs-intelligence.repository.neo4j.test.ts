/**
 * 文件作用：验证图谱 Neo4j 仓储在重复同步时的幂等写入行为与子图读取结构。
 * 职责边界：通过 driver mock 验证查询调用，不依赖真实 Neo4j 实例。
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { CareerGraphSnapshot } from "@career/contracts/types";

import { createNeo4jJobsIntelligenceGraphRepositoryWithDriver } from "../jobs-intelligence.repository.neo4j.js";

type QueryCall = {
  query: string;
  params: Record<string, unknown>;
};

function createDriverMock() {
  const calls: QueryCall[] = [];

  const driver = {
    async executeQuery(query: string, params: Record<string, unknown> = {}) {
      calls.push({ query, params });

      if (query.includes("RETURN DISTINCT node")) {
        return {
          records: [
            {
              get(key: string) {
                if (key !== "node") return null;
                return {
                  properties: {
                    id: "job-1",
                    job_id: 1,
                    title: "前端工程师",
                    family: "frontend",
                    level: 2,
                    skills: ["typescript"],
                    summary: "summary",
                  },
                };
              },
            },
          ],
        };
      }

      if (query.includes("RETURN rel, source.id AS source, target.id AS target")) {
        return {
          records: [
            {
              get(key: string) {
                if (key === "source") return "job-1";
                if (key === "target") return "job-2";
                if (key === "rel") {
                  return {
                    properties: {
                      id: "promotion-1-2",
                      relation_type: "promotion",
                      reason: "同岗位族职级递进",
                      required_skills: ["typescript", "node"],
                      gap_skills: ["node"],
                      transition_cost: "medium",
                      direction_label: "晋升",
                      score: 78,
                    },
                  };
                }
                return null;
              },
            },
          ],
        };
      }

      return { records: [] };
    },
    async close() {},
  };

  return {
    driver,
    calls,
  };
}

test("syncGraph: 重复执行应可稳定返回写入数量", async () => {
  const { driver, calls } = createDriverMock();
  const repository = createNeo4jJobsIntelligenceGraphRepositoryWithDriver(driver as never);

  const snapshot: CareerGraphSnapshot = {
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
    ],
    edges: [],
  };

  const first = await repository.syncGraph(snapshot);
  const second = await repository.syncGraph(snapshot);

  assert.equal(first.nodes_upserted, 1);
  assert.equal(second.nodes_upserted, 1);
  assert.ok(calls.some((call) => call.query.includes("MERGE (n:CareerRoleV2")));
});

test("getSubgraphByJobId: 应返回带版本元信息的图谱快照", async () => {
  const { driver } = createDriverMock();
  const repository = createNeo4jJobsIntelligenceGraphRepositoryWithDriver(driver as never);

  const snapshot = await repository.getSubgraphByJobId(1, 2);
  assert.equal(snapshot.graph_version, "v2.1");
  assert.equal(typeof snapshot.generated_at, "string");
  assert.equal(snapshot.nodes.length, 1);
  assert.equal(snapshot.edges.length, 1);
});
