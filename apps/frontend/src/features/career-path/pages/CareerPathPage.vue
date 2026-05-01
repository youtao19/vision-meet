<script setup lang="ts">
/**
 * 文件作用：展示职业路径中心的双图视图（ECharts 雷达图 + G6 关系图）。
 * 职责边界：
 * 1) 负责页面级查询条件与路由参数同步；
 * 2) 消费后端图谱接口并渲染图数据；
 * 3) 不承载岗位画像生成逻辑，仅触发后端“入库/构图”动作。
 */

import { Graph, type IEvent } from "@antv/g6";
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import type {
  CareerPathEdge,
  CareerPathNode,
  CareerPathV2GraphResponse,
  ManualJobPortraitRecord,
  StudentProfileRecord,
} from "@career/contracts/types";
import { RadarChart } from "echarts/charts";
import { LegendComponent, TooltipComponent } from "echarts/components";
import { init, use, type ECharts } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

import { fetchCareerPathGraph } from "@/shared/api/career-path";
import { ApiRequestError } from "@/shared/api/http";
import { fetchManualJobPortraits } from "@/shared/api/job-profiles";
import { fetchStudentProfiles } from "@/shared/api/profile";

use([CanvasRenderer, RadarChart, TooltipComponent, LegendComponent]);

const route = useRoute();
const router = useRouter();

const manualPortraits = ref<ManualJobPortraitRecord[]>([]);
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
  depth: 2,
});

const PREBUILT_GRAPH_JOB_IDS = [1730415757, 1683349906, 1193271204, 1731015984, 1410409555];

