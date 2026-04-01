import { z } from "zod";

export const createStudentProfileSchema = z.object({
  name: z.string().trim().min(1),
  target_role: z.string().trim().min(1),
  education_level: z.string().trim().min(1).optional(),
  major: z.string().trim().min(1).optional(),
  graduation_year: z.coerce.number().int().min(2000).max(2100).optional(),
  skills: z.array(z.string().trim().min(1)).min(1),
  certificates: z.array(z.string().trim().min(1)).default([]),
  experience: z
    .object({
      internship_count: z.coerce.number().int().min(0).optional(),
      project_count: z.coerce.number().int().min(0).optional(),
      competition_count: z.coerce.number().int().min(0).optional(),
    })
    .optional(),
  self_assessment: z
    .object({
      communication: z.coerce.number().int().min(1).max(5).optional(),
      learning: z.coerce.number().int().min(1).max(5).optional(),
      stress_tolerance: z.coerce.number().int().min(1).max(5).optional(),
      innovation: z.coerce.number().int().min(1).max(5).optional(),
    })
    .optional(),
  personal_summary: z.string().trim().max(1000).optional(),
});
