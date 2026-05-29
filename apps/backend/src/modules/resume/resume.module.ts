import type { Router } from "express";
import type { Pool } from "pg";

import { createPgResumeRepository } from "./resume.repository.pg.js";
import { createResumeRouter } from "./resume.route.js";
import { createResumeService } from "./resume.service.js";
import type { PiThinkingLevel } from "../../shared/agent/pi-types.js";

export type ResumeModuleOptions = {
  pool: Pool;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel?: PiThinkingLevel;
  resumeTimeoutMs?: number;
  cwd?: string;
};

export function createResumeModule(options: ResumeModuleOptions): Router {
  const repository = createPgResumeRepository(options.pool);
  const service = createResumeService({
    resumeRepository: repository,
    piAgentDir: options.piAgentDir,
    sessionStoreDir: options.sessionStoreDir,
    model: options.model,
    thinkingLevel: options.thinkingLevel,
    resumeTimeoutMs: options.resumeTimeoutMs,
    cwd: options.cwd,
  });

  return createResumeRouter(service);
}
