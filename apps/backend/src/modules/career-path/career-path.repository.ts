/**
 * 文件作用：定义职业路径图谱仓储抽象。
 * 职责边界：service 只依赖该抽象，不直接感知 Neo4j driver 或 Cypher 细节。
 */

import type { Driver } from "neo4j-driver";

import type { CanonicalCareerEdge, CanonicalCareerRole } from "./career-path.seed.js";

export type CareerPathSeedGraph = {
  roles: CanonicalCareerRole[];
  edges: CanonicalCareerEdge[];
};

export type CareerPathGraphSnapshot = {
  nodes: CanonicalCareerRole[];
  edges: CanonicalCareerEdge[];
};

export interface CareerPathRepository {
  syncSeedGraph(
    seedGraph: CareerPathSeedGraph,
  ): Promise<{ nodes_upserted: number; edges_upserted: number }>;
  getSubgraph(roleKey: string, depth: number): Promise<CareerPathGraphSnapshot>;
  close(): Promise<void>;
  readonly driver: Driver;
}
