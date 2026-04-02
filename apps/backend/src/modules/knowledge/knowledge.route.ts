import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import {
  knowledgeEvaluationSchema,
  knowledgeIndexSchema,
  knowledgeSearchSchema,
} from "./knowledge.schemas.js";
import type { KnowledgeService } from "./knowledge.service.js";

/**
 * 文件作用：暴露 knowledge 领域 HTTP 路由。
 * 设计边界：路由只负责参数校验和错误映射，不承载知识库业务逻辑。
 */
export function createKnowledgeRouter(service: KnowledgeService): Router {
  const router = Router();

  router.post("/index", async (req, res, next) => {
    const parsed = knowledgeIndexSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "知识索引参数不合法", parsed.error.flatten()),
      );
    }

    try {
      return res.status(201).json(await service.index(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/search", async (req, res, next) => {
    const parsed = knowledgeSearchSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "知识检索参数不合法", parsed.error.flatten()),
      );
    }

    try {
      return res.json(await service.search(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/evaluations", async (req, res, next) => {
    const parsed = knowledgeEvaluationSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "知识评测参数不合法", parsed.error.flatten()),
      );
    }

    try {
      return res.json(await service.evaluate(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
