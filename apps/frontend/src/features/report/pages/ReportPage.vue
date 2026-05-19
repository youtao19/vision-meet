<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { marked } from "marked";
import DOMPurify from "dompurify";

import type {
  CareerReportExportFormat,
  CareerReportExportRecord,
  CareerReportRecord,
  CareerReportSection,
  CareerReportSummary,
  MatchResultDetail,
} from "@career/contracts/types";

import { fetchMatchDetail } from "@/shared/api/matching";
import { polishSectionContent } from "@/shared/api/ai";
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

const isAnyPolishing = computed(() => Object.values(loading.polish).some((val) => val));

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

function renderMarkdown(content: string): string {
  if (!content) return "<p>暂无内容</p>";
  return DOMPurify.sanitize(marked.parse(content, { async: false, breaks: true }) as string);
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

async function handlePolishAll(): Promise<void> {
  const sectionsToPolish = editableSections.value.filter((s) => s.content.trim().length > 0);
  if (sectionsToPolish.length === 0) {
    uiState.error = "没有可润色的内容";
    return;
  }

  for (const section of sectionsToPolish) {
    // Only continue if not interrupted (bonus: could add a cancel mechanism, but sequential is fine for now)
    await handlePolishSection(section);
  }
  uiState.success = "全文所有章节已顺序润色完成！";
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
  await exportCurrentReportByFormat("pdf");
}

/**
 * 作用：按指定格式导出当前选中报告并触发下载。
 * 参数：format 支持 pdf 与 markdown。
 * 返回：无。
 * 注意：导出前必须先选中报告版本。
 */
async function exportCurrentReportByFormat(format: CareerReportExportFormat): Promise<void> {
  if (!selectedReport.value) {
    uiState.error = "请先选择需要导出的报告版本";
    return;
  }

  loading.export = true;
  uiState.error = "";
  uiState.success = "";

  try {
    const exported = await createReportExport(selectedReport.value.id, {
      format,
    });

    uiState.success = `${format === "pdf" ? "PDF" : "Markdown"} 导出指令已下发：${exported.file_name}`;
    await loadReportExports(selectedReport.value.id);
    triggerDownload(exported.download_path);
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.export = false;
  }
}

function formatExportTag(format: CareerReportExportFormat): string {
  return format === "pdf" ? "PDF" : "MD";
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
      <!-- Main Content Area (Now full width) -->
      <main class="editor-panel">
        <template v-if="selectedReport">
          <div class="editor-header">
            <div class="report-meta-tags">
              <!-- Version Selector (Compact replacement for the sidebar) -->
              <div class="version-selector-group">
                <label for="version-select" class="selector-label">报告版本:</label>
                <select
                  id="version-select"
                  :value="selectedReport.id"
                  class="version-dropdown"
                  @change="openReport(Number(($event.target as HTMLSelectElement).value))"
                >
                  <option v-for="item in reports" :key="item.id" :value="item.id">
                    V{{ item.version }} ({{ new Date(item.updated_at).toLocaleDateString() }})
                  </option>
                </select>
              </div>
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
                class="btn btn-outline"
                :disabled="loading.export"
                @click="exportCurrentReportByFormat('markdown')"
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
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
                {{ loading.export ? "生成中..." : "导出 Markdown" }}
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

          <!-- Sections Content -->
          <div class="sections-container" :class="{ 'preview-mode': !isEditMode }">
            <template v-if="!isEditMode">
              <div class="continuous-report paper-style">
                <div
                  v-for="section in editableSections"
                  :key="section.key"
                  class="report-section markdown-body"
                >
                  <div class="section-preview-header">
                    <h3 class="preview-title">{{ section.title }}</h3>
                    <button
                      v-if="section.key === 'career_path'"
                      class="btn btn-text text-primary"
                      @click="openCareerPath"
                    >
                      查看可视化图谱 →
                    </button>
                  </div>
                  <div class="markdown-content" v-html="renderMarkdown(section.content)"></div>
                </div>
              </div>
            </template>
            <template v-else>
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
                  <div style="display: flex; justify-content: flex-end; margin-bottom: 8px">
                    <button
                      class="btn btn-outline"
                      style="padding: 4px 10px; font-size: 13px"
                      :disabled="loading.save || isAnyPolishing"
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
                    rows="8"
                    :disabled="loading.save || isAnyPolishing"
                    placeholder="请输入该章节的具体分析与反馈内容..."
                  ></textarea>
                </div>
              </article>
            </template>
          </div>

          <!-- Structured Info Modules (Moved to bottom as summary) -->
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
          <p>请在上方加载匹配结果，或在页眉中选择一个报告版本进行查看与编辑。</p>
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
          <div class="file-icon">{{ formatExportTag(item.format) }}</div>
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
          <p>当前报告版本暂无导出记录，点击上方导出按钮生成 PDF 或 Markdown。</p>
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
  --primary: var(--glass-primary);
  --primary-hover: var(--glass-primary-strong);
  --primary-light: rgba(214, 240, 255, 0.56);
  --bg-main: rgba(255, 255, 255, 0.18);
  --bg-surface: rgba(255, 255, 255, 0.72);
  --text-main: var(--glass-title);
  --text-muted: var(--glass-muted);
  --border: rgba(255, 255, 255, 0.56);
  --shadow-sm: inset 0 1px 0 rgba(255, 255, 255, 0.78);
  --shadow-md: 0 18px 36px rgba(44, 73, 127, 0.1);
  --shadow-lg: 0 24px 46px rgba(40, 69, 124, 0.14);
  --radius-md: 16px;
  --radius-lg: 20px;
  --radius-xl: 26px;

  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 24px;
  font-family: "Avenir Next", "PingFang SC", "Noto Sans SC", sans-serif;
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.42);
  padding-bottom: 20px;
}

