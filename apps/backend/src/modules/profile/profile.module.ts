import type { Router } from "express";

import { createJsonProfileRepository } from "./profile.repository.json.js";
import { createProfileRouter } from "./profile.route.js";
import { createProfileService } from "./profile.service.js";

export type ProfileModuleOptions = {
  profileStorePath?: string;
};

export function createProfileModule(options: ProfileModuleOptions = {}): Router {
  const repository = createJsonProfileRepository(options.profileStorePath);
  const service = createProfileService(repository);
  return createProfileRouter(service);
}
