<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import type {
  CareerReportExportRecord,
  CareerReportRecord,
  CareerReportSection,
  CareerReportSummary,
  MatchResultDetail,
} from "@career/contracts/types";

import { fetchMatchDetail } from "@/shared/api/matching";
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
});

const form = reactive({
  matchId: "",
});

const uiState = reactive({
  error: "",
  success: "",
});

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

    uiState.success = `已生成报告版本 V${created.version}`;
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
    uiState.success = `报告 V${updated.version} 已保存`;

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

    uiState.success = `PDF 导出已生成：${exported.file_name}`;
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
  <section class="report-page">
    <header class="page-header">
      <div>
        <h2>职业报告</h2>
        <p>基于既有匹配结果生成多版本职业报告，并按结构化章节编辑保存。</p>
      </div>
      <RouterLink class="nav-link" to="/matching">返回匹配分析</RouterLink>
    </header>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice notice-success">{{ uiState.success }}</p>

    <section class="panel">
      <h3>选择匹配结果</h3>
      <div class="toolbar">
        <label class="match-input">
          匹配结果 ID
          <input v-model="form.matchId" type="text" placeholder="例如：1" />
        </label>
        <button class="ghost-btn" :disabled="loading.match || loading.list" @click="searchByMatchId">
          {{ loading.match || loading.list ? "加载中..." : "加载报告上下文" }}
        </button>
        <button class="primary-btn" :disabled="!canCreate || loading.create" @click="createNewVersion">
          {{ loading.create ? "生成中..." : "生成新报告版本" }}
        </button>
      </div>

      <div v-if="matchDetail" class="match-card">
        <p>匹配结果 #{{ matchDetail.id }} | 学生画像 #{{ matchDetail.student_profile_id }} | 岗位 #{{ matchDetail.job_id }}</p>
        <p>总分 {{ matchDetail.total_score }}，四维分数已可直接用于报告生成与后续复测。</p>
      </div>
    </section>

    <section class="layout">
      <aside class="panel version-panel">
        <div class="panel-title-row">
          <h3>版本列表</h3>
          <span class="muted">{{ reports.length }} 个版本</span>
        </div>

        <div class="version-list">
          <button
            v-for="item in reports"
            :key="item.id"
            class="version-item"
            :class="{ active: selectedReport?.id === item.id }"
            :disabled="loading.detail"
            @click="openReport(item.id)"
          >
            <strong>V{{ item.version }}</strong>
            <span>报告 #{{ item.id }}</span>
            <span>{{ new Date(item.updated_at).toLocaleString() }}</span>
          </button>

          <p v-if="reports.length === 0" class="empty-text">当前匹配结果还没有报告版本。</p>
        </div>
      </aside>

      <section class="panel editor-panel">
        <div class="panel-title-row">
          <h3 v-if="selectedReport">报告详情 #{{ selectedReport.id }}</h3>
          <h3 v-else>报告详情</h3>
          <div class="action-group">
            <button class="ghost-btn" :disabled="!selectedReport || loading.export" @click="exportCurrentReport">
              {{ loading.export ? "导出中..." : "导出 PDF" }}
            </button>
            <button class="primary-btn" :disabled="!selectedReport || loading.save" @click="saveCurrentReport">
              {{ loading.save ? "保存中..." : "保存当前版本" }}
            </button>
          </div>
        </div>

        <div v-if="selectedReport" class="report-meta">
          <span>match_id: {{ selectedReport.match_id }}</span>
          <span>version: V{{ selectedReport.version }}</span>
          <span>总分: {{ selectedReport.total_score }}</span>
        </div>

        <div v-if="editableSections.length > 0" class="section-list">
          <article v-for="section in editableSections" :key="section.key" class="section-card">
            <header>
              <p class="section-key">{{ section.key }}</p>
              <h4>{{ section.title }}</h4>
            </header>
            <textarea v-model="section.content" rows="6" :disabled="loading.save"></textarea>
          </article>
        </div>

        <p v-else class="empty-text">请先加载匹配结果并生成报告版本。</p>
      </section>
    </section>

    <section class="panel">
      <div class="panel-title-row">
        <h3>导出记录</h3>
        <span class="muted">{{ exportsList.length }} 条记录</span>
      </div>

      <div v-if="selectedReport" class="export-list">
        <button
          v-for="item in exportsList"
          :key="item.id"
          class="export-item"
          @click="triggerDownload(item.download_path)"
        >
          <strong>{{ item.file_name }}</strong>
          <span>{{ Math.max(1, Math.round(item.file_size_bytes / 1024)) }} KB</span>
          <span>{{ new Date(item.created_at).toLocaleString() }}</span>
        </button>

        <p v-if="!loading.exportList && exportsList.length === 0" class="empty-text">当前报告版本还没有导出记录。</p>
        <p v-if="loading.exportList" class="empty-text">导出记录加载中...</p>
      </div>

      <p v-else class="empty-text">请先选择具体报告版本，再查看或下载导出记录。</p>
    </section>
  </section>
</template>

<style scoped>
.report-page {
  max-width: 1180px;
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
  border-radius: 12px;
  background: #ffffff;
}

.panel h3 {
  margin: 0 0 12px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
}

.match-input {
  min-width: 220px;
  display: grid;
  gap: 6px;
  color: #334155;
}

input,
textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
}

textarea {
  resize: vertical;
  min-height: 120px;
}

.primary-btn,
.ghost-btn {
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
}

.primary-btn {
  border: 1px solid #0f766e;
  background: #0f766e;
  color: #ffffff;
}

.ghost-btn {
  border: 1px solid #94a3b8;
  background: #f8fafc;
  color: #0f172a;
}

.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.match-card {
  margin-top: 12px;
  padding: 12px;
  border-radius: 10px;
  background: #f8fafc;
  color: #334155;
}

.match-card p {
  margin: 0;
}

.match-card p + p {
  margin-top: 6px;
}

.layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
}

.panel-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.action-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.muted {
  color: #64748b;
  font-size: 13px;
}

.version-list {
  display: grid;
  gap: 10px;
}

.version-item {
  display: grid;
  gap: 4px;
  text-align: left;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px;
  background: #f8fafc;
  cursor: pointer;
}

.version-item.active {
  border-color: #0f766e;
  background: #ecfeff;
}

.report-meta {
  margin: 12px 0 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: #475569;
}

.section-list {
  display: grid;
  gap: 14px;
}

.section-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px;
  background: #fcfdff;
}

.section-card header {
  margin-bottom: 10px;
}

.section-card h4 {
  margin: 4px 0 0;
  color: #0f172a;
}

.section-key {
  margin: 0;
  color: #0f766e;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.export-list {
  display: grid;
  gap: 10px;
}

.export-item {
  display: grid;
  gap: 4px;
  text-align: left;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
  cursor: pointer;
}

.empty-text {
  margin: 0;
  color: #64748b;
}

@media (max-width: 920px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .page-header {
    flex-direction: column;
  }
}
</style>
