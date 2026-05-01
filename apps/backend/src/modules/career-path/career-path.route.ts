import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import { careerPathParamsSchema, careerPathQuerySchema } from "./career-path.schemas.js";
import type { CareerPathService } from "./career-path.service.js";

/**
 * V1 career-path API 已停止迭代，仅保留向后兼容。
 * 后续按 sunset 日期下线整个模块；新接入方请走 /api/v2/career-paths/*。
 */
const V1_SUNSET_DATE = "Mon, 02 Nov 2026 00:00:00 GMT";
const V1_SUCCESSOR_LINK = '</api/v2/career-paths/jobs/{job_id}>; rel="successor-version"';

/**
 * 文件作用：暴露职业路径图谱的查询接口（V1，已废弃）。
 * 设计边界：路由层只做参数校验与协议转换，不在这里拼接路径推荐逻辑。
 * 注意：所有响应都会附带 Deprecation/Sunset/Link 头，告知调用方迁移到 V2。
 */
export function createCareerPathRouter(service: CareerPathService): Router {
  const router = Router();

  router.use((_req, res, next) => {
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", V1_SUNSET_DATE);
    res.setHeader("Link", V1_SUCCESSOR_LINK);
    res.setHeader(
      "Warning",
      '299 - "/api/v1/career-paths is deprecated; migrate to /api/v2/career-paths/jobs/{job_id} before sunset"',
    );
    next();
  });

  router.get("/jobs/:job_id", async (req, res, next) => {
    const paramsParsed = careerPathParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "岗位路径参数不合法", paramsParsed.error.flatten()),
      );
    }

    const queryParsed = careerPathQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return next(
        new HttpError(
          400,
          "VALIDATION_ERROR",
          "岗位路径查询参数不合法",
          queryParsed.error.flatten(),
        ),
      );
    }

    try {
      return res.json(
        await service.getCareerPathGraph({
          job_id: paramsParsed.data.job_id,
          student_profile_id: queryParsed.data.student_profile_id,
          depth: queryParsed.data.depth,
        }),
      );
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
