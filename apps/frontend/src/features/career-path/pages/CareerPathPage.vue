<script setup lang="ts">
/**
 * 文件作用：展示职业路径中心的双图视图（ECharts 雷达图 + G6 关系图）。
 * 职责边界：
 * 1) 负责页面级查询条件与路由参数同步；
 * 2) 消费后端图谱接口并渲染图数据；
 * 3) 不承载岗位画像生成、入库或构图动作。
 */

import { Graph, type IEvent } from "@antv/g6";
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import type {
  CareerPathEdge,
  CareerPathNode,
  CareerRouteRecommendation,
  CareerPathTargetOption,
  CareerPathV2GraphResponse,
  ManualJobPortraitRecord,
  StudentProfileRecord,
} from "@career/contracts/types";
import { RadarChart } from "echarts/charts";
import { LegendComponent, TooltipComponent } from "echarts/components";
import { init, use, type ECharts } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

import { fetchCareerPathGraph, fetchCareerPathTargets } from "@/shared/api/career-path";
import { ApiRequestError } from "@/shared/api/http";
import { fetchManualJobPortraits } from "@/shared/api/job-profiles";
import { fetchStudentProfiles } from "@/shared/api/profile";
import {
  profileCertificateNames,
  profileDimensionScores,
  profileExperienceCount,
  profileName,
  profileTargetRole,
} from "@/features/profile/model/profile-selectors";

use([CanvasRenderer, RadarChart, TooltipComponent, LegendComponent]);

const route = useRoute();
const router = useRouter();

const manualPortraits = ref<ManualJobPortraitRecord[]>([]);
const graphTargets = ref<CareerPathTargetOption[]>([]);
const profiles = ref<StudentProfileRecord[]>([]);
const graphResult = ref<CareerPathV2GraphResponse | null>(null);

const radarRef = ref<HTMLDivElement | null>(null);
const g6Ref = ref<HTMLDivElement | null>(null);

const selectedNodeId = ref("");
const selectedEdgeId = ref("");
const chartTab = ref<"graph" | "radar">("graph");
const insightTab = ref<"detail" | "routes">("detail");

const loading = reactive({
  bootstrap: false,
  graph: false,
});

const form = reactive({
  jobId: "",
  studentProfileId: "",
  depth: 1,
});

const uiState = reactive({
  error: "",
});

const canLoadGraph = computed(() => {
  return toPositiveInt(form.jobId) !== undefined && !loading.graph;
});

let radarInstance: ECharts | null = null;
let g6Graph: Graph | null = null;

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

