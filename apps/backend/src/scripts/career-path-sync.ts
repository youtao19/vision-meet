/**
 * 文件作用：显式同步首批岗位图谱种子到 Neo4j。
 * 使用场景：本地首次启动、清库后重建图谱、验证同步幂等性。
 */

import { appEnv } from "../shared/config/env.js";
import { createNeo4jCareerPathRepository } from "../modules/career-path/career-path.repository.neo4j.js";
import {
  CANONICAL_CAREER_EDGES,
  CANONICAL_CAREER_ROLES,
} from "../modules/career-path/career-path.seed.js";

async function main(): Promise<void> {
  const repository = createNeo4jCareerPathRepository({
    uri: appEnv.NEO4J_URI,
    username: appEnv.NEO4J_USERNAME,
    password: appEnv.NEO4J_PASSWORD,
  });

  try {
    const result = await repository.syncSeedGraph({
      roles: CANONICAL_CAREER_ROLES,
      edges: CANONICAL_CAREER_EDGES,
    });

    // eslint-disable-next-line no-console
    console.log(
      `[career-path:sync] nodes_upserted=${result.nodes_upserted} edges_upserted=${result.edges_upserted}`,
    );
  } finally {
    await repository.close();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[career-path:sync] failed", error);
  process.exitCode = 1;
});
