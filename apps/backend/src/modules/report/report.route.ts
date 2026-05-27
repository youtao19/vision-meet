import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import {
  createReportExportSchema,
  createReportSchema,
  exportIdParamsSchema,
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

  router.post("", async (req, res, next) => {
    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "报告创建参数不合法", parsed.error.flatten()),
      );
    }

    try {
      const created = await service.createReport(parsed.data, {
        trace_id: res.locals.trace_id as string | undefined,
      });
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  });

  router.get("", async (req, res, next) => {
    const parsed = listReportsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "报告查询参数不合法", parsed.error.flatten()),
      );
    }

    try {
      return res.json(await service.listReports(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:report_id", async (req, res, next) => {
    const parsed = reportIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "报告详情参数不合法", parsed.error.flatten()),
      );
    }

    try {
      return res.json(await service.getReport(parsed.data.report_id));
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/:report_id", async (req, res, next) => {
    const paramsParsed = reportIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "报告详情参数不合法", paramsParsed.error.flatten()),
      );
    }

    const bodyParsed = updateReportSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return next(
        new HttpError(
          400,
          "REPORT_SECTION_INVALID",
          "报告章节内容不合法",
          bodyParsed.error.flatten(),
        ),
      );
    }

    try {
      return res.json(await service.updateReport(paramsParsed.data.report_id, bodyParsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/:report_id", async (req, res, next) => {
    const parsed = reportIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "报告详情参数不合法", parsed.error.flatten()),
      );
    }

    try {
      await service.deleteReport(parsed.data.report_id);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  router.post("/:report_id/exports", async (req, res, next) => {
    const paramsParsed = reportIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "报告详情参数不合法", paramsParsed.error.flatten()),
      );
    }

    const bodyParsed = createReportExportSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "导出请求参数不合法", bodyParsed.error.flatten()),
      );
    }

    try {
      const created = await service.createReportExport(
        paramsParsed.data.report_id,
        bodyParsed.data,
      );
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:report_id/exports", async (req, res, next) => {
    const paramsParsed = reportIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "报告详情参数不合法", paramsParsed.error.flatten()),
      );
    }

    try {
      return res.json(await service.listReportExports(paramsParsed.data.report_id));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

/**
 * 文件作用：单独暴露报告导出下载路由，避免把下载路径绑死在 /reports 前缀下。
 */
export function createReportExportDownloadRouter(service: ReportService): Router {
  const router = Router();

  router.get("/:export_id/download", async (req, res, next) => {
    const parsed = exportIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "导出下载参数不合法", parsed.error.flatten()),
      );
    }

    try {
      const { record, absoluteFilePath } = await service.resolveReportExportDownload(
        parsed.data.export_id,
      );
      const contentType =
        record.format === "markdown" ? "text/markdown; charset=utf-8" : "application/pdf";
      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(record.file_name)}"`,
      );
      return res.sendFile(absoluteFilePath);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
