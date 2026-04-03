import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import { aiTaskCreateSchema, aiTaskIdParamsSchema } from "./ai.schemas.js";
import type { AiService } from "./ai.service.js";

/**
 * 文件作用：暴露 AI 中枢统一 HTTP 入口。
 * 设计边界：route 只负责协议适配、参数校验与兼容路径映射，任务执行和工具编排全部下沉到 service。
 */
export function createAiRouter(service: AiService): Router {
  const router = Router();

  async function handleCreateTask(req: Request, res: Response, next: NextFunction) {
    const parsed = aiTaskCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new HttpError(400, "AI_TASK_INPUT_INVALID", "AI 任务参数不合法", parsed.error.flatten()),
      );
    }

    try {
      const traceId = (res.locals.trace_id as string | undefined) || "";
      const result = await service.createTask(parsed.data, {
        traceId,
      });
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  }

  router.post("/tasks", handleCreateTask);

  // 为前端和外部调用方保留“聊天式发起任务”的兼容语义，但底层仍统一走任务型入口。
  router.post("/chat", handleCreateTask);

  router.get("/tasks/:task_id", async (req, res, next) => {
    const parsed = aiTaskIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(
        new HttpError(400, "AI_TASK_ID_INVALID", "AI 任务标识不合法", parsed.error.flatten()),
      );
    }

    try {
      const result = await service.getTask(parsed.data.task_id);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
