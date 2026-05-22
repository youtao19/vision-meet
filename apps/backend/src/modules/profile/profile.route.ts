/**
 * 文件作用：定义学生画像 HTTP 路由，包括画像列表、表单创建和简历上传创建。
 * 边界说明：route 层只负责请求校验、文件接收和调用 service，不直接访问数据库或 Agent。
 */

import { Router } from "express";
import multer from "multer";

import type { CreateStudentProfileFromResumeRequest } from "@career/contracts/types";

import { HttpError } from "../../shared/errors/http-error.js";
import { renderUploadedResumeToImages } from "./profile.resume-parser.js";
import { createProfileFromResumeSchema, createStudentProfileSchema } from "./profile.schemas.js";
import type { ProfileService } from "./profile.service.js";

// 简历文件只在内存中转成图片输入，不在本地保存原始上传文件。
const upload = multer({ storage: multer.memoryStorage() });

/**
 * 创建学生画像路由。
 * 逻辑：GET 返回画像列表；POST / 接收结构化表单；POST /resume 接收文件并先渲染成图片，
 * 再交给 profile service 执行画像解析、归一化和入库。
 */
export function createProfileRouter(
  service: ProfileService,
): Router {
  const router = Router();

  // 查询历史画像，直接透传 service 的列表结果。
  router.get("", async (_req, res, next) => {
    try {
      return res.json(await service.listProfiles());
    } catch (error) {
      return next(error);
    }
  });

  // 表单创建路径：先用 zod 校验合同结构，再交给 service 统一计算评分和落库。
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

  // 简历创建路径：上传文件必须先转成图片数组，后续由 Pi 能力读取图片并返回结构化 JSON。
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
      // PDF 会按页渲染为 PNG；图片则直接转 base64，route 不参与任何字段抽取。
      const fileImages = await renderUploadedResumeToImages({
        fileName: req.file.originalname,
        buffer: req.file.buffer,
      });

      // 只把 service 需要的业务输入传下去，避免上传中间态泄漏到领域层。
      const payload: CreateStudentProfileFromResumeRequest = {
        file_name: req.file.originalname,
        file_images: fileImages,
        target_role: parsed.data.target_role || "",
        name: parsed.data.name,
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
