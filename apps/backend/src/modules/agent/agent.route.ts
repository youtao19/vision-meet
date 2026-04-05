import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import { agentTaskCreateSchema, agentTaskIdParamsSchema } from "./agent.schemas.js";
import type { AgentService } from "./agent.service.js";

/**
 * 文件作用：暴露任务型 agent 的 HTTP 入口。
 * 设计边界：route 只负责协议适配与参数校验，任务规划和工具执行一律下沉到 service。
 */
export function createAgentRouter(service: AgentService): Router {
  const router = Router();

  async function handleCreateTask(req: Request, res: Response, next: NextFunction) {
    const parsed = agentTaskCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new HttpError(
          400,
          "AGENT_TASK_INPUT_INVALID",
          "Agent 任务参数不合法",
          parsed.error.flatten(),
        ),
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

  // 兼容更早的聊天式入口，让旧前端 / 调试脚本直接复用当前任务型 Agent。
  router.post("/chat", handleCreateTask);

  // 兼容旧入口，避免前端或外部调试脚本在本轮重构中立即断裂。
  router.post("/analyze", handleCreateTask);

  router.get("/tasks/:task_id", async (req, res, next) => {
    const parsed = agentTaskIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(
        new HttpError(400, "AGENT_TASK_ID_INVALID", "Agent 任务标识不合法", parsed.error.flatten()),
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
