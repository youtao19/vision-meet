import type { Router } from "express";
import type { Pool } from "pg";

import { createPgJobPortraitsRepository } from "./job-portraits.repository.pg.js";
import { createJobPortraitsRouter } from "./job-portraits.route.js";
import { createJobPortraitsService } from "./job-portraits.service.js";

export type JobPortraitsModuleOptions = {
  pool: Pool;
};

export function createJobPortraitsModule(options: JobPortraitsModuleOptions): Router {
  const repository = createPgJobPortraitsRepository(options.pool);
  const service = createJobPortraitsService(repository);
  return createJobPortraitsRouter(service);
}