function clampLevel(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function toPercentByLevel(level: number): number {
  return clampLevel(level) * 20;
}

function toPercentByTextLevel(value: string): number {
  if (value.includes("极高")) return 100;
  if (value.includes("高")) return 80;
  if (value.includes("中")) return 60;
  if (value.includes("低")) return 40;
  return 60;
}

function calculateExperienceLevel(profile: StudentProfileRecord): number {
  const total =
    profileExperienceCount(profile, "internship") * 1.5 +
    profileExperienceCount(profile, "project") * 1.2 +
    profileExperienceCount(profile, "competition") * 0.8;
  if (total >= 8) return 5;
  if (total >= 5) return 4;
  if (total >= 3) return 3;
  if (total >= 1) return 2;
  return 1;
}

function calculateCertificationLevel(profile: StudentProfileRecord): number {
  const count = profileCertificateNames(profile).length;
  if (count >= 4) return 5;
  if (count >= 3) return 4;
  if (count >= 2) return 3;
  if (count >= 1) return 2;
  return 1;
}

function calculateSkillLevel(profile: StudentProfileRecord): number {
  return clampLevel(Math.max(1, profileDimensionScores(profile).professional_skills / 20));
}

const selectedJobPortrait = computed(() => {
  const jobId = toPositiveInt(form.jobId);
  if (!jobId) return null;
  const selectedTarget = graphTargets.value.find((item) => item.job_id === jobId);
  return (
    manualPortraits.value.find((item) => item.job_id === jobId) ??
    manualPortraits.value.find((item) => item.job_name === selectedTarget?.job_name) ??
    null
  );
});

const selectedProfile = computed(() => {
  const profileId = toPositiveInt(form.studentProfileId);
  if (!profileId) return null;
  return profiles.value.find((item) => item.id === profileId) ?? null;
});

const radarComparison = computed(() => {
  if (!selectedJobPortrait.value) {
    return null;
  }
  const detail = selectedJobPortrait.value.profile_detail;

  const target = {
    技能: Math.min(100, Math.max(40, detail.skills.length * 10)),
    抗压: toPercentByTextLevel(detail.stressResistance),
    学习: toPercentByTextLevel(detail.learningAbility),
    经验: toPercentByTextLevel(detail.internshipAbility),
    创新: toPercentByTextLevel(detail.innovationAbility),
    证书: Math.min(100, Math.max(40, detail.certificates.length * 25)),
    沟通: toPercentByTextLevel(detail.communicationAbility),
  };

  if (!selectedProfile.value) {
    return {
      target,
      student: null,
      matchScore: null,
    };
  }

  const studentLevel = {
    技能: calculateSkillLevel(selectedProfile.value),
    抗压: selectedProfile.value.self_assessment.stress_tolerance,
    学习: selectedProfile.value.self_assessment.learning,
    经验: calculateExperienceLevel(selectedProfile.value),
    创新: selectedProfile.value.self_assessment.innovation,
    证书: calculateCertificationLevel(selectedProfile.value),
    沟通: selectedProfile.value.self_assessment.communication,
  };

  const student = {
    技能: toPercentByLevel(studentLevel.技能),
    抗压: toPercentByLevel(studentLevel.抗压),
    学习: toPercentByLevel(studentLevel.学习),
    经验: toPercentByLevel(studentLevel.经验),
    创新: toPercentByLevel(studentLevel.创新),
    证书: toPercentByLevel(studentLevel.证书),
    沟通: toPercentByLevel(studentLevel.沟通),
  };

  const keys = Object.keys(target) as Array<keyof typeof target>;
  const avgGap =
    keys.reduce((sum, key) => sum + Math.abs(target[key] - student[key]), 0) / keys.length;
  const matchScore = Math.max(0, Math.min(100, Math.round(100 - avgGap)));

  return { target, student, matchScore };
});

const targetJobOptions = computed(() => {
  return graphTargets.value.map((item) => ({
    ...item,
    option_key: `graph-${item.job_id}`,
  }));
});

const selectedNode = computed(() => {
  return graphResult.value?.nodes.find((node) => node.id === selectedNodeId.value) ?? null;
});

const selectedEdge = computed(() => {
  return graphResult.value?.edges.find((edge) => edge.id === selectedEdgeId.value) ?? null;
});

const focusedGraph = computed(() => {
  return graphResult.value ? buildFocusedGraph(graphResult.value) : null;
});

const graphMetrics = computed(() => {
  if (!graphResult.value || !focusedGraph.value) {
    return [];
  }
  return [
    { label: "展示节点", value: focusedGraph.value.nodes.length },
    { label: "展示关系", value: focusedGraph.value.edges.length },
    { label: "原始节点", value: graphResult.value.nodes.length },
    { label: "原始关系", value: graphResult.value.edges.length },
  ];
});

const graphLegendItems = [
  { label: "目标岗位", tone: "target" },
  { label: "晋升路径", tone: "promotion" },
  { label: "换岗路径", tone: "transition" },
] as const;

const selectedNodeEdges = computed(() => {
  if (!focusedGraph.value || !selectedNodeId.value) {
    return [];
  }
  return focusedGraph.value.edges.filter(
    (edge) => edge.source === selectedNodeId.value || edge.target === selectedNodeId.value,
  );
});

function getNodeTitleById(nodeId: string): string {
  if (!graphResult.value) {
    return nodeId;
  }
  const matched = graphResult.value.nodes.find((node) => node.id === nodeId);
  return matched?.title ?? nodeId;
}

function buildRadarOption() {
  const comparison = radarComparison.value;
  if (!comparison) {
    return null;
  }
  const indicators = [
    { name: "技能", max: 100 },
    { name: "抗压", max: 100 },
    { name: "学习", max: 100 },
    { name: "经验", max: 100 },
    { name: "创新", max: 100 },
    { name: "证书", max: 100 },
    { name: "沟通", max: 100 },
  ];

  const targetValues = indicators.map(
    (item) => comparison.target[item.name as keyof typeof comparison.target],
  );
  const studentValues = comparison.student
    ? indicators.map(
        (item) => comparison.student?.[item.name as keyof typeof comparison.student] ?? 0,
      )
    : [];

  return {
    tooltip: { trigger: "item" },
    legend: {
      data: comparison.student ? ["岗位要求", "学生现状"] : ["岗位要求"],
      textStyle: { color: "#334155" },
    },
    radar: {
      indicator: indicators,
      radius: 96,
      splitNumber: 5,
      splitArea: { areaStyle: { color: ["#f8fafc", "#eef2ff"] } },
    },
    series: [
      {
        type: "radar",
        data: [
          {
            value: targetValues,
            name: "岗位要求",
            areaStyle: { opacity: 0.24 },
            lineStyle: { width: 2 },
          },
          ...(comparison.student
            ? [
                {
                  value: studentValues,
                  name: "学生现状",
                  areaStyle: { opacity: 0.2 },
                  lineStyle: { width: 2 },
                },
              ]
            : []),
        ],
      },
    ],
  };
}

function nodeColorByCategory(category: CareerPathNode["category"]): string {
  if (category === "target") return "#0f766e";
  if (category === "promotion") return "#1d4ed8";
  return "#ea580c";
}

function nodeStrokeByCategory(category: CareerPathNode["category"]): string {
  if (category === "target") return "#14b8a6";
  if (category === "promotion") return "#60a5fa";
  return "#fb923c";
}

function edgeColorByType(relationType: CareerPathEdge["relation_type"]): string {
  return relationType === "promotion" ? "#1d4ed8" : "#ea580c";
}

function collectRouteEdgeIds(routes: CareerRouteRecommendation[]): Set<string> {
  const ids = new Set<string>();
  for (const route of routes) {
    for (const edgeId of route.route_id.split("__")) {
      if (edgeId) {
        ids.add(edgeId);
      }
    }
  }
  return ids;
}

function buildFocusedGraph(result: CareerPathV2GraphResponse): {
  nodes: CareerPathNode[];
  edges: CareerPathEdge[];
} {
  const routeEdgeIds = collectRouteEdgeIds([
    ...result.promotion_routes.slice(0, 1),
    ...result.transition_routes.slice(0, 5),
  ]);
  const routeEdges = result.edges.filter((edge) => routeEdgeIds.has(edge.id));
  const fallbackEdges = result.edges
    .filter((edge) => edge.source === result.target_node_id)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
  const edges = routeEdges.length > 0 ? routeEdges : fallbackEdges;
  const visibleNodeIds = new Set<string>([result.target_node_id]);
  for (const edge of edges) {
    visibleNodeIds.add(edge.source);
    visibleNodeIds.add(edge.target);
  }

  return {
    nodes: result.nodes.filter((node) => visibleNodeIds.has(node.id)),
    edges,
  };
}

function isEdgeConnectedToSelectedNode(edge: CareerPathEdge): boolean {
  return Boolean(
    selectedNodeId.value &&
    (edge.source === selectedNodeId.value || edge.target === selectedNodeId.value),
  );
}

function pickEventTargetId(event: IEvent): string {
  if (!("target" in event) || !event.target || typeof event.target !== "object") {
    return "";
  }
  const maybeId = (event.target as { id?: unknown }).id;
  return typeof maybeId === "string" ? maybeId : "";
}

async function renderG6Graph(result: CareerPathV2GraphResponse): Promise<void> {
  if (!g6Ref.value) {
    return;
  }

  const displayGraph = buildFocusedGraph(result);
  const width = Math.max(300, g6Ref.value.clientWidth);
  const height = Math.max(360, g6Ref.value.clientHeight || 560);

  if (!g6Graph) {
    g6Graph = new Graph({
      container: g6Ref.value,
      width,
      height,
      autoFit: "view",
      layout: {
        type: "dagre",
        rankdir: "LR",
        nodesep: 56,
        ranksep: 96,
      },
      node: {
        type: "circle",
        style: {
          size: 44,
          labelFill: "#0f172a",
          labelFontSize: 12,
          labelPlacement: "bottom",
          lineWidth: 2,
          stroke: "#ffffff",
        },
      },
      edge: {
        type: "line",
        style: {
          endArrow: true,
          lineWidth: 2,
        },
      },
      behaviors: ["drag-canvas", "zoom-canvas", "drag-element"],
    });

    g6Graph.on("node:click", (event: IEvent) => {
      const nodeId = pickEventTargetId(event);
      if (!nodeId) return;
      selectedNodeId.value = nodeId;
      selectedEdgeId.value = "";
    });
    g6Graph.on("edge:click", (event: IEvent) => {
      const edgeId = pickEventTargetId(event);
      if (!edgeId) return;
      selectedEdgeId.value = edgeId;
      const edge = graphResult.value?.edges.find((item) => item.id === edgeId);
      if (edge) {
        selectedNodeId.value = edge.target;
      }
    });
    g6Graph.on("canvas:click", () => {
      selectedEdgeId.value = "";
    });
  } else {
    g6Graph.setSize(width, height);
  }

  g6Graph.setData({
    nodes: displayGraph.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      relation_type: node.category,
      style: {
        size: node.id === result.target_node_id ? 56 : 44,
        labelText: node.title,
        labelFontWeight: node.id === selectedNodeId.value ? 700 : 500,
        labelMaxWidth: 120,
        fill: nodeColorByCategory(node.category),
        stroke: node.id === selectedNodeId.value ? "#0f172a" : nodeStrokeByCategory(node.category),
        lineWidth: node.id === selectedNodeId.value ? 4 : 2,
        shadowColor:
          node.id === selectedNodeId.value ? "rgba(15, 23, 42, 0.24)" : "rgba(15, 23, 42, 0.1)",
        shadowBlur: node.id === selectedNodeId.value ? 18 : 8,
      },
    })),
    edges: displayGraph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relation_type: edge.relation_type,
      direction_label: edge.direction_label,
      style: {
        lineWidth:
          edge.id === selectedEdgeId.value || isEdgeConnectedToSelectedNode(edge)
            ? 4
            : edge.relation_type === "promotion"
              ? 2.8
              : 2,
        lineDash: edge.relation_type === "promotion" ? [] : [5, 4],
        stroke: edge.id === selectedEdgeId.value ? "#0f172a" : edgeColorByType(edge.relation_type),
        opacity:
          selectedEdgeId.value || selectedNodeId.value
            ? edge.id === selectedEdgeId.value || isEdgeConnectedToSelectedNode(edge)
              ? 1
              : 0.34
            : 0.86,
      },
    })),
  });
  await g6Graph.render();
}

