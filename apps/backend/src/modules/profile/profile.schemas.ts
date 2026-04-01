import { z } from "zod";

export const createStudentProfileSchema = z.object({
  name: z.string().trim().min(1),
  target_role: z.string().trim().min(1),
  skills: z.array(z.string().trim().min(1)).min(1),
});
