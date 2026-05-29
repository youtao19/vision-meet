import { z } from "zod";

export const createPolishSchema = z.object({
  content: z.string().trim().min(5).max(10000),
  section_key: z.string().trim().max(120).optional(),
  section_title: z.string().trim().max(120).optional(),
});