function renderRadarChart(): void {
  if (!radarRef.value) {
    return;
  }
  const option = buildRadarOption();
  if (!option) {
    return;
  }
  if (!radarInstance) {
    radarInstance = init(radarRef.value);
  }
  radarInstance.setOption(option);
  radarInstance.resize();
}

async function bootstrap(): Promise<void> {
  loading.bootstrap = true;
  uiState.error = "";
  try {
    const [manualResponse, targetResponse, profileResponse] = await Promise.all([
      fetchManualJobPortraits(),
      fetchCareerPathTargets(),
      fetchStudentProfiles(),
    ]);
    manualPortraits.value = manualResponse.items;
    graphTargets.value = targetResponse.items;
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
    const result = await fetchCareerPathGraph({
      job_id: jobId,
      student_profile_id: toPositiveInt(form.studentProfileId),
      depth: form.depth,
    });
    graphResult.value = result;
    selectedNodeId.value = result.target_node_id;
    selectedEdgeId.value = "";
    await nextTick();
    if (chartTab.value === "graph") {
      await renderG6Graph(result);
    } else {
      renderRadarChart();
    }
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
      ...(toPositiveInt(form.studentProfileId)
        ? { student_profile_id: String(form.studentProfileId) }
        : {}),
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
      ? Math.max(1, Math.min(3, Number(route.query.depth) || 1))
      : 1;

  form.jobId = jobId ? String(jobId) : "";
  form.studentProfileId = studentProfileId ? String(studentProfileId) : "";
  form.depth = depth;

  if (jobId) {
    await loadGraph();
  } else if (chartTab.value === "radar") {
    renderRadarChart();
  }
}

function handleResize(): void {
  radarInstance?.resize();
  g6Graph?.resize();
}

watch(
  () => route.query,
  async () => {
    await syncFromQuery();
  },
);

watch([selectedJobPortrait, selectedProfile], async () => {
  if (chartTab.value !== "radar") {
    return;
  }
  await nextTick();
  renderRadarChart();
});

watch(chartTab, async (tab) => {
  if (tab === "graph" && graphResult.value) {
    await nextTick();
    await renderG6Graph(graphResult.value);
  }
  if (tab === "radar") {
    await nextTick();
    renderRadarChart();
  }
});

watch([selectedNodeId, selectedEdgeId], async () => {
  if (chartTab.value !== "graph" || !graphResult.value) {
    return;
  }
  await nextTick();
  await renderG6Graph(graphResult.value);
});

onMounted(async () => {
  await bootstrap();
  await syncFromQuery();
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  radarInstance?.dispose();
  radarInstance = null;
  g6Graph?.destroy();
  g6Graph = null;
});
</script>

<template>
  <section class="career-path-page">
    <header class="page-header">
      <div>
        <h2>职业路径图谱</h2>
        <p>当前页面仅保留图谱查询与展示能力，默认读取数据库中的预置路径图谱。</p>
      </div>
      <div class="nav-links">
        <RouterLink class="nav-link" to="/matching">匹配分析</RouterLink>
        <RouterLink class="nav-link" to="/report">职业报告</RouterLink>
      </div>
    </header>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>

    <section class="panel">
      <h3>查询与数据操作</h3>
      <div class="toolbar">
        <label>
          目标岗位
          <select v-model="form.jobId" :disabled="loading.bootstrap || loading.graph">
            <option value="">请选择</option>
            <option
              v-for="option in targetJobOptions"
              :key="option.option_key"
              :value="String(option.job_id)"
            >
              #{{ option.job_id }} {{ option.job_name }}（{{ option.category }}）
            </option>
          </select>
        </label>

        <label>
          学生画像（可选）
          <select v-model="form.studentProfileId" :disabled="loading.bootstrap || loading.graph">
            <option value="">仅看岗位要求</option>
            <option v-for="profile in profiles" :key="profile.id" :value="String(profile.id)">
              #{{ profile.id }} {{ profileName(profile) }}（{{
                profileTargetRole(profile) || "暂未选择目标岗位"
              }}）
            </option>
          </select>
        </label>

        <label>
          图谱深度
          <select v-model.number="form.depth" :disabled="loading.graph">
            <option :value="1">直接路径</option>
            <option :value="2">扩展 2 层</option>
            <option :value="3">扩展 3 层</option>
          </select>
        </label>

        <button class="primary-btn" :disabled="!canLoadGraph" @click="searchGraph">
          {{ loading.graph ? "加载中..." : "加载图谱" }}
        </button>
      </div>
    </section>

    <section class="panel graph-panel">
      <div class="panel-title-row">
        <div>
          <h3>可视化视图</h3>
          <p v-if="graphResult" class="muted">
            展示节点 {{ focusedGraph?.nodes.length ?? 0 }} · 展示边
            {{ focusedGraph?.edges.length ?? 0 }} · 版本
            {{ graphResult.graph_version }}
          </p>
        </div>
        <div class="tab-switch">
          <button
            class="tab-btn"
            :class="{ active: chartTab === 'graph' }"
            type="button"
            @click="chartTab = 'graph'"
          >
            G6 图谱
          </button>
          <button
            class="tab-btn"
            :class="{ active: chartTab === 'radar' }"
            type="button"
            @click="chartTab = 'radar'"
          >
            雷达图
          </button>
        </div>
      </div>

      <div v-if="graphResult" class="graph-summary" aria-label="图谱摘要">
        <div v-for="item in graphMetrics" :key="item.label" class="summary-pill">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </div>

      <div v-show="chartTab === 'graph'">
        <div v-if="graphResult" class="graph-workspace">
          <div class="graph-stage">
            <div class="graph-stage-bar">
              <div class="graph-legend" aria-label="图谱图例">
                <span v-for="item in graphLegendItems" :key="item.label" class="legend-item">
                  <i :class="['legend-dot', `legend-dot-${item.tone}`]"></i>
                  {{ item.label }}
                </span>
              </div>
              <span class="graph-help">点击节点或关系查看右侧详情</span>
            </div>
            <div ref="g6Ref" class="graph-canvas"></div>
          </div>

          <aside class="graph-inspector" aria-label="图谱检查面板">
            <div class="inspector-section">
              <p class="section-eyebrow">当前节点</p>
              <template v-if="selectedNode">
                <h4>{{ selectedNode.title }}</h4>
                <p>{{ selectedNode.description }}</p>
                <div class="inspector-tags">
                  <span>{{ selectedNode.category }}</span>
                  <span>{{ selectedNode.family }}</span>
                  <span>层级 {{ selectedNode.level }}</span>
                </div>
              </template>
              <p v-else class="muted">点击图中的节点后查看岗位摘要。</p>
            </div>

            <div class="inspector-section">
              <p class="section-eyebrow">相关关系</p>
              <button
                v-for="edge in selectedNodeEdges"
                :key="edge.id"
                type="button"
                class="edge-mini-card"
                :class="{ active: selectedEdgeId === edge.id }"
                @click="selectedEdgeId = edge.id"
              >
                <span
                  >{{ getNodeTitleById(edge.source) }} → {{ getNodeTitleById(edge.target) }}</span
                >
                <strong>{{ edge.direction_label }} · {{ edge.score }} 分</strong>
              </button>
              <p v-if="selectedNodeEdges.length === 0" class="muted">
                暂无与当前节点相连的展示关系。
              </p>
            </div>

            <div v-if="selectedEdge" class="inspector-section edge-summary">
              <p class="section-eyebrow">选中关系</p>
              <h4>{{ selectedEdge.direction_label }}</h4>
              <p>{{ selectedEdge.reason }}</p>
              <dl class="edge-facts">
                <div>
                  <dt>迁移成本</dt>
                  <dd>{{ selectedEdge.transition_cost }}</dd>
                </div>
                <div>
                  <dt>待补齐</dt>
                  <dd>{{ selectedEdge.gap_skills.join("、") || "暂无" }}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
        <p v-if="graphResult && focusedGraph?.edges.length === 0" class="muted empty-hint">
          当前没有可用关系边，请确认该岗位已完成路径图谱构建。
        </p>
        <p v-if="!graphResult" class="empty-text">请选择岗位并加载图谱后查看 G6 关系图。</p>
      </div>

      <div v-show="chartTab === 'radar'">
        <p class="muted radar-score" v-if="radarComparison?.matchScore !== null">
          综合匹配度：{{ radarComparison?.matchScore }} 分
        </p>
        <div ref="radarRef" class="radar-canvas"></div>
      </div>
    </section>

    <section v-if="graphResult" class="panel">
      <div class="panel-title-row">
        <h3>分析洞察</h3>
        <div class="tab-switch">
          <button
            class="tab-btn"
            :class="{ active: insightTab === 'detail' }"
            type="button"
            @click="insightTab = 'detail'"
          >
            节点关系详情
          </button>
          <button
            class="tab-btn"
            :class="{ active: insightTab === 'routes' }"
            type="button"
            @click="insightTab = 'routes'"
          >
            路径推荐
          </button>
        </div>
      </div>

      <div v-if="insightTab === 'detail'" class="panel-stack">
        <div class="detail-filters">
          <label>
            节点
            <select v-model="selectedNodeId">
              <option value="">请选择节点</option>
              <option v-for="node in focusedGraph?.nodes ?? []" :key="node.id" :value="node.id">
                {{ node.title }}（{{ node.category }}）
              </option>
            </select>
          </label>

          <label>
            关系
            <select v-model="selectedEdgeId">
              <option value="">请选择关系</option>
              <option v-for="edge in focusedGraph?.edges ?? []" :key="edge.id" :value="edge.id">
                {{ getNodeTitleById(edge.source) }} → {{ getNodeTitleById(edge.target) }}（{{
                  edge.direction_label
                }}）
              </option>
            </select>
          </label>
        </div>

        <div v-if="selectedNode" class="detail-card">
          <p class="detail-tag">{{ selectedNode.category }}</p>
          <h4>{{ selectedNode.title }}</h4>
          <p>{{ selectedNode.description }}</p>
          <p>岗位族：{{ selectedNode.family }} · 层级 {{ selectedNode.level }}</p>
          <p>核心技能：{{ selectedNode.typical_skills.join("、") || "暂无" }}</p>
        </div>

        <div v-if="selectedEdge" class="detail-card edge-card">
          <p class="detail-tag">{{ selectedEdge.direction_label }}</p>
          <h4>
            {{ getNodeTitleById(selectedEdge.source) }} →
            {{ getNodeTitleById(selectedEdge.target) }}
          </h4>
          <p>{{ selectedEdge.reason }}</p>
          <p>关键迁移技能：{{ selectedEdge.required_skills.join("、") || "暂无" }}</p>
          <p>待补齐技能：{{ selectedEdge.gap_skills.join("、") || "暂无" }}</p>
          <p>迁移成本：{{ selectedEdge.transition_cost }} · 关系分值：{{ selectedEdge.score }}</p>
        </div>
      </div>

      <div v-else class="route-columns">
        <section class="route-lane promotion-lane">
          <h4>晋升主线</h4>
          <article
            v-for="item in graphResult.promotion_routes.slice(0, 1)"
            :key="item.route_id"
            class="route-card"
          >
            <header>
              <strong>{{ item.title }}</strong>
              <span class="route-score">{{ item.suitability_score }} 分</span>
            </header>
            <p>{{ item.summary }}</p>
          </article>
          <p v-if="graphResult.promotion_routes.length === 0" class="muted">暂无晋升路径。</p>
        </section>

        <section class="route-lane transition-lane">
          <h4>换岗候选</h4>
          <article
            v-for="item in graphResult.transition_routes.slice(0, 5)"
            :key="item.route_id"
            class="route-card transition-card"
          >
            <header>
              <strong>{{ item.title }}</strong>
              <span class="route-score">{{ item.suitability_score }} 分</span>
            </header>
            <p>{{ item.summary }}</p>
          </article>
          <p v-if="graphResult.transition_routes.length === 0" class="muted">暂无换岗路径。</p>
        </section>
      </div>
    </section>
  </section>
