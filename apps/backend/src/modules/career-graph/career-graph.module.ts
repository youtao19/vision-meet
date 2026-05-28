/**
 * 文件作用：装配图谱模块依赖（PG 仓储 + Neo4j 仓储 + 服务 + 路由）。
 * 职责边界：不包含业务逻辑，只做依赖创建与注入。
 */
import type { Router } from "express";
import type { Pool } from "pg";

import type { AppEnv } from "../../shared/config/env.js";
import { type Neo4jConnectionOptions } from "../../shared/db/neo4j.js";
import { createCareerGraphPgRepository } from "./career-graph.repository.pg.js";
import { createNeo4jCareerGraphRepository } from "./career-graph.repository.neo4j.js";
import { createCareerGraphRouter } from "./career-graph.route.js";
import { createCareerGraphService } from "./career-graph.service.js";

/**
 * 图谱模块创建选项。
 * - pool: PG 连接池，用于读取岗位画像原始数据
 * - neo4j: Neo4j 连接信息，用于图谱读写
 * - env: 应用环境变量，透传给 service 用于 Agent 调用
 */
export type CareerGraphModuleOptions = {
  pool: Pool;
  neo4j: Neo4jConnectionOptions;
  env: AppEnv;
};

/**
 * 创建图谱模块入口。
 * 组装顺序：PG 仓储（读画像）→ Neo4j 仓储（存图）→ 服务（业务编排）→ 路由（HTTP 分发）。
 */
export function createCareerGraphModule(options: CareerGraphModuleOptions): Router {
  // 创建 PG 仓储，用于读取 v2_manual_job_portraits 等关系型数据
  const pgRepository = createCareerGraphPgRepository(options.pool);
  // 创建 Neo4j 仓储，用于图谱节点和关系的持久化查询
  const graphRepository = createNeo4jCareerGraphRepository(options.neo4j);
  // 创建业务服务层，注入两个数据源和环境变量
  const service = createCareerGraphService(pgRepository, graphRepository, options.env);
  // 创建路由并挂载 service
  return createCareerGraphRouter(service);
}
