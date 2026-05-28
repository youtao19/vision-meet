/**
 * 文件作用：图谱模块 HTTP 路由层，负责参数校验与请求分发。
 * 职责边界：只做参数校验和异常透传，不包含业务逻辑。
 */
import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import {
  careerPathGenerateSchema,
  careerPathQuerySchema,
  jobIdParamsSchema,
} from "./career-graph.schemas.js";
import type { CareerGraphService } from "./career-graph.service.js";

/**
 * 创建图谱路由处理器。
 * 注册三个端点：图谱查询、图谱生成、目标岗位列表。
 */
export function createCareerGraphRouter(service: CareerGraphService): Router {
  const router = Router();

  /**
   * GET /targets
   * 列出图谱中所有可查询的目标岗位，前端用于下拉选择。
   */
  router.get("/targets", async (_req, res, next) => {
    try {
      return res.json(await service.listCareerPathTargets());
    } catch (error) {
      return next(error);
    }
  });

  /**
   * GET /jobs/:job_id
   * 查询指定岗位的职业路径图谱，支持深度/关系类型/最低分数筛选。
   * 先校验路径参数 job_id，再校验查询参数，最后调用 service。
   */
  router.get("/jobs/:job_id", async (req, res, next) => {
    // 校验路径参数：job_id 必须是正整数
    const paramsParsed = jobIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "岗位参数不合法", paramsParsed.error.flatten()),
      );
    }

    // 校验查询参数：depth/relation_type/min_score
    const queryParsed = careerPathQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "图谱查询参数不合法", queryParsed.error.flatten()),
      );
    }

    try {
      // 参数校验通过后，调用 service 查询图谱
      return res.json(
        await service.getCareerPathGraph(paramsParsed.data.job_id, {
          depth: queryParsed.data.depth,
          relation_type: queryParsed.data.relation_type,
          min_score: queryParsed.data.min_score,
        }),
      );
    } catch (error) {
      return next(error);
    }
  });

  /**
   * POST /generate
   * 触发图谱生成。支持 Agent 模式和规则引擎模式两种策略。
   * 由 use_agent 参数决定走哪条路径。
   */
  router.post("/generate", async (req, res, next) => {
    // 校验请求体：force_rebuild/max_candidates_per_node/use_agent
    const parsed = careerPathGenerateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return next(
        new HttpError(400, "VALIDATION_ERROR", "图谱生成参数不合法", parsed.error.flatten()),
      );
    }

    try {
      return res.json(await service.generateCareerPathGraph(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
