import type { Router } from "express";
import type { Pool } from "pg";

import { createPgJobsRepository } from "./jobs.repository.pg.js";
import { createJobsRouter } from "./jobs.route.js";
import { createJobsService } from "./jobs.service.js";

export type JobsModuleOptions = {
  pool: Pool;
};

export function createJobsModule(options: JobsModuleOptions): Router {
  const repository = createPgJobsRepository(options.pool);
  const service = createJobsService(repository);
  return createJobsRouter(service);
}
