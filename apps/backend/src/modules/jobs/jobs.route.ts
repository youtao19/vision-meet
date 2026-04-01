import { Router } from "express";
import multer from "multer";

import { generateProfileSchema, listJobsQuerySchema } from "./jobs.schemas.js";
import type { JobsService } from "./jobs.service.js";

const upload = multer({ storage: multer.memoryStorage() });

export function createJobsRouter(service: JobsService): Router {
  const router = Router();

  router.post("/import", upload.single("file"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ detail: "缺少上传文件字段 file" });
      }

      const result = service.importJobs({
        originalname: req.file.originalname,
        buffer: req.file.buffer,
      });

      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败";
      return res.status(400).json({ detail: message });
    }
  });

  router.get("", (req, res) => {
    const parsed = listJobsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ detail: parsed.error.flatten() });
    }

    return res.json(service.listJobs(parsed.data));
  });

  router.post("/profile/generate", (req, res) => {
    const parsed = generateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ detail: parsed.error.flatten() });
    }

    try {
      const result = service.generateProfile(parsed.data);
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "画像生成失败";
      if (message.startsWith("NOT_FOUND:")) {
        return res.status(404).json({ detail: message.replace("NOT_FOUND:", "") });
      }
      return res.status(400).json({ detail: message });
    }
  });

  return router;
}
