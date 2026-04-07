<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { marked } from "marked";
import DOMPurify from "dompurify";

import type {
  CareerReportExportRecord,
  CareerReportRecord,
  CareerReportSection,
  CareerReportSummary,
  MatchResultDetail,
} from "@career/contracts/types";

import { fetchMatchDetail } from "@/shared/api/matching";
import { polishSectionContent } from "@/shared/api/agent";
import {
  createReport,
  createReportExport,
  fetchReportDetail,
  fetchReportExports,
  fetchReportList,
  resolveReportExportDownloadUrl,
  updateReport,
} from "@/shared/api/report";
import { ApiRequestError } from "@/shared/api/http";

const route = useRoute();
const router = useRouter();

const matchDetail = ref<MatchResultDetail | null>(null);
const reports = ref<CareerReportSummary[]>([]);
const exportsList = ref<CareerReportExportRecord[]>([]);
const selectedReport = ref<CareerReportRecord | null>(null);
const editableSections = ref<CareerReportSection[]>([]);

const loading = reactive({
  match: false,
  list: false,
  detail: false,
  create: false,
  save: false,
  export: false,
  exportList: false,
  polish: {} as Record<string, boolean>,
});

const form = reactive({
  matchId: "",
});

const uiState = reactive({
  error: "",
  success: "",
});
const isEditMode = ref(false);

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

function syncEditableSections(record: CareerReportRecord | null): void {
  editableSections.value = record
    ? record.sections.map((section) => ({
        ...section,
      }))
    : [];
}

