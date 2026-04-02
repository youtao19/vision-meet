import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import {
  careerPathParamsSchema,
  careerPathQuerySchema,
} from "./career-path.schemas.js";
import type { CareerPathService } from "./career-path.service.js";

/**
 * 文件作用：暴露职业路径图谱的查询接口。
 * 设计边界：路由层只做参数校验与协议转换，不在这里拼接路径推荐逻辑。
 */
export function createCareerPathRouter(service: CareerPathService): Router {
  const router = Router();

  router.get("/jobs/:job_id", async (req, res, next) => {
    const paramsParsed = careerPathParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "岗位路径参数不合法", paramsParsed.error.flatten()));
    }

    const queryParsed = careerPathQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "岗位路径查询参数不合法", queryParsed.error.flatten()));
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
