import type { Router } from "express";
import type { Pool } from "pg";

import type { AppEnv } from "../../shared/config/env.js";
import {
  type Neo4jConnectionOptions,
} from "../../shared/db/neo4j.js";
import { createNeo4jJobsIntelligenceGraphRepository } from "./jobs-intelligence.repository.neo4j.js";
import { createPgJobsIntelligenceRepository } from "./jobs-intelligence.repository.pg.js";
import { createJobsIntelligenceRouter } from "./jobs-intelligence.route.js";
import { createJobsIntelligenceService } from "./jobs-intelligence.service.js";

export type JobsIntelligenceModuleOptions = {
  pool: Pool;
  neo4j: Neo4jConnectionOptions;
  env: AppEnv;
};

/**
 * 文件作用：装配岗位智能处理域依赖并导出 V2 路由。
 */
export function createJobsIntelligenceModule(options: JobsIntelligenceModuleOptions): Router {
  const repository = createPgJobsIntelligenceRepository(options.pool);
  const graphRepository = createNeo4jJobsIntelligenceGraphRepository(options.neo4j);
  const service = createJobsIntelligenceService(repository, graphRepository, options.env);
  return createJobsIntelligenceRouter(service);
}
