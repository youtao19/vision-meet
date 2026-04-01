import { Router } from "express";

import { createStudentProfileSchema } from "./profile.schemas.js";
import type { ProfileService } from "./profile.service.js";

export function createProfileRouter(service: ProfileService): Router {
  const router = Router();

  router.get("", (_req, res) => {
    return res.json(service.listProfiles());
  });

  router.post("", (req, res) => {
    const parsed = createStudentProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ detail: parsed.error.flatten() });
    }

    const created = service.createProfile(parsed.data);
    return res.status(201).json(created);
  });

  return router;
}
