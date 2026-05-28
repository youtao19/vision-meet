import type { Router } from "express";
import type { Pool } from "pg";

import type { AppEnv } from "../../shared/config/env.js";
import type { TtsEngine } from "../pi-tools/tts/tts-engine.js";
import { createJobComicsRepository } from "./job-comics.repository.js";
import { createJobComicsRouter } from "./job-comics.route.js";
import { createJobComicsService, type JobComicsService } from "./job-comics.service.js";

export type JobComicsModule = {
  router: Router;
  service: JobComicsService;
};

export function createJobComicsModule(options: {
  pool: Pool;
  env: AppEnv;
  cwd: string;
  ttsEngine: TtsEngine;
}): JobComicsModule {
  const repository = createJobComicsRepository(options.pool);
  const service = createJobComicsService({
    repository,
    env: options.env,
    cwd: options.cwd,
    ttsEngine: options.ttsEngine,
  });

  return {
    service,
    router: createJobComicsRouter(service),
  };
}