</template>

<style scoped>
.career-path-page {
  --page-panel: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.26));
  --page-panel-strong: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.84),
    rgba(225, 244, 255, 0.34)
  );
  max-width: 1320px;
  margin: 24px auto;
  display: grid;
  gap: 18px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.page-header h2 {
  margin: 0;
  color: var(--glass-title);
  font-size: 32px;
  letter-spacing: -0.03em;
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
}

.page-header p {
  margin: 10px 0 0;
  color: var(--glass-muted);
  line-height: 1.8;
}

.nav-links {
  display: flex;
  gap: 10px;
}

.nav-link {
  color: var(--glass-primary);
  text-decoration: none;
}

.notice {
  margin: 0;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.56);
  backdrop-filter: blur(18px);
}

.notice-error {
  background: linear-gradient(135deg, rgba(255, 232, 236, 0.82), rgba(255, 244, 245, 0.52));
  color: #8c2343;
}

.panel {
  padding: 20px;
  border: 1px solid var(--glass-border);
  border-radius: 24px;
  background: var(--page-panel);
  backdrop-filter: blur(24px) saturate(175%);
  -webkit-backdrop-filter: blur(24px) saturate(175%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 18px 36px rgba(44, 73, 127, 0.1);
}

.toolbar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
}

label {
  display: grid;
  gap: 8px;
  min-width: 0;
  color: rgba(28, 48, 82, 0.84);
  font-weight: 600;
}

