/**
 * 文件作用：装配学生画像模块的 repository、service 和 HTTP router。
 * 边界说明：这里只做依赖注入，不写画像解析、评分或数据库细节。
 */

import type { Router } from "express";
import type { Pool } from "pg";

import type { AppEnv } from "../../shared/config/env.js";
import type { JobsRepository } from "../jobs/jobs.repository.js";
import { createPgProfileRepository } from "./profile.repository.pg.js";
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

/**
 * 创建学生画像模块路由。
 * 逻辑：先用同一个 PostgreSQL pool 创建画像仓储，再把环境配置、岗位仓储和简历创建后的 hook 注入 service，
 * 最后返回绑定好 service 的 Express router。
 */
export function createProfileModule(options: ProfileModuleOptions): Router {
  const repository = createPgProfileRepository(options.pool);
  const service = createProfileService(repository, {
    env: options.env,
    cwd: options.cwd,
    jobsRepository: options.jobsRepository,
    onResumeProfileCreated: options.onResumeProfileCreated,
  });
  return createProfileRouter(service);
}
