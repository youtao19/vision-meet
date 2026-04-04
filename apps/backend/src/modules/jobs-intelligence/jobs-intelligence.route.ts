import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import {
  canonicalRoleParamsSchema,
  careerPathQuerySchema,
  jobIdParamsSchema,
  listCanonicalRolesSchema,
  listJobFactsSchema,
  listJobProfilesSchema,
  pipelineTaskParamsSchema,
  runPipelineSchema,
} from "./jobs-intelligence.schemas.js";
import type { JobsIntelligenceService } from "./jobs-intelligence.service.js";

/**
 * 文件作用：暴露岗位智能处理域的 V2 API。
 * 设计边界：路由层只做参数校验与协议转换，不承载业务逻辑。
 */
export function createJobsIntelligenceRouter(service: JobsIntelligenceService): Router {
  const router = Router();

  router.post("/jobs/pipeline/run", async (req, res, next) => {
    const parsed = runPipelineSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "流水线启动参数不合法", parsed.error.flatten()));
    }

    try {
      return res.status(202).json(await service.runPipeline(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/jobs/pipeline/tasks/:task_id", async (req, res, next) => {
    const parsed = pipelineTaskParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "任务查询参数不合法", parsed.error.flatten()));
    }

    try {
      return res.json(await service.getPipelineTask(parsed.data.task_id));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/job-profiles", async (req, res, next) => {
    const parsed = listJobProfilesSchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "岗位画像查询参数不合法", parsed.error.flatten()));
    }

    try {
      return res.json(await service.listJobProfiles(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/canonical-roles", async (req, res, next) => {
    const parsed = listCanonicalRolesSchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "标准岗位查询参数不合法", parsed.error.flatten()));
    }

    try {
      return res.json(await service.listCanonicalRoles(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/canonical-roles/:role_key", async (req, res, next) => {
    const parsed = canonicalRoleParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "标准岗位参数不合法", parsed.error.flatten()));
    }

    try {
      return res.json(await service.getCanonicalRole(parsed.data.role_key));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/job-facts", async (req, res, next) => {
    const parsed = listJobFactsSchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "岗位事实查询参数不合法", parsed.error.flatten()));
    }

    try {
      return res.json(await service.listJobFacts(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/job-facts/:job_id", async (req, res, next) => {
    const parsed = jobIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "岗位参数不合法", parsed.error.flatten()));
    }

    try {
      return res.json(await service.getJobFact(parsed.data.job_id));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/job-profiles/:job_id", async (req, res, next) => {
    const parsed = jobIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "岗位参数不合法", parsed.error.flatten()));
    }

    try {
      return res.json(await service.getJobProfile(parsed.data.job_id));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/career-paths/jobs/:job_id", async (req, res, next) => {
    const paramsParsed = jobIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "岗位参数不合法", paramsParsed.error.flatten()));
    }

    const queryParsed = careerPathQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "图谱查询参数不合法", queryParsed.error.flatten()));
    }

    try {
      return res.json(await service.getCareerPathGraph(paramsParsed.data.job_id, queryParsed.data.depth));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