select {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.64);
  border-radius: 16px;
  padding: 10px 12px;
  font-size: 14px;
  color: #16304e;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.34));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.76),
    0 10px 22px rgba(61, 90, 152, 0.06);
}

.primary-btn {
  min-width: 0;
  border-radius: 16px;
  padding: 10px 14px;
  cursor: pointer;
  font-weight: 700;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease;
  border: 1px solid transparent;
  background: linear-gradient(135deg, rgba(73, 182, 223, 0.92), rgba(64, 105, 236, 0.92));
  color: #fff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 16px 28px rgba(45, 99, 203, 0.22);
}

.primary-btn:hover {
  transform: translateY(-1px);
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.panel-stack {
  display: grid;
  gap: 12px;
}

.panel-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.muted {
  color: rgba(56, 80, 116, 0.72);
  font-size: 13px;
  margin: 0;
}

.radar-canvas {
  width: 100%;
  height: 420px;
}

.graph-panel {
  min-height: 420px;
}

.graph-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0 0;
}

.summary-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 46px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.42);
  color: rgba(37, 55, 88, 0.72);
  font-size: 12px;
}

.summary-pill strong {
  color: var(--glass-title);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.graph-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 14px;
  margin-top: 12px;
  align-items: stretch;
}

.graph-stage {
  min-width: 0;
  border-radius: 20px;
  background:
    radial-gradient(circle at top left, rgba(111, 209, 255, 0.16), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.7) 0%, rgba(233, 244, 255, 0.48) 100%);
  border: 1px solid rgba(255, 255, 255, 0.56);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.74);
  overflow: hidden;
}

