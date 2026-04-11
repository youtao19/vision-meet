import type { Router } from "express";
import type { Pool } from "pg";

import type { AppEnv } from "../../shared/config/env.js";
import type { JobsRepository } from "../jobs/jobs.repository.js";
import { createPgProfileRepository } from "./profile.repository.pg.js";
import { createResumeVisionParser } from "./profile.resume-vision.js";
import { createProfileRouter } from "./profile.route.js";
import type { ResumeProfileCreatedHook } from "./profile.service.js";
import { createProfileService } from "./profile.service.js";

export type ProfileModuleOptions = {
  pool: Pool;
  env: AppEnv;
  cwd: string;
  jobsRepository?: JobsRepository;
  onResumeProfileCreated?: ResumeProfileCreatedHook;
};

export function createProfileModule(options: ProfileModuleOptions): Router {
  const repository = createPgProfileRepository(options.pool);
  const service = createProfileService(repository, {
    jobsRepository: options.jobsRepository,
    onResumeProfileCreated: options.onResumeProfileCreated,
  });
  return createProfileRouter(service, {
    resumeVisionParser: createResumeVisionParser({
      env: options.env,
      cwd: options.cwd,
    }),
  });
}
