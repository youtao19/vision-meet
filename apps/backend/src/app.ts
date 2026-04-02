import { randomUUID } from "node:crypto";

import cors from "cors";
import express from "express";

import { createAgentModule } from "./modules/agent/agent.module.js";
import { createJobsModule } from "./modules/jobs/jobs.module.js";
import { createJsonJobsRepository } from "./modules/jobs/jobs.repository.json.js";
import { createKnowledgeModule } from "./modules/knowledge/knowledge.module.js";
import { createMatchingRouter } from "./modules/matching/matching.route.js";
import { createJsonMatchingRepository } from "./modules/matching/matching.repository.json.js";
import { createMatchingServiceFromDependencies } from "./modules/matching/matching.module.js";
import { createProfileModule } from "./modules/profile/profile.module.js";
import { createJsonProfileRepository } from "./modules/profile/profile.repository.json.js";
import {
  createJsonReportExportRepository,
} from "./modules/report/report-export.repository.json.js";
import { createReportExportDownloadRouter, createReportRouter } from "./modules/report/report.route.js";
import { createJsonReportRepository } from "./modules/report/report.repository.json.js";
import { createReportServiceFromDependencies } from "./modules/report/report.module.js";
import { appEnv } from "./shared/config/env.js";
import { HttpError } from "./shared/errors/http-error.js";
import { createOpenAiCompatibleLlmClient } from "./shared/llm/openai-compatible-llm.client.js";

export function createApp(): express.Express {
  const app = express();
  const healthRepository = createJsonJobsRepository(appEnv.DATA_STORE_PATH);
  const jobsRepository = createJsonJobsRepository(appEnv.DATA_STORE_PATH);
  const profileRepository = createJsonProfileRepository(appEnv.PROFILE_STORE_PATH);
  const matchingRepository = createJsonMatchingRepository(appEnv.MATCH_STORE_PATH);
  const reportRepository = createJsonReportRepository(appEnv.REPORT_STORE_PATH);
  const reportExportRepository = createJsonReportExportRepository(appEnv.REPORT_EXPORT_STORE_PATH);
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
  const llmClient = createOpenAiCompatibleLlmClient({
    baseUrl: appEnv.LLM_BASE_URL,
    apiKey: appEnv.LLM_API_KEY,
    model: appEnv.LLM_MODEL,
    timeoutMs: appEnv.LLM_TIMEOUT_MS,
    temperature: appEnv.LLM_TEMPERATURE,
  });
  const matchingService = createMatchingServiceFromDependencies(
    {
      matchingRepository,
      profileRepository,
      jobsRepository,
    },
    {
      dataStorePath: appEnv.DATA_STORE_PATH,
      profileStorePath: appEnv.PROFILE_STORE_PATH,
      matchStorePath: appEnv.MATCH_STORE_PATH,
      scoringVersion: appEnv.MATCH_SCORING_VERSION,
    },
  );
  const reportService = createReportServiceFromDependencies(
    {
      reportRepository,
      reportExportRepository,
      matchingRepository,
      profileRepository,
      jobsRepository,
      llmClient,
    },
    {
      dataStorePath: appEnv.DATA_STORE_PATH,
      profileStorePath: appEnv.PROFILE_STORE_PATH,
      matchStorePath: appEnv.MATCH_STORE_PATH,
      reportStorePath: appEnv.REPORT_STORE_PATH,
      reportExportDir: appEnv.REPORT_EXPORT_DIR,
      reportExportStorePath: appEnv.REPORT_EXPORT_STORE_PATH,
    },
  );

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
  app.use("/api/v1/matches", createMatchingRouter(matchingService));
  app.use("/api/v1/reports", createReportRouter(reportService));
  app.use("/api/v1/report-exports", createReportExportDownloadRouter(reportService));
  app.use(
    "/api/v1/agent",
    createAgentModule(
      {
        profileRepository,
        jobsRepository,
        knowledgeService: knowledgeModule.service,
        matchingService,
        reportService,
        llmClient,
      },
      {
        runStorePath: appEnv.AGENT_RUN_STORE_PATH,
      },
    ),
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