.graph-stage-bar {
  min-height: 52px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(31, 58, 97, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.graph-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(37, 55, 88, 0.76);
  font-size: 12px;
  font-weight: 700;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.62);
}

.legend-dot-target {
  background: #0f766e;
}

.legend-dot-promotion {
  background: #1d4ed8;
}

.legend-dot-transition {
  background: #ea580c;
}

.graph-help {
  color: rgba(56, 80, 116, 0.62);
  font-size: 12px;
  white-space: nowrap;
}

.graph-canvas {
  width: 100%;
  height: 560px;
  background:
    linear-gradient(rgba(31, 58, 97, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(31, 58, 97, 0.045) 1px, transparent 1px);
  background-size: 28px 28px;
}

.graph-inspector {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
}

.inspector-section {
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.5);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.section-eyebrow {
  margin: 0 0 8px;
  color: rgba(37, 55, 88, 0.58);
  font-size: 12px;
  font-weight: 800;
}

.inspector-section h4 {
  margin: 0 0 8px;
  color: var(--glass-title);
  font-size: 16px;
}

.inspector-section p {
  margin: 0;
  color: rgba(37, 55, 88, 0.74);
  line-height: 1.65;
}

.inspector-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.inspector-tags span {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.72);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.edge-mini-card {
  width: 100%;
  display: grid;
  gap: 5px;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.48);
  color: rgba(37, 55, 88, 0.76);
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--glass-transition),
    background var(--glass-transition),
    transform var(--glass-transition);
}

