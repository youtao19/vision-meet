import type { RouteRecordRaw } from "vue-router";

import { careerPathRoutes } from "@/features/career-path/routes";
import { dataPipelineRoutes } from "@/features/data-pipeline/routes";
import { dashboardRoutes } from "@/features/dashboard/routes";
import { jobProfilesRoutes } from "@/features/job-profiles/routes";
import { matchingRoutes } from "@/features/matching/routes";
import { profileRoutes } from "@/features/profile/routes";
import { reportRoutes } from "@/features/report/routes";

export const featureRoutes: RouteRecordRaw[] = [
  ...dashboardRoutes,
  ...dataPipelineRoutes,
  ...jobProfilesRoutes,
  ...careerPathRoutes,
  ...profileRoutes,
  ...matchingRoutes,
  ...reportRoutes,
];
