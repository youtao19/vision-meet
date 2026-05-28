import type { Router } from "express";
import type { Pool } from "pg";

import { createPgJobsIntelligenceRepository } from "./jobs-intelligence.repository.pg.js";
import { createJobsIntelligenceRouter } from "./jobs-intelligence.route.js";
import { createJobsIntelligenceService } from "./jobs-intelligence.service.js";

export type JobsIntelligenceModuleOptions = {
  pool: Pool;
};

/**
 * 文件作用：装配岗位智能处理域依赖并导出 V2 路由。
 */
export function createJobsIntelligenceModule(options: JobsIntelligenceModuleOptions): Router {
  const repository = createPgJobsIntelligenceRepository(options.pool);
  const service = createJobsIntelligenceService(repository);
  return createJobsIntelligenceRouter(service);
}
