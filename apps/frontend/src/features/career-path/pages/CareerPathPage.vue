<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import {
  type CareerPathEdge,
  type CareerPathGraphResponse,
  type CareerPathNode,
  type CareerRouteRecommendation,
  type JobRecord,
  type StudentProfileRecord,
} from "@career/contracts/types";
import { GraphChart } from "echarts/charts";
import { LegendComponent, TooltipComponent } from "echarts/components";
import { init, use, type ECharts } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

import { fetchCareerPathGraph } from "@/shared/api/career-path";
import { ApiRequestError } from "@/shared/api/http";
import { fetchJobs } from "@/shared/api/jobs";
import { fetchStudentProfiles } from "@/shared/api/profile";

use([CanvasRenderer, GraphChart, TooltipComponent, LegendComponent]);

const route = useRoute();
const router = useRouter();

const jobs = ref<JobRecord[]>([]);
const profiles = ref<StudentProfileRecord[]>([]);
const graphResult = ref<CareerPathGraphResponse | null>(null);
const chartRef = ref<HTMLDivElement | null>(null);
const selectedNodeId = ref("");
const selectedEdgeId = ref("");

const loading = reactive({
  bootstrap: false,
  graph: false,
});

const form = reactive({
  jobId: "",
  studentProfileId: "",
  depth: 2,
});

const uiState = reactive({
  error: "",
});

let chartInstance: ECharts | null = null;

function formatApiError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.traceId ? `${error.message}（trace_id: ${error.traceId}）` : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "请求失败，请稍后重试";
}

function toPositiveInt(raw: string): number | undefined {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function getNodeColor(category: CareerPathNode["category"]): string {
  if (category === "target") {
    return "#0f766e";
  }
  if (category === "promotion") {
    return "#1d4ed8";
  }
  return "#ea580c";
}

function getEdgeColor(edge: CareerPathEdge): string {
  return edge.relation_type === "promotion" ? "#1d4ed8" : "#ea580c";
}

function buildGraphOption(result: CareerPathGraphResponse) {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      formatter: (params: { dataType?: string; data?: { value?: string }; name?: string }) => {
        if (params.dataType === "edge") {
          return `${params.data?.value ?? ""}`;
        }

        return `${params.name}`;
      },
    },
    legend: {
      top: 8,
      textStyle: {
        color: "#334155",
      },
      data: ["目标岗位", "晋升岗位", "转岗岗位"],
    },
    series: [
      {
        type: "graph",
        layout: "force",
        roam: true,
        draggable: true,
        edgeSymbol: ["none", "arrow"],
        edgeSymbolSize: 10,
        force: {
          repulsion: 420,
          edgeLength: [120, 190],
          gravity: 0.08,
        },
        categories: [
          { name: "目标岗位" },
          { name: "晋升岗位" },
          { name: "转岗岗位" },
        ],
        data: result.nodes.map((node) => ({
          id: node.id,
          name: node.title,
          value: node.level,
          category:
            node.category === "target"
              ? 0
              : node.category === "promotion"
                ? 1
                : 2,
          symbolSize: node.is_target ? 66 : node.category === "promotion" ? 54 : 48,
          label: {
            show: true,
            color: "#0f172a",
            fontSize: 12,
          },
          itemStyle: {
            color: getNodeColor(node.category),
            borderColor: "#ffffff",
            borderWidth: 2,
            shadowBlur: 18,
            shadowColor: "rgba(15, 23, 42, 0.14)",
          },
        })),
        links: result.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          value: edge.direction_label,
          lineStyle: {
            color: getEdgeColor(edge),
            width: edge.relation_type === "promotion" ? 3 : 2,
            type: edge.relation_type === "promotion" ? "solid" : "dashed",
            opacity: 0.9,
          },
          label: {
            show: true,
            formatter: edge.direction_label,
            color: "#475569",
            fontSize: 11,
          },
        })),
      },
    ],
  };
}

async function bootstrap(): Promise<void> {
  loading.bootstrap = true;
  uiState.error = "";

  try {
    const [jobResponse, profileResponse] = await Promise.all([fetchJobs(100), fetchStudentProfiles()]);
    jobs.value = jobResponse.items;
    profiles.value = profileResponse.items;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.bootstrap = false;
  }
}

async function loadGraph(): Promise<void> {
  const jobId = toPositiveInt(form.jobId);
  if (!jobId) {
    uiState.error = "请选择合法的岗位";
    graphResult.value = null;
    return;
  }

  loading.graph = true;
  uiState.error = "";

  try {
    graphResult.value = await fetchCareerPathGraph({
      job_id: jobId,
      student_profile_id: toPositiveInt(form.studentProfileId),
      depth: form.depth,
    });
    selectedNodeId.value = graphResult.value.target_node_id;
    selectedEdgeId.value = "";
    await nextTick();
    renderChart();
  } catch (error) {
    graphResult.value = null;
    uiState.error = formatApiError(error);
  } finally {
    loading.graph = false;
  }
}

