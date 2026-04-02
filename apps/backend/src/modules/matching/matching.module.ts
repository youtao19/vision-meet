import type { Router } from "express";

import { createJsonJobsRepository } from "../jobs/jobs.repository.json.js";
import type { JobsRepository } from "../jobs/jobs.repository.js";
import { createJsonProfileRepository } from "../profile/profile.repository.json.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import { createJsonMatchingRepository } from "./matching.repository.json.js";
import { createMatchingRouter } from "./matching.route.js";
import type { MatchingRepository } from "./matching.repository.js";
import { createMatchingService } from "./matching.service.js";

export type MatchingModuleOptions = {
  dataStorePath?: string;
  profileStorePath?: string;
  matchStorePath?: string;
  scoringVersion: string;
};

export type MatchingServiceDependencies = {
  matchingRepository: MatchingRepository;
  profileRepository: ProfileRepository;
  jobsRepository: JobsRepository;
};

export function createMatchingServiceFromDependencies(
  dependencies: MatchingServiceDependencies,
  options: MatchingModuleOptions,
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
  const jobsRepository = createJsonJobsRepository(options.dataStorePath);
  const profileRepository = createJsonProfileRepository(options.profileStorePath);
  const matchingRepository = createJsonMatchingRepository(options.matchStorePath);

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
