/**
 * 文件作用：提供岗位智能图谱的 Neo4j 持久化能力。
 * 关键约束：每次同步以覆盖写为主，保证图谱状态与最新画像快照一致。
 */

import neo4j from "neo4j-driver";

import {
  createNeo4jDriver,
  toNeo4jNumber,
  type Neo4jConnectionOptions,
} from "../../shared/db/neo4j.js";

export type CareerGraphNodeRecord = {
  id: string;
  job_id: number;
  title: string;
  family: string;
  level: number;
  skills: string[];
  summary: string;
};

export type CareerGraphEdgeRecord = {
  id: string;
  source: string;
  target: string;
  relation_type: "promotion" | "transition";
  reason: string;
  required_skills: string[];
  gap_skills: string[];
  transition_cost: "low" | "medium" | "high";
  direction_label: string;
  score: number;
};

export type CareerGraphSnapshot = {
  nodes: CareerGraphNodeRecord[];
  edges: CareerGraphEdgeRecord[];
};

export interface JobsIntelligenceGraphRepository {
  syncGraph(snapshot: CareerGraphSnapshot): Promise<{ nodes_upserted: number; edges_upserted: number }>;
  getSubgraphByJobId(jobId: number, depth: number): Promise<CareerGraphSnapshot>;
  close(): Promise<void>;
}

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

export function createNeo4jJobsIntelligenceGraphRepository(
  options: Neo4jConnectionOptions,
): JobsIntelligenceGraphRepository {
  const driver = createNeo4jDriver(options);
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

  async function syncGraph(
    snapshot: CareerGraphSnapshot,
  ): Promise<{ nodes_upserted: number; edges_upserted: number }> {
    await ensureSchema();

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

  async function getSubgraphByJobId(jobId: number, depth: number): Promise<CareerGraphSnapshot> {
    await ensureSchema();
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
      return { nodes: [], edges: [] };
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
      nodes,
      edges: edgeResult.records.map((record) => mapEdge(record)),
    };
  }

  async function close(): Promise<void> {
    await driver.close();
  }

  return {
    syncGraph,
    getSubgraphByJobId,
    close,
  };
}
