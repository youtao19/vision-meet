import type { RouteRecordRaw } from "vue-router";

import { agentRoutes } from "@/features/agent/routes";
import { dashboardRoutes } from "@/features/dashboard/routes";
import { matchingRoutes } from "@/features/matching/routes";
import { profileRoutes } from "@/features/profile/routes";
import { reportRoutes } from "@/features/report/routes";

export const featureRoutes: RouteRecordRaw[] = [
  ...dashboardRoutes,
  ...agentRoutes,
  ...profileRoutes,
  ...matchingRoutes,
  ...reportRoutes,
];
