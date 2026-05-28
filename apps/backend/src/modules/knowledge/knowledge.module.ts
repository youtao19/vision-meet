import type { Router } from "express";

import { createKnowledgeRouter } from "./knowledge.route.js";
import { createKnowledgeRepository } from "./knowledge.repository.js";
import { createKnowledgeService, type KnowledgeService } from "./knowledge.service.js";

/**
 * 文件作用：装配 knowledge 领域依赖。
 * 关键点：由 app.ts 创建单例 service，同时复用给知识检索路由和简历上传后的同步入库回调。
 */

export type KnowledgeModuleOptions = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  vectorDim: number;
  defaultTopK: number;
  reindexBatchSize: number;
};

export function createKnowledgeServiceFromOptions(
  options: KnowledgeModuleOptions,
): KnowledgeService {
  const repository = createKnowledgeRepository({
    host: options.host,
    port: options.port,
    database: options.database,
    user: options.user,
    password: options.password,
    vectorDim: options.vectorDim,
  });

  return createKnowledgeService(repository, {
    vectorDim: options.vectorDim,
    defaultTopK: options.defaultTopK,
    reindexBatchSize: options.reindexBatchSize,
  });
}

export function createKnowledgeModule(options: KnowledgeModuleOptions): {
  router: Router;
  service: KnowledgeService;
} {
  const service = createKnowledgeServiceFromOptions(options);
  return {
    router: createKnowledgeRouter(service),
    service,
  };
}
