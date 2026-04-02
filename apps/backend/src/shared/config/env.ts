import path from "node:path";
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
  DATA_STORE_PATH: z.string().optional(),
  PROFILE_STORE_PATH: z.string().optional(),
  MATCH_STORE_PATH: z.string().optional(),
  REPORT_STORE_PATH: z.string().optional(),
  REPORT_EXPORT_DIR: z.string().optional(),
  REPORT_EXPORT_STORE_PATH: z.string().optional(),
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
  LLM_BASE_URL: z.string().trim().url().optional(),
  LLM_API_KEY: z.string().trim().min(1).optional(),
  LLM_MODEL: z.string().trim().min(1).optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
  AGENT_RUN_STORE_PATH: z.string().optional(),
});

const envSchema = rawEnvSchema.transform((env) => {
  const resolvedModel = env.LLM_MODEL || env.MOONSHOT_MODEL || env.KIMI_MODEL;
  const normalizedModel =
    resolvedModel && resolvedModel.startsWith("moonshot/")
      ? resolvedModel.slice("moonshot/".length)
      : resolvedModel;
  const isKimiModel = normalizedModel?.startsWith("kimi-") ?? false;

  return {
    ...env,
    LLM_BASE_URL:
      env.LLM_BASE_URL ||
      env.MOONSHOT_BASE_URL ||
      env.KIMI_BASE_URL ||
      (isKimiModel ? "https://api.moonshot.ai/v1" : undefined),
    LLM_API_KEY: env.LLM_API_KEY || env.MOONSHOT_API_KEY || env.KIMI_API_KEY,
    LLM_MODEL: normalizedModel,
    LLM_TEMPERATURE: env.LLM_TEMPERATURE ?? (isKimiModel ? 1 : 0.2),
  };
});

export type AppEnv = z.infer<typeof envSchema>;

export const appEnv: AppEnv = envSchema.parse(process.env);
