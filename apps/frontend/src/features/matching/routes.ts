import type { RouteRecordRaw } from "vue-router";

import MatchingPage from "./pages/MatchingPage.vue";

export const matchingRoutes: RouteRecordRaw[] = [
  {
    path: "/matching",
    name: "matching-home",
    component: MatchingPage,
  },
];
