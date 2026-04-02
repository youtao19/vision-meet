import type { RouteRecordRaw } from "vue-router";

import ReportPage from "./pages/ReportPage.vue";

export const reportRoutes: RouteRecordRaw[] = [
  {
    path: "/report",
    name: "report-home",
    component: ReportPage,
  },
];
