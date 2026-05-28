import { Router } from "express";

import type { JobPortraitsService } from "./job-portraits.service.js";

export function createJobPortraitsRouter(service: JobPortraitsService): Router {
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
