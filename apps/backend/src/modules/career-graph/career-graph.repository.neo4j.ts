/**
 * 文件作用：提供职业路径图谱的 Neo4j 持久化能力。
 * 关键约束：每次同步以覆盖写为主，保证图谱状态与最新画像快照一致。
 */

import neo4j from "neo4j-driver";
import type { Driver } from "neo4j-driver";
import type {
  CareerGraphEdgeRecord,
  CareerGraphNodeRecord,
  CareerGraphSnapshot,
} from "@career/contracts/types";

import {
  createNeo4jDriver,
  toNeo4jNumber,
  type Neo4jConnectionOptions,
} from "../../shared/db/neo4j.js";

const DEFAULT_GRAPH_VERSION = "v2.1";

export interface CareerGraphRepository {
  syncGraph(
    snapshot: CareerGraphSnapshot,
  ): Promise<{ nodes_upserted: number; edges_upserted: number }>;
  listGraphTargetNodes(): Promise<CareerGraphNodeRecord[]>;
  getSubgraphByJobId(jobId: number, depth: number): Promise<CareerGraphSnapshot>;
  close(): Promise<void>;
}

/** 将 Neo4j 节点记录映射为 CareerGraphNodeRecord（扁平化 properties） */
function mapNode(node: unknown): CareerGraphNodeRecord {
  const properties = (node as { properties: Record<string, unknown> }).properties;
  return {
    id: String(properties.id),
    job_id: toNeo4jNumber(properties.job_id),
    title: String(properties.title),
    family: String(properties.family),
    level: Number(properties.level),
    skills: Array.isArray(properties.skills) ? properties.skills.map(String) : [],
    summary: String(properties.summary),
  };
}

/**
 * 将 Neo4j 关系记录映射为 CareerGraphEdgeRecord。
 * 从 record 中提取 rel 对象（含 properties）、source 和 target 节点 ID。
 */
function mapEdge(record: { get(key: string): unknown }): CareerGraphEdgeRecord {
  const relation = record.get("rel") as { properties: Record<string, unknown> };
  const props = relation.properties;
  return {
    id: String(props.id),
    source: String(record.get("source")),
    target: String(record.get("target")),
    relation_type: props.relation_type as CareerGraphEdgeRecord["relation_type"],
    reason: String(props.reason),
    required_skills: Array.isArray(props.required_skills) ? props.required_skills.map(String) : [],
    gap_skills: Array.isArray(props.gap_skills) ? props.gap_skills.map(String) : [],
    transition_cost: props.transition_cost as CareerGraphEdgeRecord["transition_cost"],
    direction_label: String(props.direction_label),
    score: Number(props.score),
  };
}

export function createNeo4jCareerGraphRepository(
  options: Neo4jConnectionOptions,
): CareerGraphRepository {
  return createNeo4jCareerGraphRepositoryWithDriver(createNeo4jDriver(options));
}

