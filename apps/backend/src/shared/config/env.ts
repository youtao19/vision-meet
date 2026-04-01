import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.string().default("dev"),
  PORT: z.coerce.number().int().positive().default(8000),
  DATA_STORE_PATH: z.string().optional(),
  PROFILE_STORE_PATH: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export const appEnv: AppEnv = envSchema.parse(process.env);