const uiState = reactive({
  error: "",
  success: "",
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

function calculateExperienceLevel(profile: StudentProfileRecord): number {
  const total =
    profile.experience.internship_count * 1.5 +
    profile.experience.project_count * 1.2 +
    profile.experience.competition_count * 0.8;
  if (total >= 8) return 5;
  if (total >= 5) return 4;
  if (total >= 3) return 3;
  if (total >= 1) return 2;
  return 1;
}

function calculateCertificationLevel(profile: StudentProfileRecord): number {
  if (profile.certificates.length >= 4) return 5;
  if (profile.certificates.length >= 3) return 4;
  if (profile.certificates.length >= 2) return 3;
  if (profile.certificates.length >= 1) return 2;
  return 1;
}

function calculateSkillLevel(profile: StudentProfileRecord): number {
  return clampLevel(Math.max(1, profile.dimension_scores.professional_skills / 20));
}

const selectedJobPortrait = computed(() => {
  const jobId = toPositiveInt(form.jobId);
  if (!jobId) return null;
  return manualPortraits.value.find((item) => item.job_id === jobId) ?? null;
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

  const target = {
    技能: toPercentByLevel(selectedJobPortrait.value.skills.level),
    抗压: toPercentByLevel(selectedJobPortrait.value.stress.level),
    学习: toPercentByLevel(selectedJobPortrait.value.learning.level),
    经验: toPercentByLevel(selectedJobPortrait.value.experience.level),
    创新: toPercentByLevel(selectedJobPortrait.value.innovation.level),
    证书: toPercentByLevel(selectedJobPortrait.value.certification.level),
    沟通: toPercentByLevel(selectedJobPortrait.value.communication.level),
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
  return manualPortraits.value.map((item, index) => ({
    job_id: item.job_id as number,
    option_key: `${item.job_name}-${item.category}-${index}`,
    job_name: item.job_name,
    category: item.category,
  }));
});

const selectedNode = computed(() => {
  return graphResult.value?.nodes.find((node) => node.id === selectedNodeId.value) ?? null;
});

const selectedEdge = computed(() => {
  return graphResult.value?.edges.find((edge) => edge.id === selectedEdgeId.value) ?? null;
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

function edgeColorByType(relationType: CareerPathEdge["relation_type"]): string {
  return relationType === "promotion" ? "#1d4ed8" : "#ea580c";
}

function buildGraphPlaceholderNode(jobId: number): CareerPathV2GraphResponse["nodes"][number] {
  return {
    id: `job-${jobId}`,
    job_id: jobId,
    role_key: `job-${jobId}`,
    title: `岗位 #${jobId}`,
    description: "当前图谱关系较少，已展示目标岗位占位节点。",
    family: "unknown",
    level: 1,
    aliases: [],
    typical_skills: [],
    category: "target",
    is_target: true,
  };
}

function resolveFallbackGraphJobId(jobId: number): number {
  if (PREBUILT_GRAPH_JOB_IDS.includes(jobId)) {
    return jobId;
  }
  // 默认回退到 Java 开发岗位图谱，避免出现空白页
  return PREBUILT_GRAPH_JOB_IDS[0] ?? jobId;
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

  const width = Math.max(300, g6Ref.value.clientWidth);
  const height = Math.max(360, g6Ref.value.clientHeight || 560);

  if (!g6Graph) {
    g6Graph = new Graph({
      container: g6Ref.value,
      width,
      height,
      autoFit: "view",
      layout: {
        type: "d3-force",
        link: { distance: 140 },
      },
      node: {
        type: "circle",
        style: {
          size: 44,
          labelFill: "#0f172a",
          labelFontSize: 12,
          lineWidth: 2,
          stroke: "#ffffff",
        },
      },
      edge: {
        type: "line",
        style: {
          endArrow: true,
          labelFill: "#475569",
          labelFontSize: 10,
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
    });
    g6Graph.on("canvas:click", () => {
      selectedEdgeId.value = "";
    });
  } else {
    g6Graph.setSize(width, height);
  }

  g6Graph.setData({
    nodes: result.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      relation_type: node.category,
      style: {
        size: node.id === result.target_node_id ? 56 : 44,
        labelText: node.title,
        fill: nodeColorByCategory(node.category),
      },
    })),
    edges: result.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relation_type: edge.relation_type,
      direction_label: edge.direction_label,
      style: {
        labelText: edge.direction_label,
        lineWidth: edge.relation_type === "promotion" ? 2.8 : 2,
        lineDash: edge.relation_type === "promotion" ? [] : [5, 4],
        stroke: edgeColorByType(edge.relation_type),
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
  uiState.success = "";
  try {
    const [manualResponse, profileResponse] = await Promise.all([
      fetchManualJobPortraits(),
      fetchStudentProfiles(),
    ]);
    manualPortraits.value = manualResponse.items;
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
    let fetched: CareerPathV2GraphResponse;
    try {
      fetched = await fetchCareerPathGraph({
        job_id: jobId,
        student_profile_id: toPositiveInt(form.studentProfileId),
        depth: form.depth,
      });
    } catch (error) {
      // 兜底：若当前岗位暂无图谱，则自动回退到预置图谱岗位，保证可视化稳定展示
      if (error instanceof ApiRequestError && error.status === 404) {
        const fallbackJobId = resolveFallbackGraphJobId(jobId);
        fetched = await fetchCareerPathGraph({
          job_id: fallbackJobId,
          student_profile_id: toPositiveInt(form.studentProfileId),
          depth: form.depth,
        });
        uiState.success = `当前岗位尚未命中图谱，已展示预置图谱（岗位ID: ${fallbackJobId}）`;
      } else {
        throw error;
      }
    }

    const result =
      fetched.nodes.length > 0
        ? fetched
        : {
            ...fetched,
            target_node_id: `job-${jobId}`,
            nodes: [buildGraphPlaceholderNode(jobId)],
            edges: [],
          };
    graphResult.value = result;
    selectedNodeId.value = result.target_node_id;
    selectedEdgeId.value = "";
    await nextTick();
    renderRadarChart();
    if (chartTab.value === "graph") {
      await renderG6Graph(result);
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
      ? Math.max(1, Math.min(3, Number(route.query.depth) || 2))
      : 2;

  form.jobId = jobId ? String(jobId) : "";
  form.studentProfileId = studentProfileId ? String(studentProfileId) : "";
  form.depth = depth;

  if (jobId) {
    await loadGraph();
  } else {
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
    <p v-if="uiState.success" class="notice notice-success">{{ uiState.success }}</p>

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

    <section class="panel graph-panel">
      <div class="panel-title-row">
        <div>
          <h3>可视化视图</h3>
          <p v-if="graphResult" class="muted">
            节点 {{ graphResult.nodes.length }} · 边 {{ graphResult.edges.length }} · 版本
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

      <div v-show="chartTab === 'graph'">
        <div v-if="graphResult" ref="g6Ref" class="graph-canvas"></div>
        <p v-if="graphResult && graphResult.edges.length === 0" class="muted empty-hint">
          当前没有可用关系边，建议点击“重建图谱快照”后再查看。
        </p>
        <p v-else class="empty-text">请选择岗位并加载图谱后查看 G6 关系图。</p>
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
              <option v-for="node in graphResult.nodes" :key="node.id" :value="node.id">
                {{ node.title }}（{{ node.category }}）
              </option>
            </select>
          </label>

          <label>
            关系
            <select v-model="selectedEdgeId">
              <option value="">请选择关系</option>
              <option v-for="edge in graphResult.edges" :key="edge.id" :value="edge.id">
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

      <div v-else class="panel-stack">
        <article
          v-for="item in graphResult.promotion_routes"
          :key="item.route_id"
          class="route-card"
        >
          <header>
            <strong>{{ item.title }}</strong>
            <span class="route-score">{{ item.suitability_score }} 分</span>
          </header>
          <p>{{ item.summary }}</p>
        </article>
        <article
          v-for="item in graphResult.transition_routes"
          :key="item.route_id"
          class="route-card transition-card"
        >
          <header>
            <strong>{{ item.title }}</strong>
            <span class="route-score">{{ item.suitability_score }} 分</span>
          </header>
          <p>{{ item.summary }}</p>
        </article>
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

.notice-success {
  background: linear-gradient(135deg, rgba(227, 255, 244, 0.82), rgba(241, 255, 251, 0.48));
  color: #0b6b54;
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
  color: rgba(28, 48, 82, 0.84);
  font-weight: 600;
}

select {
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

.primary-btn,
.secondary-btn,
.seed-btn {
  border-radius: 16px;
  padding: 10px 14px;
  cursor: pointer;
  font-weight: 700;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease;
}

.primary-btn {
  border: 1px solid transparent;
  background: linear-gradient(135deg, rgba(73, 182, 223, 0.92), rgba(64, 105, 236, 0.92));
  color: #fff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 16px 28px rgba(45, 99, 203, 0.22);
}

.secondary-btn {
  border: 1px solid rgba(255, 255, 255, 0.62);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.8), rgba(226, 239, 255, 0.36));
  color: #1d4ed8;
}

.seed-btn {
  border: 1px solid rgba(255, 255, 255, 0.62);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.8), rgba(242, 230, 255, 0.38));
  color: #7c3aed;
}

.primary-btn:hover,
.secondary-btn:hover,
.seed-btn:hover {
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

.graph-canvas {
  width: 100%;
  height: 560px;
  margin-top: 12px;
  border-radius: 20px;
  background:
    radial-gradient(circle at top left, rgba(111, 209, 255, 0.18), transparent 35%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.7) 0%, rgba(233, 244, 255, 0.48) 100%);
  border: 1px solid rgba(255, 255, 255, 0.56);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.74);
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
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
