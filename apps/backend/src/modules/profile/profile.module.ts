import type { Router } from "express";
import type { Pool } from "pg";

import type { AppEnv } from "../../shared/config/env.js";
import { createPgProfileRepository } from "./profile.repository.pg.js";
import { createProfileRouter } from "./profile.route.js";
import type { ResumeProfileCreatedHook } from "./profile.service.js";
import { createProfileService } from "./profile.service.js";

export type ProfileModuleOptions = {
  pool: Pool;
  env: AppEnv;
  cwd: string;
  onResumeProfileCreated?: ResumeProfileCreatedHook;
};

export function createProfileModule(options: ProfileModuleOptions): Router {
  const repository = createPgProfileRepository(options.pool);
  const service = createProfileService(repository, {
    env: options.env,
    cwd: options.cwd,
    onResumeProfileCreated: options.onResumeProfileCreated,
  });
  return createProfileRouter(service);
}
