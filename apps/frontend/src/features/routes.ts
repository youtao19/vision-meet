import type { RouteRecordRaw } from "vue-router";

import { agentRoutes } from "@/features/agent/routes";
import { careerPathRoutes } from "@/features/career-path/routes";
import { dataPipelineRoutes } from "@/features/data-pipeline/routes";
import { dashboardRoutes } from "@/features/dashboard/routes";
import { jobProfileRoutes } from "@/features/job-profiles/routes";
import { matchingRoutes } from "@/features/matching/routes";
import { profileRoutes } from "@/features/profile/routes";
import { reportRoutes } from "@/features/report/routes";

export const featureRoutes: RouteRecordRaw[] = [
  ...dashboardRoutes,
  ...dataPipelineRoutes,
  ...jobProfileRoutes,
  ...agentRoutes,
  ...careerPathRoutes,
  ...profileRoutes,
  ...matchingRoutes,
  ...reportRoutes,
];
