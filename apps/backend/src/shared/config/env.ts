import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { z } from "zod";

const envFileCandidates = [
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
  path.resolve(process.cwd(), ".env"),
];
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

for (const envFile of envFileCandidates) {
  dotenv.config({ path: envFile, override: false });
}

const rawEnvSchema = z.object({
  APP_ENV: z.string().default("dev"),
  PORT: z.coerce.number().int().positive().default(8000),
  REPORT_EXPORT_DIR: z.string().optional(),
  JOB_COMIC_OUTPUT_DIR: z.string().optional(),
  BAOYU_IMAGINE_SCRIPT: z.string().optional(),
  MATCH_SCORING_VERSION: z.string().trim().min(1).default("v1"),
  PGHOST: z.string().default("127.0.0.1"),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGDATABASE: z.string().trim().min(1).default("career_agent"),
  PGUSER: z.string().trim().min(1).default("career"),
  PGPASSWORD: z.string().default("career_dev_password"),
  PGVECTOR_DIM: z.coerce.number().int().min(8).max(4096).default(32),
  NEO4J_URI: z.string().trim().min(1).default("neo4j://127.0.0.1:7687"),
  NEO4J_USERNAME: z.string().trim().min(1).default("neo4j"),
  NEO4J_PASSWORD: z.string().default("career_dev_password"),
  KNOWLEDGE_TOP_K: z.coerce.number().int().min(1).max(50).default(5),
  KNOWLEDGE_REINDEX_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(20),
  MOONSHOT_BASE_URL: z.string().trim().url().optional(),
  MOONSHOT_API_KEY: z.string().trim().min(1).optional(),
  MOONSHOT_MODEL: z.string().trim().min(1).optional(),
  KIMI_BASE_URL: z.string().trim().url().optional(),
  KIMI_API_KEY: z.string().trim().min(1).optional(),
  KIMICODE_API_KEY: z.string().trim().min(1).optional(),
  KIMI_MODEL: z.string().trim().min(1).optional(),
  AGENT_PI_DIR: z.string().optional(),
  AGENT_SESSION_STORE_DIR: z.string().optional(),
  AGENT_MODEL: z.string().trim().min(1).optional(),
  AGENT_THINKING_LEVEL: z
    .enum(["off", "minimal", "low", "medium", "high", "xhigh"])
    .default("medium"),
  AGENT_RESUME_TIMEOUT_MS: z.coerce.number().int().min(10000).max(300000).default(120000),
  JOBS_PIPELINE_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(3),
  JOBS_PIPELINE_RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(8).default(3),
  JOBS_PIPELINE_RETRY_BASE_MS: z.coerce.number().int().min(100).max(10000).default(500),
  JOBS_PIPELINE_RETRY_MAX_MS: z.coerce.number().int().min(500).max(60000).default(8000),
});

const envSchema = rawEnvSchema.transform((env) => {
  return {
    ...env,
    JOB_COMIC_OUTPUT_DIR:
      env.JOB_COMIC_OUTPUT_DIR || path.join(backendRoot, "storage", "job-comics"),
    AGENT_PI_DIR: env.AGENT_PI_DIR || path.join(os.homedir(), ".career-agent", "pi-agent"),
    AGENT_SESSION_STORE_DIR:
      env.AGENT_SESSION_STORE_DIR ||
      path.join(
        env.AGENT_PI_DIR || path.join(os.homedir(), ".career-agent", "pi-agent"),
        "sessions",
      ),
    AGENT_MODEL: env.AGENT_MODEL || env.KIMI_MODEL || env.MOONSHOT_MODEL,
  };
});

export type AppEnv = z.infer<typeof envSchema>;

export const appEnv: AppEnv = envSchema.parse(process.env);
