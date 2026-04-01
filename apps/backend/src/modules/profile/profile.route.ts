import { Router } from "express";
import multer from "multer";

import type { CreateStudentProfileFromResumeRequest } from "@career/contracts/types";

import { HttpError } from "../../shared/errors/http-error.js";
import { createProfileFromResumeSchema, createStudentProfileSchema } from "./profile.schemas.js";
import type { ProfileService } from "./profile.service.js";

const upload = multer({ storage: multer.memoryStorage() });

export function createProfileRouter(service: ProfileService): Router {
  const router = Router();

  router.get("", (_req, res) => {
    return res.json(service.listProfiles());
  });

  router.post("", (req, res, next) => {
    const parsed = createStudentProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "画像创建参数不合法", parsed.error.flatten()));
    }

    try {
      const created = service.createProfile(parsed.data);
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/resume", upload.single("file"), (req, res, next) => {
    if (!req.file) {
      return next(new HttpError(400, "VALIDATION_ERROR", "缺少简历文件字段 file"));
    }

    const parsed = createProfileFromResumeSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "简历上传参数不合法", parsed.error.flatten()));
    }

    const payload: CreateStudentProfileFromResumeRequest = {
      file_name: req.file.originalname,
      file_content: req.file.buffer.toString("utf-8"),
      target_role: parsed.data.target_role,
      name: parsed.data.name,
      parse_mode: parsed.data.parse_mode,
    };

    try {
      const created = service.createProfileFromResume(payload);
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
