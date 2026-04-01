import { z } from "zod";

export const listJobsQuerySchema = z.object({
  keyword: z.string().optional(),
  industry: z.string().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const generateProfileSchema = z.object({
  job_id: z.number().int().positive(),
  force_regenerate: z.boolean().default(false),
});

export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
export type GenerateProfileInput = z.infer<typeof generateProfileSchema>;