async function searchGraph(): Promise<void> {
  const jobId = toPositiveInt(form.jobId);
  if (!jobId) {
    uiState.error = "请选择合法的岗位";
    return;
  }

  await router.replace({
    path: "/career-paths",
    query: {
      job_id: String(jobId),
      ...(toPositiveInt(form.studentProfileId) ? { student_profile_id: form.studentProfileId } : {}),
      depth: String(form.depth),
    },
  });
}

async function syncFromQuery(): Promise<void> {
  const jobId =
    typeof route.query.job_id === "string" ? toPositiveInt(route.query.job_id) : undefined;
  const studentProfileId =
    typeof route.query.student_profile_id === "string"
      ? toPositiveInt(route.query.student_profile_id)
      : undefined;
  const depth =
    typeof route.query.depth === "string"
      ? Math.max(1, Math.min(3, Number(route.query.depth) || 2))
      : 2;

  form.jobId = jobId ? String(jobId) : "";
  form.studentProfileId = studentProfileId ? String(studentProfileId) : "";
  form.depth = depth;

  if (jobId) {
    await loadGraph();
  }
}

function renderChart(): void {
  if (!chartRef.value || !graphResult.value) {
    return;
  }

  if (!chartInstance) {
    chartInstance = init(chartRef.value);
  }

  chartInstance.setOption(buildGraphOption(graphResult.value));
  chartInstance.off("click");
  chartInstance.on("click", (params) => {
    if (params.dataType === "edge") {
      selectedEdgeId.value = String((params.data as { id?: string } | undefined)?.id || "");
      return;
    }

    selectedNodeId.value = String((params.data as { id?: string } | undefined)?.id || "");
    selectedEdgeId.value = "";
  });
  chartInstance.resize();
}

function handleResize(): void {
  chartInstance?.resize();
}

const selectedNode = computed(() => {
  return graphResult.value?.nodes.find((node) => node.id === selectedNodeId.value) ?? null;
});

const selectedEdge = computed(() => {
  return graphResult.value?.edges.find((edge) => edge.id === selectedEdgeId.value) ?? null;
});

function routeKey(routeItem: CareerRouteRecommendation): string {
  return routeItem.route_id;
}

watch(
  () => route.query,
  async () => {
    await syncFromQuery();
  },
);

onMounted(async () => {
  await bootstrap();
  await syncFromQuery();
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  chartInstance?.dispose();
  chartInstance = null;
});
</script>

<template>
  <section class="career-path-page">
    <header class="page-header">
      <div>
        <h2>职业路径图谱</h2>
        <p>围绕目标岗位查看晋升路径、换岗路径与个性化技能缺口。</p>
      </div>
      <div class="nav-links">
        <RouterLink class="nav-link" to="/matching">匹配分析</RouterLink>
        <RouterLink class="nav-link" to="/report">职业报告</RouterLink>
      </div>
    </header>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>

    <section class="panel">
      <h3>查询条件</h3>
      <div class="toolbar">
        <label>
          目标岗位
          <select v-model="form.jobId" :disabled="loading.bootstrap || loading.graph">
            <option value="">请选择</option>
            <option v-for="job in jobs" :key="job.id" :value="String(job.id)">
              #{{ job.id }} {{ job.title }}
            </option>
          </select>
        </label>

        <label>
          学生画像（可选）
          <select v-model="form.studentProfileId" :disabled="loading.bootstrap || loading.graph">
            <option value="">仅查看通用路径</option>
            <option v-for="profile in profiles" :key="profile.id" :value="String(profile.id)">
              #{{ profile.id }} {{ profile.name }}（{{ profile.target_role }}）
            </option>
          </select>
        </label>

        <label>
          图谱深度
          <select v-model.number="form.depth" :disabled="loading.graph">
            <option :value="1">1 层</option>
            <option :value="2">2 层</option>
            <option :value="3">3 层</option>
          </select>
        </label>

        <button class="primary-btn" :disabled="loading.graph" @click="searchGraph">
          {{ loading.graph ? "加载中..." : "加载图谱" }}
        </button>
      </div>
    </section>

    <section v-if="graphResult" class="layout">
      <section class="panel graph-panel">
        <div class="panel-title-row">
          <div>
            <h3>{{ graphResult.job_title }}</h3>
            <p class="muted">
              规范岗位：{{ graphResult.canonical_role_title }} · 节点 {{ graphResult.nodes.length }} · 边
              {{ graphResult.edges.length }}
            </p>
          </div>
        </div>
        <div ref="chartRef" class="graph-canvas"></div>
      </section>

      <aside class="side-column">
        <section class="panel detail-panel">
          <h3>节点/关系详情</h3>

          <div v-if="selectedNode" class="detail-card">
            <p class="detail-tag">{{ selectedNode.category }}</p>
            <h4>{{ selectedNode.title }}</h4>
            <p>{{ selectedNode.description }}</p>
            <p>岗位族：{{ selectedNode.family }} · 层级 {{ selectedNode.level }}</p>
            <p>核心技能：{{ selectedNode.typical_skills.join("、") || "暂无" }}</p>
          </div>

          <div v-if="selectedEdge" class="detail-card edge-card">
            <p class="detail-tag">{{ selectedEdge.direction_label }}</p>
            <h4>{{ selectedEdge.source }} -> {{ selectedEdge.target }}</h4>
            <p>{{ selectedEdge.reason }}</p>
            <p>关键迁移技能：{{ selectedEdge.required_skills.join("、") || "暂无" }}</p>
            <p>迁移成本：{{ selectedEdge.transition_cost }}</p>
          </div>

          <p v-if="!selectedNode && !selectedEdge" class="empty-text">点击图谱节点或连线后查看详情。</p>
        </section>

        <section class="panel">
          <h3>晋升路径</h3>
          <article v-for="item in graphResult.promotion_routes" :key="routeKey(item)" class="route-card">
            <header>
              <strong>{{ item.title }}</strong>
              <span class="route-score">{{ item.suitability_score }} 分</span>
            </header>
            <p>{{ item.summary }}</p>
            <p class="muted">缺口技能：{{ item.missing_skills.join("、") || "当前已具备主要能力" }}</p>
            <ol class="route-steps">
              <li v-for="step in item.steps" :key="`${item.route_id}-${step.node_id}`">
                {{ step.title }}
                <span v-if="step.required_skills.length > 0"> · 关键技能：{{ step.required_skills.join("、") }}</span>
              </li>
            </ol>
          </article>
          <p v-if="graphResult.promotion_routes.length === 0" class="empty-text">当前暂无可展示的晋升路径。</p>
        </section>

        <section class="panel">
          <h3>换岗路径</h3>
          <article
            v-for="item in graphResult.transition_routes"
            :key="routeKey(item)"
            class="route-card transition-card"
          >
            <header>
              <strong>{{ item.title }}</strong>
              <span class="route-score">{{ item.suitability_score }} 分</span>
            </header>
            <p>{{ item.summary }}</p>
            <p class="muted">缺口技能：{{ item.missing_skills.join("、") || "当前已具备主要能力" }}</p>
            <ol class="route-steps">
              <li v-for="step in item.steps" :key="`${item.route_id}-${step.node_id}`">
                {{ step.title }}
                <span v-if="step.required_skills.length > 0"> · 关键技能：{{ step.required_skills.join("、") }}</span>
              </li>
            </ol>
          </article>
          <p v-if="graphResult.transition_routes.length === 0" class="empty-text">当前暂无可展示的换岗路径。</p>
        </section>
      </aside>
    </section>

    <section v-else class="panel">
      <p class="empty-text">请选择岗位并加载图谱。若岗位未被首批规范岗位覆盖，接口会返回明确提示。</p>
    </section>
  </section>
