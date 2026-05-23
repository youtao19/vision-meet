import type { Router } from "express";
import type { Pool } from "pg";

import { createPgJobsIntelligenceRepository } from "../jobs-intelligence/jobs-intelligence.repository.pg.js";
import { createPgProfileRepository } from "../profile/profile.repository.pg.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import { createPgMatchingRepository } from "./matching.repository.pg.js";
import { createMatchingRouter } from "./matching.route.js";
import type { MatchingRepository } from "./matching.repository.js";
import { createMatchingService, type JobPortraitRepository } from "./matching.service.js";

export type MatchingModuleOptions = {
  pool: Pool;
  scoringVersion: string;
};

export type MatchingServiceDependencies = {
  matchingRepository: MatchingRepository;
  profileRepository: ProfileRepository;
  jobPortraitRepository: JobPortraitRepository;
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
    dependencies.jobPortraitRepository,
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
  const profileRepository = createPgProfileRepository(options.pool);
  const matchingRepository = createPgMatchingRepository(options.pool);
  const jobPortraitRepository = createPgJobsIntelligenceRepository(options.pool);

  const service = createMatchingServiceFromDependencies(
    {
      matchingRepository,
      profileRepository,
      jobPortraitRepository: {
        getManualJobPortraitByName: async (jobName) => {
          const portrait = await jobPortraitRepository.getManualJobPortraitByName?.(jobName);
          return portrait ?? null;
        },
      },
    },
    options,
  );

  return createMatchingRouter(service);
}