export function createNeo4jCareerGraphRepositoryWithDriver(
  driver: Driver,
): CareerGraphRepository {
  // 惰性初始化：首次调用时创建节点唯一性约束
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await driver.executeQuery(
          `
            CREATE CONSTRAINT career_role_v2_id_unique IF NOT EXISTS
            FOR (role:CareerRoleV2)
            REQUIRE role.id IS UNIQUE
          `,
          {},
          { routing: neo4j.routing.WRITE },
        );
      })();
    }
    return schemaReady;
  }

  /**
   * 全量同步图谱快照到 Neo4j。
   * 先清除旧数据（DETACH DELETE 所有 CareeerRoleV2 节点），再批量写入新节点和新关系。
   * 使用 UNWIND + MERGE 保证幂等写入。
   */
  async function syncGraph(
    snapshot: CareerGraphSnapshot,
  ): Promise<{ nodes_upserted: number; edges_upserted: number }> {
    await ensureSchema();

    // 清除旧数据：删除所有 CareerRoleV2 节点及其关联关系
    await driver.executeQuery(
      `
        MATCH (node:CareerRoleV2)
        DETACH DELETE node
      `,
      {},
      { routing: neo4j.routing.WRITE },
    );

    if (snapshot.nodes.length > 0) {
      await driver.executeQuery(
        `
          UNWIND $nodes AS node
          MERGE (n:CareerRoleV2 { id: node.id })
          SET
            n.job_id = node.job_id,
            n.title = node.title,
            n.family = node.family,
            n.level = node.level,
            n.skills = node.skills,
            n.summary = node.summary
        `,
        { nodes: snapshot.nodes },
        { routing: neo4j.routing.WRITE },
      );
    }

    if (snapshot.edges.length > 0) {
      await driver.executeQuery(
        `
          UNWIND $edges AS edge
          MATCH (source:CareerRoleV2 { id: edge.source })
          MATCH (target:CareerRoleV2 { id: edge.target })
          MERGE (source)-[rel:CAREER_PATH_V2 { id: edge.id }]->(target)
          SET
            rel.relation_type = edge.relation_type,
            rel.reason = edge.reason,
            rel.required_skills = edge.required_skills,
            rel.gap_skills = edge.gap_skills,
            rel.transition_cost = edge.transition_cost,
            rel.direction_label = edge.direction_label,
            rel.score = edge.score
        `,
        { edges: snapshot.edges },
        { routing: neo4j.routing.WRITE },
      );
    }

    return {
      nodes_upserted: snapshot.nodes.length,
      edges_upserted: snapshot.edges.length,
    };
  }

  /**
   * 从 Neo4j 查询以目标岗位为中心的子图。
   * 先通过变长路径匹配找到关联节点，再在这些节点之间查找关系边。
   * depth 参数控制展开层数（1-3），超出范围会被截断。
   */
  async function getSubgraphByJobId(jobId: number, depth: number): Promise<CareerGraphSnapshot> {
    await ensureSchema();
    // 限制 depth 在 [1, 3] 之间，防止查询爆炸
    const normalizedDepth = Math.max(1, Math.min(3, Math.trunc(depth)));

    const nodeResult = await driver.executeQuery(
      `
        MATCH (target:CareerRoleV2 { job_id: $jobId })
        MATCH path = (target)-[:CAREER_PATH_V2*0..${normalizedDepth}]-(related:CareerRoleV2)
        UNWIND nodes(path) AS node
        RETURN DISTINCT node
      `,
      { jobId },
      { routing: neo4j.routing.READ },
    );

    const nodes = nodeResult.records.map((record) => mapNode(record.get("node")));
    if (nodes.length === 0) {
      return {
        graph_version: DEFAULT_GRAPH_VERSION,
        generated_at: new Date().toISOString(),
        nodes: [],
        edges: [],
      };
    }

    const nodeIds = nodes.map((node) => node.id);
    const edgeResult = await driver.executeQuery(
      `
        MATCH (source:CareerRoleV2)-[rel:CAREER_PATH_V2]->(target:CareerRoleV2)
        WHERE source.id IN $nodeIds AND target.id IN $nodeIds
        RETURN rel, source.id AS source, target.id AS target
      `,
      { nodeIds },
      { routing: neo4j.routing.READ },
    );

    return {
      graph_version: DEFAULT_GRAPH_VERSION,
      generated_at: new Date().toISOString(),
      nodes,
      edges: edgeResult.records.map((record) => mapEdge(record)),
    };
  }

  /** 列出图谱中所有 CareerRoleV2 节点，按岗位族/职级/名称排序 */
  async function listGraphTargetNodes(): Promise<CareerGraphNodeRecord[]> {
    await ensureSchema();
    const result = await driver.executeQuery(
      `
        MATCH (node:CareerRoleV2)
        RETURN node
        ORDER BY node.family ASC, node.level ASC, node.title ASC
      `,
      {},
      { routing: neo4j.routing.READ },
    );

    return result.records.map((record) => mapNode(record.get("node")));
  }

  async function close(): Promise<void> {
    await driver.close();
  }

  return {
    syncGraph,
    listGraphTargetNodes,
    getSubgraphByJobId,
    close,
  };
}
