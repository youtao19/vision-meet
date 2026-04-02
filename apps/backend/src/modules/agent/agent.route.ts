import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import { agentAnalyzeSchema } from "./agent.schemas.js";
import type { AgentService } from "./agent.service.js";

/**
 * 文件作用：暴露 Pi Agent 编排入口路由。
 * 设计边界：route 只做协议层转换，编排细节全部下沉到 service。
 */
export function createAgentRouter(service: AgentService): Router {
  const router = Router();

  router.post("/analyze", async (req, res, next) => {
    const parsed = agentAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new HttpError(400, "AGENT_INPUT_INVALID", "Pi Agent 分析参数不合法", parsed.error.flatten()),
      );
    }

    try {
      const traceId = (res.locals.trace_id as string | undefined) || "";
      const result = await service.analyze(parsed.data, {
        traceId,
      });
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
