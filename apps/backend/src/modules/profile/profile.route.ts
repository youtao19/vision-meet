import { Router } from "express";
import multer from "multer";

import type { CreateStudentProfileFromResumeRequest } from "@career/contracts/types";

import { HttpError } from "../../shared/errors/http-error.js";
import { createProfileFromResumeSchema, createStudentProfileSchema } from "./profile.schemas.js";
import type { ProfileService } from "./profile.service.js";

const upload = multer({ storage: multer.memoryStorage() });

/**
 * 将上传简历内容清洗为可入库文本，避免 `\u0000` 等控制字符触发 PostgreSQL UTF8 错误。
 */
function normalizeResumeFileContent(buffer: Buffer): string {
  return buffer
    .toString("utf-8")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function createProfileRouter(service: ProfileService): Router {
  const router = Router();

  router.get("", async (_req, res, next) => {
    try {
      return res.json(await service.listProfiles());
    } catch (error) {
      return next(error);
    }
  });

  router.post("", async (req, res, next) => {
    const parsed = createStudentProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "画像创建参数不合法", parsed.error.flatten()),
      );
    }

    try {
      const created = await service.createProfile(parsed.data);
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/resume", upload.single("file"), async (req, res, next) => {
    if (!req.file) {
      return next(new HttpError(400, "VALIDATION_ERROR", "缺少简历文件字段 file"));
    }

    const parsed = createProfileFromResumeSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "简历上传参数不合法", parsed.error.flatten()),
      );
    }

    const normalizedFileContent = normalizeResumeFileContent(req.file.buffer);
    if (!normalizedFileContent) {
      return next(
        new HttpError(
          422,
          "RESUME_TEXT_EMPTY",
          "简历文本为空或不可解析，请上传可读文本后重试",
        ),
      );
    }

    const payload: CreateStudentProfileFromResumeRequest = {
      file_name: req.file.originalname,
      file_content: normalizedFileContent,
      target_role: parsed.data.target_role,
      name: parsed.data.name,
      parse_mode: parsed.data.parse_mode,
    };

    try {
      const created = await service.createProfileFromResume(payload);
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
