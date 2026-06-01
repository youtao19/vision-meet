import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import {
  resumeDraftCreateSchema,
  resumeHtmlCreateSchema,
  resumeHtmlListQuerySchema,
  resumeHtmlIdParamsSchema,
} from "./resume.schemas.js";
import type { ResumeService } from "./resume.service.js";

export function createResumeRouter(service: ResumeService): Router {
  const router = Router();

  router.post("/draft", async (req, res, next) => {
    const parsed = resumeDraftCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new HttpError(
          400,
          "RESUME_DRAFT_INPUT_INVALID",
          "简历追问参数不合法",
          parsed.error.flatten(),
        ),
      );
    }

    try {
      const traceId = (res.locals.trace_id as string | undefined) || "";
      const result = await service.generateResumeDraft(parsed.data, { traceId });
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/html", async (req, res, next) => {
    const parsed = resumeHtmlCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new HttpError(
          400,
          "RESUME_HTML_INPUT_INVALID",
          "简历生成参数不合法",
          parsed.error.flatten(),
        ),
      );
    }

    try {
      const traceId = (res.locals.trace_id as string | undefined) || "";
      const result = await service.generateResumeHtml(parsed.data, { traceId });
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/html", async (req, res, next) => {
    const parsed = resumeHtmlListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(
        new HttpError(
          400,
          "RESUME_HTML_LIST_QUERY_INVALID",
          "简历列表查询参数不合法",
          parsed.error.flatten(),
        ),
      );
    }

    try {
      const result = await service.listResumeHtmlRecords(parsed.data.offset, parsed.data.limit);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/html/:resume_id", async (req, res, next) => {
    const parsed = resumeHtmlIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(
        new HttpError(400, "RESUME_HTML_ID_INVALID", "简历标识不合法", parsed.error.flatten()),
      );
    }

    try {
      const result = await service.getResumeHtmlRecordById(parsed.data.resume_id);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
