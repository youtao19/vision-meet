import type { Router } from "express";

import { createPolishRouter } from "./polish.route.js";
import { createPolishService } from "./polish.service.js";
import type { PolishServiceDependencies } from "./polish.service.js";

export function createPolishModule(options: PolishServiceDependencies): Router {
  const service = createPolishService(options);
  return createPolishRouter(service);
}
