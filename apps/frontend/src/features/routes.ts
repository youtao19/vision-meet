import type { RouteRecordRaw } from "vue-router";

import { dashboardRoutes } from "@/features/dashboard/routes";
import { matchingRoutes } from "@/features/matching/routes";
import { profileRoutes } from "@/features/profile/routes";

export const featureRoutes: RouteRecordRaw[] = [
  ...dashboardRoutes,
  ...profileRoutes,
  ...matchingRoutes,
];
