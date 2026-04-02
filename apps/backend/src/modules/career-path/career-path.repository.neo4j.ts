/**
 * 文件作用：提供职业路径图谱的 Neo4j 仓储实现。
 * 关键约束：图谱写入必须幂等，允许重复执行同步脚本而不产生重复节点和边。
 */

import neo4j from "neo4j-driver";

import {
  createNeo4jDriver,
  type Neo4jConnectionOptions,
} from "../../shared/db/neo4j.js";
import type {
  CareerPathGraphSnapshot,
  CareerPathRepository,
  CareerPathSeedGraph,
} from "./career-path.repository.js";
import type {
  CanonicalCareerEdge,
  CanonicalCareerRole,
} from "./career-path.seed.js";

function mapRole(node: unknown): CanonicalCareerRole {
  const properties = (node as { properties: Record<string, unknown> }).properties;
  return {
    key: String(properties.key),
    title: String(properties.title),
    description: String(properties.description),
    family: String(properties.family),
    level: Number(properties.level),
    aliases: Array.isArray(properties.aliases) ? properties.aliases.map(String) : [],
    typical_skills: Array.isArray(properties.typical_skills)
      ? properties.typical_skills.map(String)
      : [],
  };
}

function mapEdge(record: {
  get(key: string): unknown;
}): CanonicalCareerEdge {
  const relation = record.get("rel") as { properties: Record<string, unknown> };
  const properties = relation.properties;
  return {
    route_key: String(properties.route_key),
    source: String(record.get("source")),
    target: String(record.get("target")),
    relation_type: properties.relation_type as CanonicalCareerEdge["relation_type"],
    reason: String(properties.reason),
    required_skills: Array.isArray(properties.required_skills)
      ? properties.required_skills.map(String)
      : [],
    transition_cost: properties.transition_cost as CanonicalCareerEdge["transition_cost"],
    direction_label: String(properties.direction_label),
  };
}

export function createNeo4jCareerPathRepository(
  options: Neo4jConnectionOptions,
): CareerPathRepository {
  const driver = createNeo4jDriver(options);
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await driver.executeQuery(
          `
            CREATE CONSTRAINT career_role_key_unique IF NOT EXISTS
            FOR (role:CareerRole)
            REQUIRE role.key IS UNIQUE
          `,
          {},
          { routing: neo4j.routing.WRITE },
        );
      })();
    }

    return schemaReady;
  }

  async function syncSeedGraph(
    seedGraph: CareerPathSeedGraph,
  ): Promise<{ nodes_upserted: number; edges_upserted: number }> {
    await ensureSchema();

    await driver.executeQuery(
      `
        UNWIND $roles AS role
        MERGE (node:CareerRole { key: role.key })
        SET
          node.title = role.title,
          node.description = role.description,
          node.family = role.family,
          node.level = role.level,
          node.aliases = role.aliases,
          node.typical_skills = role.typical_skills
      `,
      { roles: seedGraph.roles },
      { routing: neo4j.routing.WRITE },
    );

    await driver.executeQuery(
      `
        UNWIND $edges AS edge
        MATCH (source:CareerRole { key: edge.source })
        MATCH (target:CareerRole { key: edge.target })
        MERGE (source)-[rel:CAREER_PATH { route_key: edge.route_key }]->(target)
        SET
          rel.relation_type = edge.relation_type,
          rel.reason = edge.reason,
          rel.required_skills = edge.required_skills,
          rel.transition_cost = edge.transition_cost,
          rel.direction_label = edge.direction_label
      `,
      { edges: seedGraph.edges },
      { routing: neo4j.routing.WRITE },
    );

    return {
      nodes_upserted: seedGraph.roles.length,
      edges_upserted: seedGraph.edges.length,
    };
  }

  async function getSubgraph(roleKey: string, depth: number): Promise<CareerPathGraphSnapshot> {
    await ensureSchema();
    const limitedDepth = Math.max(1, Math.min(3, Math.trunc(depth)));
    const nodeResult = await driver.executeQuery(
      `
        MATCH (target:CareerRole { key: $roleKey })
        MATCH path = (target)-[:CAREER_PATH*0..${limitedDepth}]-(related:CareerRole)
        UNWIND nodes(path) AS node
        RETURN DISTINCT node
      `,
      { roleKey },
      { routing: neo4j.routing.READ },
    );

    const nodes = nodeResult.records.map((record) => mapRole(record.get("node")));
    if (nodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    const nodeKeys = nodes.map((node) => node.key);
    const edgeResult = await driver.executeQuery(
      `
        MATCH (source:CareerRole)-[rel:CAREER_PATH]->(target:CareerRole)
        WHERE source.key IN $nodeKeys AND target.key IN $nodeKeys
        RETURN rel, source.key AS source, target.key AS target
      `,
      { nodeKeys },
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
    driver,
    syncSeedGraph,
    getSubgraph,
    close,
  };
}
