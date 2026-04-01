import type { RouteRecordRaw } from "vue-router";

import DashboardPage from "./pages/DashboardPage.vue";

export const dashboardRoutes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "dashboard-home",
    component: DashboardPage,
  },
];
