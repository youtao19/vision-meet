import type { Router } from "express";

import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import { createCareerPathRouter } from "./career-path.route.js";
import { createNeo4jCareerPathRepository } from "./career-path.repository.neo4j.js";
import { createCareerPathService, type CareerPathService } from "./career-path.service.js";

/**
 * 文件作用：装配职业路径图谱模块（V1，已废弃）。
 * 依赖关系：由 app.ts 注入已有岗位/画像仓储和 Neo4j 连接信息，避免模块内部反向依赖应用装配层。
 *
 * @deprecated V1 模块仅保留兼容路由 `/api/v1/career-paths/*`，新逻辑请使用
 *   `apps/backend/src/modules/jobs-intelligence/jobs-intelligence.service.ts` 的
 *   `getCareerPathGraph` / `generateCareerPathGraph`，对应 `/api/v2/career-paths/*`。
 *   计划于 2026-11 完整下线，下线前请确保历史调用方完成迁移。
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

/** @deprecated V1 路径，详见 createCareerPathModule。 */
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

/** @deprecated V1 路径，详见文件注释。 */
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
