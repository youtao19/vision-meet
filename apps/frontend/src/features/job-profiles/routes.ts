import type { RouteRecordRaw } from "vue-router";

import JobProfilesPage from "./pages/JobProfilesPage.vue";

export const jobProfileRoutes: RouteRecordRaw[] = [
  {
    path: "/job-profiles",
    name: "job-profiles",
    component: JobProfilesPage,
  },
];
