import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import {
  canonicalRoleParamsSchema,
  careerPathQuerySchema,
  jobIdParamsSchema,
  listCanonicalRolesSchema,
  listJobFactsSchema,
  pipelineListQuerySchema,
  pipelineRetryProcessSchema,
  pipelineRetryQueueQuerySchema,
  pipelineTaskParamsSchema,
  runPipelineSchema,
} from "./jobs-intelligence.schemas.js";
import type { JobsIntelligenceService } from "./jobs-intelligence.service.js";

function parseLegacyJobLevel(levelBand: string): number {
  const matched = levelBand.match(/\d+/);
  const parsed = matched ? Number(matched[0]) : NaN;
  if (!Number.isFinite(parsed)) {
    return 2;
  }
  return Math.max(1, Math.min(4, parsed));
}

function buildLegacyStableId(roleKey: string): number {
  let hash = 0;
  for (let i = 0; i < roleKey.length; i += 1) {
    hash = (hash * 31 + roleKey.charCodeAt(i)) | 0;
  }
  return Math.abs(hash || 1);
}

function toLegacyJobProfile(item: {
  role_key: string;
  canonical_version: number;
  normalized_title: string;
  job_family: string;
  level_band: string;
  sample_size: number;
  core_required_skills: string[];
  common_required_skills: string[];
  bonus_required_skills: string[];
  core_tools: string[];
  soft_skills: string[];
  representative_responsibilities: string[];
  summary: { role_overview: string };
  confidence: number;
  updated_at: string;
}) {
  const id = buildLegacyStableId(item.role_key);
  const mergedSkills = Array.from(
    new Set([...item.core_required_skills, ...item.common_required_skills]),
  );

  return {
    id,
    job_id: id,
    profile_version: item.canonical_version,
    normalized_title: item.normalized_title,
    job_family: item.job_family,
    job_level: parseLegacyJobLevel(item.level_band),
    professional_skills: mergedSkills,
    certificate_requirements: [],
    innovation_score: Math.min(95, 60 + Math.min(item.sample_size, 20)),
    learning_score: item.soft_skills.includes("学习能力") ? 82 : 70,
    stress_tolerance_score: item.soft_skills.includes("抗压能力") ? 78 : 68,
    communication_score: item.soft_skills.includes("沟通") ? 85 : 72,
    internship_score: 65,
    summary: item.summary?.role_overview || item.representative_responsibilities.join("；") || "",
    confidence: item.confidence,
    generation_model: "canonical_roles_bridge",
    generation_mode: "heuristic" as const,
    extracted_features: {
      role_key: item.role_key,
      level_band: item.level_band,
      bonus_required_skills: item.bonus_required_skills,
      core_tools: item.core_tools,
    },
    created_at: item.updated_at,
  };
}

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

  router.post("/jobs/pipeline/tasks/:task_id/retry", async (req, res, next) => {
    const parsed = pipelineTaskParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "任务查询参数不合法", parsed.error.flatten()));
    }

    try {
      return res.status(202).json(await service.retryPipelineTask(parsed.data.task_id));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/jobs/pipeline/tasks/:task_id/failures", async (req, res, next) => {
    const paramsParsed = pipelineTaskParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "任务查询参数不合法", paramsParsed.error.flatten()));
    }
    const queryParsed = pipelineListQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "分页参数不合法", queryParsed.error.flatten()));
    }

    try {
      return res.json(await service.listPipelineFailures(paramsParsed.data.task_id, queryParsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/jobs/pipeline/retry-queue", async (req, res, next) => {
    const parsed = pipelineRetryQueueQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "重试队列查询参数不合法", parsed.error.flatten()));
    }

    try {
      return res.json(await service.listPipelineRetryQueue(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/jobs/pipeline/retry-queue/process", async (req, res, next) => {
    const parsed = pipelineRetryProcessSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "重试消费参数不合法", parsed.error.flatten()));
    }

    try {
      return res.json(await service.processPipelineRetryQueue(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  /**
   * 兼容说明：历史前端仍会请求 /api/v2/job-profiles。
   * 这里做协议桥接，避免旧页面因接口下线直接 404。
   */
  router.get("/job-profiles", async (req, res, next) => {
    const parsed = listCanonicalRolesSchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "岗位画像查询参数不合法", parsed.error.flatten()));
    }

    try {
      const canonical = await service.listCanonicalRoles(parsed.data);
      return res.json({
        total: canonical.total,
        items: canonical.items.map(toLegacyJobProfile),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/job-portraits/manual", async (_req, res, next) => {
    try {
      const items = await service.listManualJobPortraits();
      return res.json({
        total: items.length,
        items,
      });
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

  return router;
}
