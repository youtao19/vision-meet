import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
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
});

export type AppEnv = z.infer<typeof envSchema>;

export const appEnv: AppEnv = envSchema.parse(process.env);
