/**
 * 文件作用：手动触发岗位智能处理流水线（全量清洗入库 + Agent 生成 10 条岗位画像）。
 * 使用方式：
 * 1. 默认执行：npm run jobs:pipeline:run
 * 2. 显式指定：npm run jobs:pipeline:run -- --mode=cleanse_agent_portraits
 * 3. 兼容旧值：--mode=facts_canonical_full 会自动映射为新模式
 */

import { appEnv } from "../shared/config/env.js";
import { createAppPgPool } from "../shared/db/postgres.js";
import { createNeo4jJobsIntelligenceGraphRepository } from "../modules/jobs-intelligence/jobs-intelligence.repository.neo4j.js";
import { createPgJobsIntelligenceRepository } from "../modules/jobs-intelligence/jobs-intelligence.repository.pg.js";
import { createJobsIntelligenceService } from "../modules/jobs-intelligence/jobs-intelligence.service.js";

function resolveMode(): "cleanse_agent_portraits" {
  const value = process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1];
  if (!value) {
    return "cleanse_agent_portraits";
  }

  if (value === "facts_canonical_full") {
    return "cleanse_agent_portraits";
  }

  if (value !== "cleanse_agent_portraits") {
    throw new Error(
      `不支持的 mode: ${value}，当前仅支持 cleanse_agent_portraits（兼容接受 facts_canonical_full）`,
    );
  }

  return "cleanse_agent_portraits";
}

async function main(): Promise<void> {
  const mode = resolveMode();
  const pool = createAppPgPool({
    host: appEnv.PGHOST,
    port: appEnv.PGPORT,
    database: appEnv.PGDATABASE,
    user: appEnv.PGUSER,
    password: appEnv.PGPASSWORD,
  });
  const repository = createPgJobsIntelligenceRepository(pool);
  const graphRepository = createNeo4jJobsIntelligenceGraphRepository({
    uri: appEnv.NEO4J_URI,
    username: appEnv.NEO4J_USERNAME,
    password: appEnv.NEO4J_PASSWORD,
  });
  const service = createJobsIntelligenceService(repository, graphRepository, appEnv);

  try {
    const result = await service.runPipelineNow({ mode });
    // eslint-disable-next-line no-console
    console.log("[jobs:pipeline:run]", JSON.stringify(result, null, 2));
  } finally {
    await graphRepository.close();
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[jobs:pipeline:run] failed", error);
  process.exitCode = 1;
});
