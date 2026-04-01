import { createRouter, createWebHistory } from "vue-router";

import { featureRoutes } from "@/features/routes";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: featureRoutes,
});
