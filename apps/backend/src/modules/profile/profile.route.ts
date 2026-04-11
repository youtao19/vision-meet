import { Router } from "express";
import multer from "multer";

import type { CreateStudentProfileFromResumeRequest } from "@career/contracts/types";

import { HttpError } from "../../shared/errors/http-error.js";
import type { ResumeVisionParser } from "./profile.resume-vision.js";
import {
  getResumeUploadExtension,
  isResumeImageExtension,
  parseUploadedResumeToText,
} from "./profile.resume-parser.js";
import { createProfileFromResumeSchema, createStudentProfileSchema } from "./profile.schemas.js";
import type { ProfileService } from "./profile.service.js";

const upload = multer({ storage: multer.memoryStorage() });

type ProfileRouterOptions = {
  resumeVisionParser?: ResumeVisionParser;
};

export function createProfileRouter(
  service: ProfileService,
  options: ProfileRouterOptions = {},
): Router {
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

    try {
      const extension = getResumeUploadExtension(req.file.originalname);
      const shouldUseVisionFirst = isResumeImageExtension(extension);
      let normalizedFileContent = "";
      let inferredName = parsed.data.name;
      let inferredTargetRole = parsed.data.target_role;

      if (shouldUseVisionFirst) {
        if (!options.resumeVisionParser) {
          return next(
            new HttpError(422, "RESUME_VISION_UNAVAILABLE", "当前服务未启用图片简历解析能力"),
          );
        }

        const visionResult = await options.resumeVisionParser({
          fileName: req.file.originalname,
          buffer: req.file.buffer,
        });
        normalizedFileContent = visionResult.plainText;
        inferredName = inferredName || visionResult.name || undefined;
        inferredTargetRole =
          inferredTargetRole === "待定岗位" && visionResult.targetRole
            ? visionResult.targetRole
            : inferredTargetRole;
      } else {
        try {
          normalizedFileContent = await parseUploadedResumeToText({
            fileName: req.file.originalname,
            buffer: req.file.buffer,
          });
        } catch (error) {
          if (extension === ".pdf" && options.resumeVisionParser) {
            const visionResult = await options.resumeVisionParser({
              fileName: req.file.originalname,
              buffer: req.file.buffer,
            });
            normalizedFileContent = visionResult.plainText;
            inferredName = inferredName || visionResult.name || undefined;
            inferredTargetRole =
              inferredTargetRole === "待定岗位" && visionResult.targetRole
                ? visionResult.targetRole
                : inferredTargetRole;
          } else {
            throw error;
          }
        }
      }

      if (!normalizedFileContent) {
        return next(
          new HttpError(422, "RESUME_TEXT_EMPTY", "简历文本为空或不可解析，请上传可读文本后重试"),
        );
      }

      const payload: CreateStudentProfileFromResumeRequest = {
        file_name: req.file.originalname,
        file_content: normalizedFileContent,
        target_role: inferredTargetRole,
        name: inferredName,
        parse_mode: parsed.data.parse_mode,
      };

      const created = await service.createProfileFromResume(payload);
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
