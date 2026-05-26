import type { Router } from "express";
import type { Pool } from "pg";

import type { AppEnv } from "../../shared/config/env.js";
import { createPgJobComicsRepository } from "./job-comics.repository.pg.js";
import { createJobComicsRouter } from "./job-comics.route.js";
import { createJobComicsService, type JobComicsService } from "./job-comics.service.js";

export type JobComicsModule = {
  router: Router;
  service: JobComicsService;
};

/**
 * 文件作用：装配岗位漫画模块依赖。
 * 设计边界：模块只组合 repository、service、route，不承载具体业务逻辑。
 */
export function createJobComicsModule(options: {
  pool: Pool;
  env: AppEnv;
  cwd: string;
}): JobComicsModule {
  const repository = createPgJobComicsRepository(options.pool);
  const service = createJobComicsService({
    repository,
    env: options.env,
    cwd: options.cwd,
  });

  return {
    service,
    router: createJobComicsRouter(service),
  };
}
