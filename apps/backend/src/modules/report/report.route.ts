import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import {
  createReportSchema,
  listReportsQuerySchema,
  reportIdParamsSchema,
  updateReportSchema,
} from "./report.schemas.js";
import type { ReportService } from "./report.service.js";

/**
 * 文件作用：报告领域路由层，仅负责参数校验、状态码和协议转换。
 */
export function createReportRouter(service: ReportService): Router {
  const router = Router();

  router.post("", (req, res, next) => {
    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "报告创建参数不合法", parsed.error.flatten()));
    }

    try {
      const created = service.createReport(parsed.data);
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  });

  router.get("", (req, res, next) => {
    const parsed = listReportsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "报告查询参数不合法", parsed.error.flatten()));
    }

    try {
      return res.json(service.listReports(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:report_id", (req, res, next) => {
    const parsed = reportIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "报告详情参数不合法", parsed.error.flatten()));
    }

    try {
      return res.json(service.getReport(parsed.data.report_id));
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/:report_id", (req, res, next) => {
    const paramsParsed = reportIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "报告详情参数不合法", paramsParsed.error.flatten()));
    }

    const bodyParsed = updateReportSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return next(new HttpError(400, "REPORT_SECTION_INVALID", "报告章节内容不合法", bodyParsed.error.flatten()));
    }

    try {
      return res.json(service.updateReport(paramsParsed.data.report_id, bodyParsed.data));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