function triggerDownload(downloadPath: string): void {
  const anchor = document.createElement("a");
  anchor.href = resolveReportExportDownloadUrl(downloadPath);
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function formatSectionContent(content: string): string[] {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.length > 0 ? lines : ["暂无内容"];
}

function openCareerPath(): void {
  const jobId = selectedReport.value?.job_id ?? matchDetail.value?.job_id;
  const studentProfileId =
    selectedReport.value?.student_profile_id ?? matchDetail.value?.student_profile_id;

  if (!jobId) {
    uiState.error = "当前报告上下文缺少岗位信息，无法打开图谱页";
    return;
  }

  router.push({
    path: "/career-paths",
    query: {
      job_id: String(jobId),
      ...(studentProfileId ? { student_profile_id: String(studentProfileId) } : {}),
      depth: "2",
    },
  });
}

async function loadMatchDetail(matchId: number): Promise<void> {
  loading.match = true;
  try {
    matchDetail.value = await fetchMatchDetail(matchId);
  } finally {
    loading.match = false;
  }
}

async function loadReportList(matchId: number): Promise<void> {
  loading.list = true;
  try {
    const response = await fetchReportList(matchId);
    reports.value = response.items;
  } finally {
    loading.list = false;
  }
}

async function openReport(reportId: number): Promise<void> {
  loading.detail = true;
  uiState.error = "";

  try {
    const detail = await fetchReportDetail(reportId);
    selectedReport.value = detail;
    syncEditableSections(detail);
    await loadReportExports(reportId);
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.detail = false;
  }
}

async function loadReportExports(reportId: number): Promise<void> {
  loading.exportList = true;

  try {
    const response = await fetchReportExports(reportId);
    exportsList.value = response.items;
  } finally {
    loading.exportList = false;
  }
}

async function refreshByMatchId(matchId: number): Promise<void> {
  uiState.error = "";
  uiState.success = "";

  try {
    await Promise.all([loadMatchDetail(matchId), loadReportList(matchId)]);

    if (reports.value[0]) {
      await openReport(reports.value[0].id);
    } else {
      selectedReport.value = null;
      exportsList.value = [];
      syncEditableSections(null);
    }
  } catch (error) {
    selectedReport.value = null;
    exportsList.value = [];
    syncEditableSections(null);
    uiState.error = formatApiError(error);
  }
}

async function handleQueryMatchId(rawMatchId: unknown): Promise<void> {
  const matchId = typeof rawMatchId === "string" ? toPositiveInt(rawMatchId) : undefined;
  if (!matchId) {
    return;
  }

  form.matchId = String(matchId);
  await refreshByMatchId(matchId);
}

async function handlePolishSection(section: CareerReportSection): Promise<void> {
  const content = section.content.trim();
  if (!content) {
    uiState.error = "请先在该章节中输入内容，然后再使用润色功能";
    return;
  }

  loading.polish[section.key] = true;
  uiState.error = "";
  uiState.success = "";

  try {
    const result = await polishSectionContent({
      content,
      section_key: section.key,
      section_title: section.title,
    });
    section.content = result.polished_content;
    uiState.success = `【${section.title}】章节已润色完成`;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.polish[section.key] = false;
  }
}

async function searchByMatchId(): Promise<void> {
  const matchId = toPositiveInt(form.matchId);
  if (!matchId) {
    uiState.error = "请输入合法的匹配结果 ID";
    return;
  }

  await router.replace({
    path: "/report",
    query: {
      match_id: String(matchId),
    },
  });
}

async function createNewVersion(): Promise<void> {
  const matchId = toPositiveInt(form.matchId);
  if (!matchId) {
    uiState.error = "请先选择合法的匹配结果";
    return;
  }

  loading.create = true;
  uiState.error = "";
  uiState.success = "";

  try {
    const created = await createReport({
      match_id: matchId,
    });

    uiState.success = `已成功生成报告版本 V${created.version}`;
    await loadReportList(matchId);
    await openReport(created.id);
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.create = false;
  }
}

async function saveCurrentReport(): Promise<void> {
  if (!selectedReport.value) {
    uiState.error = "请先选择需要保存的报告版本";
    return;
  }

  loading.save = true;
  uiState.error = "";
  uiState.success = "";

  try {
    const updated = await updateReport(selectedReport.value.id, {
      sections: editableSections.value,
    });

    selectedReport.value = updated;
    syncEditableSections(updated);
    uiState.success = `报告 V${updated.version} 已更新并保存`;
    isEditMode.value = false;

    const matchId = toPositiveInt(form.matchId);
    if (matchId) {
      await loadReportList(matchId);
    }
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.save = false;
  }
}

async function exportCurrentReport(): Promise<void> {
  if (!selectedReport.value) {
    uiState.error = "请先选择需要导出的报告版本";
    return;
  }

  loading.export = true;
  uiState.error = "";
  uiState.success = "";

  try {
    const exported = await createReportExport(selectedReport.value.id, {
      format: "pdf",
    });

    uiState.success = `PDF 导出指令已下发：${exported.file_name}`;
    await loadReportExports(selectedReport.value.id);
    triggerDownload(exported.download_path);
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.export = false;
  }
}

const canCreate = computed(() => toPositiveInt(form.matchId) !== undefined);

watch(
  () => route.query.match_id,
  async (value) => {
    await handleQueryMatchId(value);
  },
);

onMounted(async () => {
  await handleQueryMatchId(route.query.match_id);
});
</script>

<template>
  <div class="report-container">
    <!-- Header Area -->
    <header class="page-header">
      <div class="header-titles">
        <h1 class="page-title">职业发展评估报告</h1>
        <p class="page-subtitle">基于人岗匹配模型，生成结构化反馈与职业路径规划方案</p>
      </div>
      <RouterLink class="btn btn-outline back-link" to="/matching">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        返回匹配分析
      </RouterLink>
    </header>

    <!-- Global Alerts -->
    <Transition name="fade">
      <div v-if="uiState.error" class="alert alert-error">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>{{ uiState.error }}</span>
      </div>
    </Transition>
    <Transition name="fade">
      <div v-if="uiState.success" class="alert alert-success">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <span>{{ uiState.success }}</span>
      </div>
    </Transition>

    <!-- Context Control Panel -->
    <section class="glass-panel context-panel">
      <div class="toolbar-group">
        <div class="search-box">
          <svg
            class="search-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            v-model="form.matchId"
            type="text"
            placeholder="输入匹配结果 ID (如: 1)..."
            @keyup.enter="searchByMatchId"
          />
        </div>
        <button
          class="btn btn-primary"
          :disabled="loading.match || loading.list"
          @click="searchByMatchId"
        >
          {{ loading.match || loading.list ? "加载上下文中..." : "加载报告上下文" }}
        </button>
        <div class="divider-vertical"></div>
        <button
          class="btn btn-action"
          :disabled="!canCreate || loading.create"
          @click="createNewVersion"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="12" y1="8" x2="12" y2="16"></line>
            <line x1="8" y1="12" x2="16" y2="12"></line>
          </svg>
          {{ loading.create ? "AI 正在生成..." : "生成新版本" }}
        </button>
      </div>

      <div v-if="matchDetail" class="match-summary-card">
        <div class="summary-info">
          <div class="info-item">
            <span class="label">综合匹配得分</span>
            <span class="value score">{{ matchDetail.total_score }}</span>
          </div>
          <div class="info-item">
            <span class="label">学生画像 ID</span>
            <span class="value">#{{ matchDetail.student_profile_id }}</span>
          </div>
          <div class="info-item">
            <span class="label">目标岗位 ID</span>
            <span class="value">#{{ matchDetail.job_id }}</span>
          </div>
        </div>
        <button class="btn btn-ghost" @click="openCareerPath">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
          </svg>
          查看职业图谱
        </button>
      </div>
    </section>

    <!-- Main Workspace -->
    <div class="workspace-layout">
      <!-- Left Sidebar: Versions -->
      <aside class="sidebar-panel">
        <div class="panel-header">
          <h3>报告版本库</h3>
          <span class="badge">{{ reports.length }} 个版本</span>
        </div>

        <div class="version-timeline">
          <button
            v-for="(item, index) in reports"
            :key="item.id"
            class="version-card"
            :class="{ active: selectedReport?.id === item.id }"
            :disabled="loading.detail"
            @click="openReport(item.id)"
          >
            <div class="version-badge">V{{ item.version }}</div>
            <div class="version-content">
              <strong>报告编号 #{{ item.id }}</strong>
              <span class="time">{{ new Date(item.updated_at).toLocaleString() }}</span>
            </div>
            <div v-if="selectedReport?.id === item.id" class="active-indicator"></div>
          </button>

          <div v-if="reports.length === 0" class="empty-state mini">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <p>暂无报告版本</p>
          </div>
        </div>
      </aside>

      <!-- Center: Editor/Viewer -->
      <main class="editor-panel">
        <template v-if="selectedReport">
          <div class="editor-header">
            <div class="report-meta-tags">
              <span class="tag tag-primary">V{{ selectedReport.version }}</span>
              <span class="tag">总分: {{ selectedReport.total_score }}</span>
              <span class="tag">模式: {{ selectedReport.generator_mode }}</span>
            </div>
            <div class="header-actions">
              <button class="btn btn-ghost" @click="isEditMode = !isEditMode">
                <template v-if="isEditMode">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  预览模式
                </template>
                <template v-else>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                  编辑模式
                </template>
              </button>
              <button
                class="btn btn-outline"
                :disabled="loading.export"
                @click="exportCurrentReport"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                {{ loading.export ? "生成中..." : "导出 PDF" }}
              </button>
              <button
                v-if="isEditMode"
                class="btn btn-primary shadow"
                :disabled="loading.save"
                @click="saveCurrentReport"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                  <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
                {{ loading.save ? "保存中..." : "保存当前修改" }}
              </button>
            </div>
          </div>

          <!-- Structured Info Modules -->
          <div class="structured-modules">
            <div class="module-card">
              <h4>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
                决策依据提取
              </h4>
              <ul class="bullet-list">
                <li v-for="item in selectedReport.evidence_refs" :key="item">{{ item }}</li>
              </ul>
            </div>
            <div class="module-card highlight">
              <h4>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="9 11 12 14 22 4"></polyline>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                执行计划与建议
              </h4>
              <div class="plan-grid">
                <div class="plan-col">
                  <h5>阶段一：短期切入</h5>
                  <ul class="bullet-list checked">
                    <li v-for="item in selectedReport.action_plan.short_term" :key="`s-${item}`">
                      {{ item }}
                    </li>
                  </ul>
                </div>
                <div class="plan-col">
                  <h5>阶段二：中期发展</h5>
                  <ul class="bullet-list checked">
                    <li v-for="item in selectedReport.action_plan.mid_term" :key="`m-${item}`">
                      {{ item }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Sections Content -->
          <div class="sections-container">
            <article v-for="section in editableSections" :key="section.key" class="section-block">
              <div class="section-header">
                <div class="title-group">
                  <span class="section-label">{{ section.key }}</span>
                  <h3 class="section-title">{{ section.title }}</h3>
                </div>
                <button
                  v-if="section.key === 'career_path'"
                  class="btn btn-text text-primary"
                  @click="openCareerPath"
                >
                  查看可视化图谱 →
                </button>
              </div>

              <div class="section-body">
                <template v-if="!isEditMode">
                  <div class="prose-content">
                    <p
                      v-for="(line, lineIndex) in formatSectionContent(section.content)"
                      :key="`${section.key}-${lineIndex}`"
                    >
                      {{ line }}
                    </p>
                  </div>
                </template>
                <template v-else>
                  <div style="display: flex; justify-content: flex-end; margin-bottom: 8px">
                    <button
                      class="btn btn-outline"
                      style="padding: 4px 10px; font-size: 13px"
                      :disabled="loading.save || loading.polish[section.key]"
                      @click="handlePolishSection(section)"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        style="margin-right: 4px"
                      >
                        <path
                          d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
                        ></path>
                      </svg>
                      {{ loading.polish[section.key] ? "AI 润色中..." : "AI 润色" }}
                    </button>
                  </div>
                  <textarea
                    v-model="section.content"
                    class="rich-textarea"
                    rows="6"
                    :disabled="loading.save || loading.polish[section.key]"
                    placeholder="请输入该章节的具体分析与反馈内容..."
                  ></textarea>
                </template>
              </div>
            </article>
          </div>
        </template>

        <!-- Empty State for Editor -->
        <div v-else class="empty-state large">
          <div class="illustration">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#cbd5e1"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <h3>未选择报告</h3>
          <p>请在上方加载匹配结果，或在左侧选择一个报告版本进行查看与编辑。</p>
        </div>
      </main>
    </div>

    <!-- Export History Panel -->
    <section class="glass-panel export-panel">
      <div class="panel-header">
        <h3>报告交付与归档记录</h3>
        <span class="badge" v-if="selectedReport">{{ exportsList.length }} 份归档</span>
      </div>

      <div v-if="selectedReport" class="export-grid">
        <button
          v-for="item in exportsList"
          :key="item.id"
          class="export-file-card"
          @click="triggerDownload(item.download_path)"
        >
          <div class="file-icon">PDF</div>
          <div class="file-info">
            <strong class="file-name" :title="item.file_name">{{ item.file_name }}</strong>
            <div class="file-meta">
              <span>{{ Math.max(1, Math.round(item.file_size_bytes / 1024)) }} KB</span>
              <span class="dot">•</span>
              <span>{{ new Date(item.created_at).toLocaleString() }}</span>
            </div>
          </div>
          <svg
            class="download-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>

        <div
          v-if="!loading.exportList && exportsList.length === 0"
          class="empty-state mini horizontal"
        >
          <p>当前报告版本暂无 PDF 导出记录，点击上方「导出 PDF」生成。</p>
        </div>
        <div v-if="loading.exportList" class="loading-state">
          <span class="spinner"></span> 数据加载中...
        </div>
      </div>
      <div v-else class="empty-state mini horizontal">
        <p>请先在工作区选择具体报告版本，方可管理其导出记录。</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ==========================================================================
   Design System Variables & Resets
   ========================================================================== */
.report-container {
  --primary: #0f766e;
  --primary-hover: #0d9488;
  --primary-light: #ccfbf1;
  --bg-main: #f1f5f9;
  --bg-surface: #ffffff;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --border: #e2e8f0;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--text-main);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

* {
  box-sizing: border-box;
}

/* ==========================================================================
   Typography & Headers
   ========================================================================== */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 1px solid var(--border);
  padding-bottom: 20px;
}

.page-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #0f172a;
}

.page-subtitle {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: 15px;
}

/* ==========================================================================
   Alerts & Notifications
   ========================================================================== */
.alert {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-md);
  font-weight: 500;
  font-size: 14px;
  box-shadow: var(--shadow-sm);
}

