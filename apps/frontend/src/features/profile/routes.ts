import type { RouteRecordRaw } from "vue-router";

import ProfilePage from "./pages/ProfilePage.vue";

export const profileRoutes: RouteRecordRaw[] = [
  {
    path: "/profile",
    name: "profile-home",
    component: ProfilePage,
  },
];
