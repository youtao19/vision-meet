import { randomUUID } from "node:crypto";

import cors from "cors";
import express from "express";

import { createJobsModule } from "./modules/jobs/jobs.module.js";
import { createJsonJobsRepository } from "./modules/jobs/jobs.repository.json.js";
import { createKnowledgeModule } from "./modules/knowledge/knowledge.module.js";
import { createMatchingModule } from "./modules/matching/matching.module.js";
import { createProfileModule } from "./modules/profile/profile.module.js";
import {
  createReportExportDownloadModule,
  createReportModule,
} from "./modules/report/report.module.js";
import { appEnv } from "./shared/config/env.js";
import { HttpError } from "./shared/errors/http-error.js";

export function createApp(): express.Express {
  const app = express();
  const healthRepository = createJsonJobsRepository(appEnv.DATA_STORE_PATH);
  const knowledgeModule = createKnowledgeModule({
    host: appEnv.PGHOST,
    port: appEnv.PGPORT,
    database: appEnv.PGDATABASE,
    user: appEnv.PGUSER,
    password: appEnv.PGPASSWORD,
    vectorDim: appEnv.PGVECTOR_DIM,
    defaultTopK: appEnv.KNOWLEDGE_TOP_K,
    reindexBatchSize: appEnv.KNOWLEDGE_REINDEX_BATCH_SIZE,
  });

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use((req, res, next) => {
    // 在每次请求中透传或补齐 trace_id，便于前后端统一排障。
    const incomingTraceId = req.header("x-trace-id");
    const traceId = incomingTraceId && incomingTraceId.trim() ? incomingTraceId : randomUUID();
    res.locals.trace_id = traceId;
    res.setHeader("x-trace-id", traceId);
    next();
  });

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
      onResumeProfileCreated: ({ profile, resumeInput }) =>
        knowledgeModule.service.indexResumeProfile({ profile, resumeInput }),
    }),
  );
  app.use("/api/v1/knowledge", knowledgeModule.router);
  app.use(
    "/api/v1/matches",
    createMatchingModule({
      dataStorePath: appEnv.DATA_STORE_PATH,
      profileStorePath: appEnv.PROFILE_STORE_PATH,
      matchStorePath: appEnv.MATCH_STORE_PATH,
      scoringVersion: appEnv.MATCH_SCORING_VERSION,
    }),
  );
  app.use(
    "/api/v1/reports",
    createReportModule({
      dataStorePath: appEnv.DATA_STORE_PATH,
      profileStorePath: appEnv.PROFILE_STORE_PATH,
      matchStorePath: appEnv.MATCH_STORE_PATH,
      reportStorePath: appEnv.REPORT_STORE_PATH,
      reportExportDir: appEnv.REPORT_EXPORT_DIR,
      reportExportStorePath: appEnv.REPORT_EXPORT_STORE_PATH,
    }),
  );
  app.use(
    "/api/v1/report-exports",
    createReportExportDownloadModule({
      dataStorePath: appEnv.DATA_STORE_PATH,
      profileStorePath: appEnv.PROFILE_STORE_PATH,
      matchStorePath: appEnv.MATCH_STORE_PATH,
      reportStorePath: appEnv.REPORT_STORE_PATH,
      reportExportDir: appEnv.REPORT_EXPORT_DIR,
      reportExportStorePath: appEnv.REPORT_EXPORT_STORE_PATH,
    }),
  );

  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const traceId = (res.locals.trace_id as string | undefined) || randomUUID();
      if (error instanceof HttpError) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
          detail: error.detail,
          trace_id: traceId,
        });
      }

      const message = error instanceof Error ? error.message : "internal error";
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        message,
        trace_id: traceId,
      });
    },
  );

  return app;
}
