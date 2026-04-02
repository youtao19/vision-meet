import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { z } from "zod";

const envFileCandidates = [
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
  path.resolve(process.cwd(), ".env"),
];

for (const envFile of envFileCandidates) {
  dotenv.config({ path: envFile, override: false });
}

const rawEnvSchema = z.object({
  APP_ENV: z.string().default("dev"),
  PORT: z.coerce.number().int().positive().default(8000),
  REPORT_EXPORT_DIR: z.string().optional(),
  MATCH_SCORING_VERSION: z.string().trim().min(1).default("v1"),
  PGHOST: z.string().default("127.0.0.1"),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGDATABASE: z.string().trim().min(1).default("career_agent"),
  PGUSER: z.string().trim().min(1).default("career"),
  PGPASSWORD: z.string().default("career_dev_password"),
  PGVECTOR_DIM: z.coerce.number().int().min(8).max(4096).default(32),
  KNOWLEDGE_TOP_K: z.coerce.number().int().min(1).max(50).default(5),
  KNOWLEDGE_REINDEX_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(20),
  MOONSHOT_BASE_URL: z.string().trim().url().optional(),
  MOONSHOT_API_KEY: z.string().trim().min(1).optional(),
  MOONSHOT_MODEL: z.string().trim().min(1).optional(),
  KIMI_BASE_URL: z.string().trim().url().optional(),
  KIMI_API_KEY: z.string().trim().min(1).optional(),
  KIMI_MODEL: z.string().trim().min(1).optional(),
  AGENT_PI_DIR: z.string().optional(),
  AGENT_SESSION_STORE_DIR: z.string().optional(),
  AGENT_MODEL: z.string().trim().min(1).optional(),
  AGENT_THINKING_LEVEL: z
    .enum(["off", "minimal", "low", "medium", "high", "xhigh"])
    .default("medium"),
});

const envSchema = rawEnvSchema.transform((env) => {
  return {
    ...env,
    AGENT_PI_DIR: env.AGENT_PI_DIR || path.join(os.homedir(), ".career-agent", "pi-agent"),
    AGENT_SESSION_STORE_DIR:
      env.AGENT_SESSION_STORE_DIR ||
      path.join(env.AGENT_PI_DIR || path.join(os.homedir(), ".career-agent", "pi-agent"), "sessions"),
    AGENT_MODEL: env.AGENT_MODEL || env.MOONSHOT_MODEL || env.KIMI_MODEL,
  };
});

export type AppEnv = z.infer<typeof envSchema>;

export const appEnv: AppEnv = envSchema.parse(process.env);
