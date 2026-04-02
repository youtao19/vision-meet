import type { RouteRecordRaw } from "vue-router";

import AgentPage from "./pages/AgentPage.vue";

export const agentRoutes: RouteRecordRaw[] = [
  {
    path: "/agent",
    name: "agent-home",
    component: AgentPage,
  },
];
