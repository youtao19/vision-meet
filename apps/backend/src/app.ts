import cors from "cors";
import express from "express";

import { createJobsModule } from "./modules/jobs/jobs.module.js";
import { createJsonJobsRepository } from "./modules/jobs/jobs.repository.json.js";
import { createProfileModule } from "./modules/profile/profile.module.js";
import { appEnv } from "./shared/config/env.js";

export function createApp(): express.Express {
  const app = express();
  const healthRepository = createJsonJobsRepository(appEnv.DATA_STORE_PATH);

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      env: appEnv.APP_ENV,
      store: healthRepository.getStorePath(),
    });
  });

  app.use(
    "/api/v1/jobs",
    createJobsModule({
      dataStorePath: appEnv.DATA_STORE_PATH,
    }),
  );
  app.use(
    "/api/v1/profile",
    createProfileModule({
      profileStorePath: appEnv.PROFILE_STORE_PATH,
    }),
  );

  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const message = error instanceof Error ? error.message : "internal error";
      res.status(500).json({ detail: message });
    },
  );

  return app;
}
