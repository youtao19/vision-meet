import type { Router } from "express";

import { createJsonJobsRepository } from "./jobs.repository.json.js";
import { createJobsRouter } from "./jobs.route.js";
import { createJobsService } from "./jobs.service.js";

export type JobsModuleOptions = {
  dataStorePath?: string;
};

export function createJobsModule(options: JobsModuleOptions = {}): Router {
  const repository = createJsonJobsRepository(options.dataStorePath);
  const service = createJobsService(repository);
  return createJobsRouter(service);
}