.edge-mini-card:hover,
.edge-mini-card.active {
  transform: translateY(-1px);
  border-color: rgba(29, 78, 216, 0.36);
  background: rgba(239, 246, 255, 0.82);
}

.edge-mini-card span {
  font-size: 12px;
  line-height: 1.45;
}

.edge-mini-card strong {
  color: var(--glass-title);
  font-size: 13px;
}

.edge-summary {
  border-color: rgba(234, 88, 12, 0.24);
}

.edge-facts {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
}

.edge-facts div {
  display: grid;
  gap: 3px;
}

.edge-facts dt {
  color: rgba(37, 55, 88, 0.58);
  font-size: 12px;
  font-weight: 700;
}

.edge-facts dd {
  margin: 0;
  color: rgba(17, 35, 63, 0.9);
  line-height: 1.55;
}

.tab-switch {
  display: inline-flex;
  gap: 8px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.32);
}

.tab-btn {
  border: none;
  background: transparent;
  color: #475569;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.tab-btn.active {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(227, 243, 255, 0.4));
  color: var(--glass-title);
  box-shadow: 0 10px 20px rgba(53, 92, 161, 0.1);
}

.radar-score {
  margin: 0 0 8px;
}

.empty-hint {
  margin-top: 8px;
}

.detail-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.detail-card {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 18px;
  background: var(--page-panel-strong);
  border: 1px solid rgba(255, 255, 255, 0.56);
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
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 18px;
  background: var(--page-panel-strong);
  margin-bottom: 10px;
}

.route-card header {
  display: flex;
  justify-content: space-between;
}

.route-columns {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 14px;
}

.route-lane {
  min-width: 0;
}

.route-lane h4 {
  margin: 0 0 10px;
  color: var(--glass-title);
}

.route-score {
  color: #0f766e;
  font-weight: 600;
}

.empty-text {
  color: rgba(56, 80, 116, 0.74);
}

@media (max-width: 1180px) {
  .toolbar {
    grid-template-columns: 1fr 1fr;
  }

  .graph-workspace {
    grid-template-columns: 1fr;
  }

  .graph-inspector {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .page-header,
  .panel-title-row {
    flex-direction: column;
  }

  .nav-links {
    flex-wrap: wrap;
  }

  .layout {
    grid-template-columns: 1fr;
  }
  .toolbar {
    grid-template-columns: 1fr;
  }

  .detail-filters,
  .route-columns {
    grid-template-columns: 1fr;
  }

  .graph-summary,
  .graph-inspector {
    grid-template-columns: 1fr;
  }

  .graph-stage-bar {
    align-items: flex-start;
    flex-direction: column;
  }

  .graph-help {
    white-space: normal;
  }

  .graph-canvas {
    height: 480px;
  }
}
</style>
