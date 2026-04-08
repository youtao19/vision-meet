import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import {
  createMatchSchema,
  listMatchesQuerySchema,
  matchIdParamsSchema,
} from "./matching.schemas.js";
import type { MatchingService } from "./matching.service.js";

/**
 * 文件作用：匹配领域路由层，仅处理协议转换和参数校验。
 */
export function createMatchingRouter(service: MatchingService): Router {
  const router = Router();

  router.post("", async (req, res, next) => {
    const parsed = createMatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "匹配创建参数不合法", parsed.error.flatten()),
      );
    }

    try {
      const created = await service.createMatch(parsed.data);
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  });

  router.get("", async (req, res, next) => {
    const parsed = listMatchesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "匹配查询参数不合法", parsed.error.flatten()),
      );
    }

    try {
      return res.json(await service.listMatches(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:match_id", async (req, res, next) => {
    const parsed = matchIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "匹配详情参数不合法", parsed.error.flatten()),
      );
    }

    try {
      return res.json(await service.getMatchDetail(parsed.data.match_id));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
