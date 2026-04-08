import type { RouteRecordRaw } from "vue-router";

import JobProfilesPage from "./pages/JobProfilesPage.vue";

export const jobProfilesRoutes: RouteRecordRaw[] = [
  {
    path: "/job-profiles",
    name: "job-profiles-home",
    component: JobProfilesPage,
  },
];
