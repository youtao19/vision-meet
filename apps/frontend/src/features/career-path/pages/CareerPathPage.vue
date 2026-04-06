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

import {
  fetchCareerPathGraph,
  generateCareerPathGraph,
  seedCareerPathUserData,
} from "@/shared/api/career-path";
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

const loading = reactive({
  bootstrap: false,
  graph: false,
  generate: false,
  seed: false,
});

const form = reactive({
  jobId: "",
  studentProfileId: "",
  depth: 2,
});

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
  const avgGap = keys.reduce((sum, key) => sum + Math.abs(target[key] - student[key]), 0) / keys.length;
  const matchScore = Math.max(0, Math.min(100, Math.round(100 - avgGap)));

  return { target, student, matchScore };
});

const targetJobOptions = computed(() => {
  return manualPortraits.value
    .filter((item) => Number.isInteger(item.job_id) && (item.job_id ?? 0) > 0)
    .map((item) => ({
      job_id: item.job_id as number,
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

  const targetValues = indicators.map((item) => comparison.target[item.name as keyof typeof comparison.target]);
  const studentValues = comparison.student
    ? indicators.map((item) => comparison.student?.[item.name as keyof typeof comparison.student] ?? 0)
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
    const result = await fetchCareerPathGraph({
      job_id: jobId,
      student_profile_id: toPositiveInt(form.studentProfileId),
      depth: form.depth,
    });
    graphResult.value = result;
    selectedNodeId.value = result.target_node_id;
    selectedEdgeId.value = "";
    await nextTick();
    renderRadarChart();
    await renderG6Graph(result);
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

/**
 * 触发“固定图谱快照”构建，显式关闭 Agent 推理模式。
 */
async function generateGraph(): Promise<void> {
  loading.generate = true;
  uiState.error = "";
  uiState.success = "";
  try {
    const result = await generateCareerPathGraph({
      force_rebuild: true,
      max_candidates_per_node: 24,
      use_agent: false,
    });
    uiState.success = `图谱生成完成（规则模式）：节点 ${result.nodes_written}，边 ${result.edges_written}`;
    if (toPositiveInt(form.jobId)) {
      await loadGraph();
    }
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.generate = false;
  }
}

/**
 * 触发后端将“用户给定岗位画像”写入数据库。
 */
async function seedUserData(): Promise<void> {
  loading.seed = true;
  uiState.error = "";
  uiState.success = "";
  try {
    const result = await seedCareerPathUserData();
    uiState.success = `已完成岗位画像入库：${result.seeded} 条`;
    await bootstrap();
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.seed = false;
  }
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
        <h2>职业路径图谱（用户数据直出）</h2>
        <p>使用你提供的岗位画像数据，展示匹配度雷达图与岗位关联/晋升图谱。</p>
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
              :key="`${option.job_id}-${option.job_name}`"
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

        <button class="primary-btn" :disabled="loading.graph || loading.generate" @click="searchGraph">
          {{ loading.graph ? "加载中..." : "加载图谱" }}
        </button>

        <button class="secondary-btn" :disabled="loading.generate || loading.graph" @click="generateGraph">
          {{ loading.generate ? "生成中..." : "重建图谱快照" }}
        </button>

        <button class="seed-btn" :disabled="loading.seed || loading.graph" @click="seedUserData">
          {{ loading.seed ? "入库中..." : "使用用户数据入库" }}
        </button>
      </div>
    </section>

    <section class="layout">
      <section class="panel">
        <div class="panel-title-row">
          <h3>ECharts 匹配度雷达图</h3>
          <p class="muted" v-if="radarComparison?.matchScore !== null">
            综合匹配度：{{ radarComparison?.matchScore }} 分
          </p>
        </div>
        <div ref="radarRef" class="radar-canvas"></div>
      </section>

      <section class="panel graph-panel">
        <div class="panel-title-row">
          <div>
            <h3>G6 岗位关联与晋升图谱</h3>
            <p v-if="graphResult" class="muted">
              节点 {{ graphResult.nodes.length }} · 边 {{ graphResult.edges.length }} · 版本
              {{ graphResult.graph_version }}
            </p>
          </div>
        </div>
        <div v-if="graphResult" ref="g6Ref" class="graph-canvas"></div>
        <p v-else class="empty-text">请选择岗位并加载图谱后查看 G6 关系图。</p>
      </section>
    </section>

    <section v-if="graphResult" class="layout">
      <section class="panel">
        <h3>节点/关系详情</h3>
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
                {{ edge.source }} → {{ edge.target }}（{{ edge.direction_label }}）
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
          <h4>{{ selectedEdge.source }} → {{ selectedEdge.target }}</h4>
          <p>{{ selectedEdge.reason }}</p>
          <p>关键迁移技能：{{ selectedEdge.required_skills.join("、") || "暂无" }}</p>
          <p>待补齐技能：{{ selectedEdge.gap_skills.join("、") || "暂无" }}</p>
          <p>迁移成本：{{ selectedEdge.transition_cost }} · 关系分值：{{ selectedEdge.score }}</p>
        </div>
      </section>

      <section class="panel">
        <h3>路径推荐</h3>
        <article v-for="item in graphResult.promotion_routes" :key="item.route_id" class="route-card">
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
      </section>
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
  gap: 12px;
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

.notice-success {
  background: #dcfce7;
  color: #166534;
}

.panel {
  padding: 16px;
  border: 1px solid #dbe4f0;
  border-radius: 14px;
  background: #ffffff;
}

.toolbar {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
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

.primary-btn,
.secondary-btn,
.seed-btn {
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
}

.primary-btn {
  border: 1px solid #0f766e;
  background: #0f766e;
  color: #fff;
}

.secondary-btn {
  border: 1px solid #1d4ed8;
  background: #fff;
  color: #1d4ed8;
}

.seed-btn {
  border: 1px solid #7c3aed;
  background: #fff;
  color: #7c3aed;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.panel-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.muted {
  color: #64748b;
  font-size: 13px;
  margin: 0;
}

.radar-canvas {
  width: 100%;
  height: 320px;
}

.graph-panel {
  min-height: 420px;
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

.detail-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.detail-card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: #f8fafc;
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
  color: #64748b;
}

@media (max-width: 1180px) {
  .toolbar {
    grid-template-columns: 1fr 1fr 1fr;
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