</template>

<style scoped>
.career-path-page {
  max-width: 1320px;
  margin: 24px auto;
  display: grid;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.page-header h2 {
  margin: 0;
  color: #0f172a;
}

.page-header p {
  margin: 8px 0 0;
  color: #475569;
}

.nav-links {
  display: flex;
  gap: 10px;
}

.nav-link {
  color: #0f766e;
  text-decoration: none;
}

.notice {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
}

.notice-error {
  background: #fee2e2;
  color: #991b1b;
}

.panel {
  padding: 16px;
  border: 1px solid #dbe4f0;
  border-radius: 14px;
  background: #ffffff;
}

.toolbar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
}

label {
  display: grid;
  gap: 6px;
  color: #334155;
}

select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
}

.primary-btn {
  border: 1px solid #0f766e;
  border-radius: 8px;
  padding: 8px 12px;
  background: #0f766e;
  color: #ffffff;
  cursor: pointer;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(360px, 0.9fr);
  gap: 16px;
}

.graph-panel {
  min-height: 640px;
}

.panel-title-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.muted {
  color: #64748b;
  font-size: 13px;
}

.graph-canvas {
  width: 100%;
  height: 560px;
  margin-top: 12px;
  border-radius: 12px;
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, 0.08), transparent 35%),
    linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
}

.side-column {
  display: grid;
  gap: 16px;
}

.detail-card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: #f8fafc;
}

.detail-card h4,
.route-card header strong {
  margin: 0;
  color: #0f172a;
}

.detail-card p,
.route-card p {
  margin: 0;
  color: #334155;
}

.detail-tag {
  display: inline-flex;
  width: fit-content;
  padding: 2px 10px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
}

.edge-card .detail-tag {
  background: #ffedd5;
  color: #c2410c;
}

.route-card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid #dbe4f0;
  border-radius: 12px;
  background: #f8fafc;
}

.route-card header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.route-score {
  color: #0f766e;
  font-weight: 600;
}

.route-steps {
  margin: 0;
  padding-left: 18px;
  color: #334155;
}

.empty-text {
  margin: 0;
  color: #64748b;
}

@media (max-width: 1080px) {
  .toolbar {
    grid-template-columns: 1fr 1fr;
  }

  .layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .page-header {
    flex-direction: column;
  }

  .toolbar {
    grid-template-columns: 1fr;
  }

  .graph-canvas {
    height: 440px;
  }
}
</style>
