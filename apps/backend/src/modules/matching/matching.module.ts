import type { Router } from "express";
import type { Pool } from "pg";

import { createPgJobsRepository } from "../jobs/jobs.repository.pg.js";
import type { JobsRepository } from "../jobs/jobs.repository.js";
import { createPgProfileRepository } from "../profile/profile.repository.pg.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import { createPgMatchingRepository } from "./matching.repository.pg.js";
import { createMatchingRouter } from "./matching.route.js";
import type { MatchingRepository } from "./matching.repository.js";
import { createMatchingService } from "./matching.service.js";

export type MatchingModuleOptions = {
  pool: Pool;
  scoringVersion: string;
};

export type MatchingServiceDependencies = {
  matchingRepository: MatchingRepository;
  profileRepository: ProfileRepository;
  jobsRepository: JobsRepository;
};

export type MatchingServiceFactoryOptions = {
  scoringVersion: string;
};

export function createMatchingServiceFromDependencies(
  dependencies: MatchingServiceDependencies,
  options: MatchingServiceFactoryOptions,
) {
  return createMatchingService(
    dependencies.matchingRepository,
    dependencies.profileRepository,
    dependencies.jobsRepository,
    {
      scoringVersion: options.scoringVersion,
    },
  );
}

/**
 * 文件作用：matching 模块装配层。
 * 关键职责：完成 repository adapter 与 service 的依赖注入，不承载业务逻辑。
 */
export function createMatchingModule(options: MatchingModuleOptions): Router {
  const jobsRepository = createPgJobsRepository(options.pool);
  const profileRepository = createPgProfileRepository(options.pool);
  const matchingRepository = createPgMatchingRepository(options.pool);

  const service = createMatchingServiceFromDependencies(
    {
      matchingRepository,
      profileRepository,
      jobsRepository,
    },
    options,
  );

  return createMatchingRouter(service);
}
