import { Router } from "express";
import multer from "multer";

import { HttpError } from "../../shared/errors/http-error.js";
import { generateProfileSchema, listJobsQuerySchema } from "./jobs.schemas.js";
import type { JobsService } from "./jobs.service.js";

const upload = multer({ storage: multer.memoryStorage() });

export function createJobsRouter(service: JobsService): Router {
  const router = Router();

  router.post("/import", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) {
        return next(new HttpError(400, "VALIDATION_ERROR", "缺少上传文件字段 file"));
      }

      const result = await service.importJobs({
        originalname: req.file.originalname,
        buffer: req.file.buffer,
      });

      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败";
      return next(new HttpError(400, "IMPORT_FAILED", message));
    }
  });

  router.get("", async (req, res, next) => {
    const parsed = listJobsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "岗位查询参数不合法", parsed.error.flatten()));
    }

    try {
      return res.json(await service.listJobs(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/profile/generate", async (req, res, next) => {
    const parsed = generateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "岗位画像请求参数不合法", parsed.error.flatten()));
    }

    try {
      const result = await service.generateProfile(parsed.data);
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "画像生成失败";
      if (message.startsWith("NOT_FOUND:")) {
        return next(new HttpError(404, "JOB_NOT_FOUND", message.replace("NOT_FOUND:", "")));
      }
      return next(new HttpError(400, "PROFILE_GENERATE_FAILED", message));
    }
  });

  return router;
}