.page-title {
  margin: 0;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--text-main);
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
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
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
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
  border-radius: var(--radius-md);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.btn-primary {
  background: linear-gradient(135deg, rgba(73, 182, 223, 0.92), rgba(64, 105, 236, 0.92));
  color: white;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 16px 28px rgba(45, 99, 203, 0.22);
}

.btn-primary:hover {
  background-color: var(--primary-hover);
}

.btn-primary.shadow {
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.2);
}

.btn-outline {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.3));
  border-color: var(--border);
  color: var(--text-main);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.btn-outline:hover {
  background-color: rgba(255, 255, 255, 0.84);
  border-color: rgba(107, 194, 255, 0.88);
}

.btn-action {
  background: linear-gradient(135deg, rgba(24, 52, 96, 0.92), rgba(51, 86, 148, 0.9));
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
  background-color: rgba(255, 255, 255, 0.42);
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
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.28));
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 24px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 18px 36px rgba(44, 73, 127, 0.1);
  backdrop-filter: blur(24px) saturate(175%);
  -webkit-backdrop-filter: blur(24px) saturate(175%);
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
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: var(--radius-md);
  font-size: 15px;
  transition: all 0.2s;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(255, 255, 255, 0.42));
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
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(227, 243, 255, 0.38));
  border-radius: var(--radius-lg);
  border: 1px dashed rgba(255, 255, 255, 0.58);
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
   Workspace Layout (Full Width)
   ========================================================================== */
.workspace-layout {
  display: block;
  align-items: start;
}

/* Version Selector Styles */
.version-selector-group {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.42);
  padding: 4px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.selector-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}

.version-dropdown {
  background: transparent;
  border: none;
  font-size: 14px;
  font-weight: 700;
  color: var(--primary);
  cursor: pointer;
  outline: none;
  padding: 2px 4px;
}

.version-dropdown:focus {
  background: rgba(255, 255, 255, 0.8);
  border-radius: 4px;
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
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.26));
  padding: 16px 24px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 18px 36px rgba(44, 73, 127, 0.1);
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
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.28));
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 18px 36px rgba(44, 73, 127, 0.1);
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
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.28));
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
  background-color: rgba(255, 255, 255, 0.28);
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
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: var(--radius-md);
  font-size: 15px;
  line-height: 1.8;
  color: #0f172a;
  resize: vertical;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(255, 255, 255, 0.42));
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
  background: rgba(255, 255, 255, 0.34);
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
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.28));
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
  background-color: rgba(255, 255, 255, 0.34);
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
  .report-container {
    padding: 20px 16px;
  }
}

@media (max-width: 768px) {
  .editor-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .plan-grid {
    grid-template-columns: 1fr;
  }

  .summary-info {
    width: 100%;
    justify-content: space-between;
  }
}

/* markdown report continuous reading style */
.sections-container.preview-mode {
  gap: 0;
}

.continuous-report.paper-style {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.3));
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 40px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.report-section {
  position: relative;
}

.report-section + .report-section::before {
  content: "";
  position: absolute;
  top: -16px;
  left: 0;
  right: 0;
  border-top: 1px dashed var(--border);
}

.section-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.preview-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
  position: relative;
  padding-left: 12px;
}

.preview-title::before {
  content: "";
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 4px;
  background-color: var(--primary);
  border-radius: 2px;
}

.markdown-content {
  font-size: 15px;
  line-height: 1.8;
  color: #334155;
  white-space: normal;
}

.markdown-content :deep(p) {
  margin: 0 0 16px;
}
.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0 0 16px;
  padding-left: 24px;
}

.markdown-content :deep(li) {
  margin-bottom: 8px;
}

.markdown-content :deep(strong) {
  color: #0f172a;
  font-weight: 600;
}

.markdown-content :deep(a) {
  color: var(--primary);
  text-decoration: none;
}
.markdown-content :deep(a:hover) {
  text-decoration: underline;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid #cbd5e1;
  padding-left: 16px;
  margin: 0 0 16px;
  color: #64748b;
  background: #f8fafc;
  padding: 12px 16px;
  border-radius: 0 8px 8px 0;
}
</style>
