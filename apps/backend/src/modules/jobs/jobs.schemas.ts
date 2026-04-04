import { z } from "zod";

export const listJobsQuerySchema = z.object({
  keyword: z.string().optional(),
  industry: z.string().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
