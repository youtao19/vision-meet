import type { RouteRecordRaw } from "vue-router";

import ProfilePage from "./pages/ProfilePage.vue";
import ResumeBuilderPage from "./pages/ResumeBuilderPage.vue";

export const profileRoutes: RouteRecordRaw[] = [
  {
    path: "/profile",
    name: "profile-home",
    component: ProfilePage,
  },
  {
    path: "/resume-builder",
    name: "resume-builder",
    component: ResumeBuilderPage,
  },
];
