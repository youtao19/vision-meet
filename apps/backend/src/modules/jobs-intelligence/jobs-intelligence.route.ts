import { Router } from "express";

import type { JobsIntelligenceService } from "./jobs-intelligence.service.js";

/**
 * 文件作用：暴露岗位智能处理域的 V2 API。
 * 设计边界：路由层只做参数校验与协议转换，不承载业务逻辑。
 * 当前只保留人工岗位画像路由。
 */
export function createJobsIntelligenceRouter(service: JobsIntelligenceService): Router {
  const router = Router();

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

  router.post("/job-portraits/manual/seed", async (_req, res, next) => {
    try {
      return res.json(await service.seedManualJobPortraits());
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
