import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import { createPolishSchema } from "./polish.schemas.js";
import type { PolishService } from "./polish.service.js";

export function createPolishRouter(service: PolishService): Router {
  const router = Router();

  router.post("", async (req, res, next) => {
    const parsed = createPolishSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new HttpError(400, "POLISH_INPUT_INVALID", "润色参数不合法", parsed.error.flatten()),
      );
    }

    try {
      const traceId = (res.locals.trace_id as string | undefined) || "";
      const result = await service.polishText(parsed.data, { traceId });
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