.alert svg {
  flex-shrink: 0;
}

.alert-error {
  background-color: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.alert-success {
  background-color: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* ==========================================================================
   Buttons & Inputs
   ========================================================================== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  line-height: 1;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.btn-primary {
  background-color: var(--primary);
  color: white;
}

.btn-primary:hover {
  background-color: var(--primary-hover);
}

.btn-primary.shadow {
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.2);
}

.btn-outline {
  background-color: transparent;
  border-color: var(--border);
  color: var(--text-main);
}

.btn-outline:hover {
  background-color: #f8fafc;
  border-color: #cbd5e1;
}

.btn-action {
  background-color: #0f172a;
  color: white;
}
.btn-action:hover {
  background-color: #1e293b;
}

.btn-ghost {
  background-color: transparent;
  color: var(--text-muted);
}
.btn-ghost:hover {
  background-color: #f1f5f9;
  color: var(--text-main);
}

.btn-text {
  padding: 4px 8px;
  background: transparent;
}
.text-primary {
  color: var(--primary);
}
.text-primary:hover {
  text-decoration: underline;
}

.back-link {
  text-decoration: none;
}

/* ==========================================================================
   Context Panel (Top Section)
   ========================================================================== */
.glass-panel {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 24px;
  box-shadow: var(--shadow-sm);
}

.toolbar-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 260px;
  max-width: 400px;
}

