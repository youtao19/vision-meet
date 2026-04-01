import type { RouteRecordRaw } from "vue-router";

import { dashboardRoutes } from "@/features/dashboard/routes";
import { profileRoutes } from "@/features/profile/routes";

export const featureRoutes: RouteRecordRaw[] = [...dashboardRoutes, ...profileRoutes];
