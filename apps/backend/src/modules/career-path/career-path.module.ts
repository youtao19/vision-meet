import type { Router } from "express";

import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import { createCareerPathRouter } from "./career-path.route.js";
import { createNeo4jCareerPathRepository } from "./career-path.repository.neo4j.js";
import { createCareerPathService, type CareerPathService } from "./career-path.service.js";

/**
 * 文件作用：装配职业路径图谱模块。
 * 依赖关系：由 app.ts 注入已有岗位/画像仓储和 Neo4j 连接信息，避免模块内部反向依赖应用装配层。
 */

export type CareerPathModuleDependencies = {
  jobsRepository: JobsRepository;
  profileRepository: ProfileRepository;
};

export type CareerPathModuleOptions = {
  uri: string;
  username: string;
  password: string;
};

export function createCareerPathServiceFromDependencies(
  dependencies: CareerPathModuleDependencies,
  options: CareerPathModuleOptions,
): CareerPathService {
  const repository = createNeo4jCareerPathRepository({
    uri: options.uri,
    username: options.username,
    password: options.password,
  });

  return createCareerPathService(
    dependencies.jobsRepository,
    dependencies.profileRepository,
    repository,
  );
}

export function createCareerPathModule(
  dependencies: CareerPathModuleDependencies,
  options: CareerPathModuleOptions,
): {
  router: Router;
  service: CareerPathService;
} {
  const service = createCareerPathServiceFromDependencies(dependencies, options);
  return {
    router: createCareerPathRouter(service),
    service,
  };
}