.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}

.search-box input {
  width: 100%;
  padding: 12px 16px 12px 42px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 15px;
  transition: all 0.2s;
  background-color: #f8fafc;
}

.search-box input:focus {
  outline: none;
  border-color: var(--primary);
  background-color: white;
  box-shadow: 0 0 0 3px var(--primary-light);
}

.divider-vertical {
  width: 1px;
  height: 24px;
  background-color: var(--border);
  margin: 0 8px;
}

.match-summary-card {
  margin-top: 20px;
  padding: 16px 24px;
  background: linear-gradient(to right, #f8fafc, #ffffff);
  border-radius: var(--radius-lg);
  border: 1px dashed #cbd5e1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.summary-info {
  display: flex;
  gap: 32px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item .label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-item .value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
}

.info-item .score {
  color: var(--primary);
  font-size: 20px;
}

/* ==========================================================================
   Workspace Layout (Sidebar + Main)
   ========================================================================== */
.workspace-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

/* Sidebar */
.sidebar-panel {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 20px;
  box-shadow: var(--shadow-sm);
  position: sticky;
  top: 24px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.badge {
  background-color: #f1f5f9;
  color: var(--text-muted);
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.version-timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.version-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 16px;
  background-color: #f8fafc;
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.version-card:hover:not(.active) {
  background-color: #f1f5f9;
  border-color: var(--border);
}

.version-card.active {
  background-color: var(--primary-light);
  border-color: #99f6e4;
}

.version-badge {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: white;
  border-radius: 10px;
  font-weight: 700;
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.version-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.version-content strong {
  font-size: 14px;
  color: var(--text-main);
}

.version-content .time {
  font-size: 12px;
  color: var(--text-muted);
}

.active-indicator {
  position: absolute;
  left: -1px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 24px;
  background-color: var(--primary);
  border-radius: 0 4px 4px 0;
}

/* Center Editor Panel */
.editor-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--bg-surface);
  padding: 16px 24px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  flex-wrap: wrap;
  gap: 16px;
}

.report-meta-tags {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.tag {
  padding: 6px 12px;
  background-color: #f1f5f9;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
}

.tag-primary {
  background-color: var(--primary);
  color: white;
}

.header-actions {
  display: flex;
  gap: 12px;
}

/* Structured Modules */
.structured-modules {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.module-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
}

.module-card.highlight {
  border-color: #bfdbfe;
  background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
}

.module-card h4 {
  margin: 0 0 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: #0f172a;
}

.module-card.highlight h4 {
  color: #1e40af;
}

.bullet-list {
  margin: 0;
  padding-left: 20px;
  color: #334155;
  font-size: 14px;
  line-height: 1.6;
}

.bullet-list li + li {
  margin-top: 8px;
}

.bullet-list.checked {
  list-style: none;
  padding-left: 0;
}

.bullet-list.checked li {
  position: relative;
  padding-left: 24px;
}

.bullet-list.checked li::before {
  content: "✓";
  position: absolute;
  left: 0;
  color: var(--primary);
  font-weight: bold;
}

.plan-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.plan-col h5 {
  margin: 0 0 12px;
  font-size: 13px;
  color: #475569;
  text-transform: uppercase;
}

/* Sections */
.sections-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-block {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s;
}

.section-block:hover {
  box-shadow: var(--shadow-md);
}

.section-header {
  padding: 16px 20px;
  background-color: #f8fafc;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: white;
  background-color: #94a3b8;
  padding: 4px 8px;
  border-radius: 4px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
}

.section-body {
  padding: 20px;
}

.prose-content {
  color: #334155;
  font-size: 15px;
  line-height: 1.8;
}

.prose-content p {
  margin: 0 0 12px;
  white-space: pre-wrap;
}
.prose-content p:last-child {
  margin-bottom: 0;
}

.rich-textarea {
  width: 100%;
  padding: 16px;
  border: 1px solid #cbd5e1;
  border-radius: var(--radius-md);
  font-size: 15px;
  line-height: 1.8;
  color: #0f172a;
  resize: vertical;
  background-color: #f8fafc;
  transition: all 0.2s;
  box-sizing: border-box;
}

.rich-textarea:focus {
  outline: none;
  border-color: var(--primary);
  background-color: white;
  box-shadow: 0 0 0 3px var(--primary-light);
}

/* ==========================================================================
   Export Panel (Bottom Section)
   ========================================================================== */
.export-panel {
  margin-top: 16px;
}

.export-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.export-file-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background-color: #f8fafc;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.export-file-card:hover {
  border-color: var(--primary);
  background-color: white;
  box-shadow: var(--shadow-sm);
}

.export-file-card:hover .download-icon {
  color: var(--primary);
  transform: translateY(2px);
}

.file-icon {
  width: 44px;
  height: 44px;
  background-color: #fee2e2;
  color: #dc2626;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
}

.file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-name {
  font-size: 14px;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}

.download-icon {
  color: #94a3b8;
  transition: all 0.2s;
}

/* ==========================================================================
   Empty States & Utilities
   ========================================================================== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-muted);
}

.empty-state.large {
  padding: 64px 24px;
  background-color: var(--bg-surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius-xl);
}

.empty-state.large h3 {
  margin: 16px 0 8px;
  color: #0f172a;
}

.empty-state.mini {
  padding: 32px 16px;
}

.empty-state.horizontal {
  flex-direction: row;
  justify-content: flex-start;
  padding: 16px;
  background-color: #f8fafc;
  border-radius: var(--radius-md);
  color: #64748b;
  font-size: 14px;
}

.loading-state {
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 14px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #cbd5e1;
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Responsive Adjustments */
@media (max-width: 1024px) {
  .workspace-layout {
    grid-template-columns: 260px minmax(0, 1fr);
  }
}

@media (max-width: 768px) {
  .workspace-layout {
    grid-template-columns: 1fr;
  }

  .sidebar-panel {
    position: static;
  }

  .plan-grid {
    grid-template-columns: 1fr;
  }

  .summary-info {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
