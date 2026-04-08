import type { RouteRecordRaw } from "vue-router";

import DataPipelinePage from "./pages/DataPipelinePage.vue";

export const dataPipelineRoutes: RouteRecordRaw[] = [
  {
    path: "/pipeline",
    name: "data-pipeline",
    component: DataPipelinePage,
  },
];
