import { randomUUID } from "node:crypto";

import cors from "cors";
import express from "express";

import { createAiModule } from "./modules/ai/ai.module.js";
import { createJobsModule } from "./modules/jobs/jobs.module.js";
import { createPgJobsRepository } from "./modules/jobs/jobs.repository.pg.js";
import { createJobsIntelligenceModule } from "./modules/jobs-intelligence/jobs-intelligence.module.js";
import { createNeo4jJobsIntelligenceGraphRepository } from "./modules/jobs-intelligence/jobs-intelligence.repository.neo4j.js";
import { createPgJobsIntelligenceRepository } from "./modules/jobs-intelligence/jobs-intelligence.repository.pg.js";
import { createJobsIntelligenceService } from "./modules/jobs-intelligence/jobs-intelligence.service.js";
import { createKnowledgeModule } from "./modules/knowledge/knowledge.module.js";
import { createMatchingRouter } from "./modules/matching/matching.route.js";
import { createPgMatchingRepository } from "./modules/matching/matching.repository.pg.js";
import { createMatchingServiceFromDependencies } from "./modules/matching/matching.module.js";
import { createProfileModule } from "./modules/profile/profile.module.js";
import { createPgProfileRepository } from "./modules/profile/profile.repository.pg.js";
import { createPgReportExportRepository } from "./modules/report/report-export.repository.pg.js";
import {
  createReportExportDownloadRouter,
  createReportRouter,
} from "./modules/report/report.route.js";
import { createPgReportRepository } from "./modules/report/report.repository.pg.js";
import { createReportServiceFromDependencies } from "./modules/report/report.module.js";
import { appEnv } from "./shared/config/env.js";
import { createAppPgPool, formatPgConnectionLabel } from "./shared/db/postgres.js";
import { HttpError } from "./shared/errors/http-error.js";

export function createApp(): express.Express {
  const app = express();
  const appDataPool = createAppPgPool({
    host: appEnv.PGHOST,
    port: appEnv.PGPORT,
    database: appEnv.PGDATABASE,
    user: appEnv.PGUSER,
    password: appEnv.PGPASSWORD,
  });
  const jobsRepository = createPgJobsRepository(appDataPool);
  const profileRepository = createPgProfileRepository(appDataPool);
  const matchingRepository = createPgMatchingRepository(appDataPool);
  const reportRepository = createPgReportRepository(appDataPool);
  const reportExportRepository = createPgReportExportRepository(appDataPool);
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
  const jobsIntelligenceService = createJobsIntelligenceService(
    createPgJobsIntelligenceRepository(appDataPool),
    createNeo4jJobsIntelligenceGraphRepository({
      uri: appEnv.NEO4J_URI,
      username: appEnv.NEO4J_USERNAME,
      password: appEnv.NEO4J_PASSWORD,
    }),
    appEnv,
  );
  const matchingService = createMatchingServiceFromDependencies(
    {
      matchingRepository,
      profileRepository,
      jobsRepository,
      careerPathResolver: async ({ job_id, depth }) => {
        const graph = await jobsIntelligenceService.getCareerPathGraph(job_id, depth);
        return {
          promotion_routes: graph.promotion_routes,
          transition_routes: graph.transition_routes,
        };
      },
    },
    {
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
      careerPathResolver: async ({ job_id }) => {
        try {
          const graph = await jobsIntelligenceService.getCareerPathGraph(job_id, 2);
          return {
            depth: graph.depth,
            canonical_role_title: null,
            promotion_routes: graph.promotion_routes,
            transition_routes: graph.transition_routes,
          };
        } catch {
          return null;
        }
      },
    },
    {
      reportExportDir: appEnv.REPORT_EXPORT_DIR,
    },
  );

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use("/assets/job-comics", express.static(appEnv.JOB_COMIC_OUTPUT_DIR));
  app.use((req, res, next) => {
    // 在每次请求中透传或补齐 trace_id，便于前后端统一排障。
    const incomingTraceId = req.header("x-trace-id");
    const traceId = incomingTraceId && incomingTraceId.trim() ? incomingTraceId : randomUUID();
    res.locals.trace_id = traceId;
    res.setHeader("x-trace-id", traceId);
    next();
  });

  app.get("/healthz", async (_req, res, next) => {
    try {
      await appDataPool.query("SELECT 1");
      res.json({
        status: "ok",
        env: appEnv.APP_ENV,
        database: formatPgConnectionLabel({
          host: appEnv.PGHOST,
          port: appEnv.PGPORT,
          database: appEnv.PGDATABASE,
          user: appEnv.PGUSER,
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  app.use(
    "/api/v2/jobs",
    createJobsModule({
      pool: appDataPool,
    }),
  );
  app.use(
    "/api/v2/profile",
    createProfileModule({
      pool: appDataPool,
      env: appEnv,
      cwd: process.cwd(),
      jobsRepository,
      onResumeProfileCreated: ({ profile, resumeInput }) =>
        knowledgeModule.service.indexResumeProfile({ profile, resumeInput }),
    }),
  );
  app.use("/api/v2/knowledge", knowledgeModule.router);
  app.use(
    "/api/v2",
    createJobsIntelligenceModule({
      pool: appDataPool,
      neo4j: {
        uri: appEnv.NEO4J_URI,
        username: appEnv.NEO4J_USERNAME,
        password: appEnv.NEO4J_PASSWORD,
      },
      env: appEnv,
    }),
  );
  app.use("/api/v2/matches", createMatchingRouter(matchingService));
  app.use("/api/v2/reports", createReportRouter(reportService));
  app.use("/api/v2/report-exports", createReportExportDownloadRouter(reportService));
  app.use(
    "/api/v2/ai",
    createAiModule(
      {
        profileRepository,
        jobsRepository,
        knowledgeService: knowledgeModule.service,
        matchingService,
        reportService,
      },
      {
        pool: appDataPool,
        piAgentDir: appEnv.AGENT_PI_DIR,
        sessionStoreDir: appEnv.AGENT_SESSION_STORE_DIR,
        model: appEnv.AGENT_MODEL,
        thinkingLevel: appEnv.AGENT_THINKING_LEVEL,
        resumeTimeoutMs: appEnv.AGENT_RESUME_TIMEOUT_MS,
        cwd: process.cwd(),
      },
    ),
  );
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const traceId = (res.locals.trace_id as string | undefined) || randomUUID();
      const message = error instanceof Error ? error.message : "internal error";
      // 统一打印错误日志，避免出现“前端报错但后端没有任何输出”的排障盲区。
      console.error(`[http-error] trace_id=${traceId} message=${message}`);

      if (error instanceof HttpError) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
          detail: error.detail,
          trace_id: traceId,
        });
      }

      return res.status(500).json({
        code: "INTERNAL_ERROR",
        message,
        trace_id: traceId,
      });
    },
  );

  return app;
}
