import type { RouteRecordRaw } from "vue-router";

import CareerPathPage from "./pages/CareerPathPage.vue";

export const careerPathRoutes: RouteRecordRaw[] = [
  {
    path: "/career-paths",
    name: "career-path-home",
    component: CareerPathPage,
  },
];
