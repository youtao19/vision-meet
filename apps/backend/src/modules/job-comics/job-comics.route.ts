import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import {
  generateJobPortraitComicSchema,
  manualJobPortraitNameParamsSchema,
} from "./job-comics.schemas.js";
import type { JobComicsService } from "./job-comics.service.js";

/**
 * 文件作用：暴露岗位漫画 HTTP API。
 * 设计边界：路由层只做参数校验和协议转换，不直接访问数据库或生图能力。
 */
export function createJobComicsRouter(service: JobComicsService): Router {
  const router = Router();

  router.post("/job-portraits/manual/:job_name/comic", async (req, res, next) => {
    const paramsParsed = manualJobPortraitNameParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "岗位画像参数不合法", paramsParsed.error.flatten()),
      );
    }

    const bodyParsed = generateJobPortraitComicSchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "漫画生成参数不合法", bodyParsed.error.flatten()),
      );
    }

    try {
      return res.json(
        await service.generateManualJobPortraitComic({
          jobName: paramsParsed.data.job_name,
          force: bodyParsed.data.force,
          comicContext: bodyParsed.data.comic_context,
        }),
      );
    } catch (error) {
      return next(error);
    }
  });

  router.get("/job-portraits/manual/:job_name/comic", async (req, res, next) => {
    const paramsParsed = manualJobPortraitNameParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "岗位画像参数不合法", paramsParsed.error.flatten()),
      );
    }

    try {
      return res.json(await service.getManualJobPortraitComic(paramsParsed.data.job_name));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
