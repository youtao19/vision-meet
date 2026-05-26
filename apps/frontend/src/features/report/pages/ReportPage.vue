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
const reportTargetTitle = computed(() => {
  const detail = matchDetail.value;
  return (
    detail?.job_title ||
    detail?.job_portrait_snapshot?.profile_detail.name ||
    detail?.job_portrait_name ||
    "岗位画像"
  );
});
const selectedReportWordCount = computed(() =>
  editableSections.value.reduce(
    (total, section) => total + section.content.replace(/\s/g, "").length,
    0,
  ),
);
const selectedReportParagraphCount = computed(() =>
  editableSections.value.reduce(
    (total, section) => total + formatSectionContent(section.content).length,
    0,
  ),
);
const selectedReportStatus = computed(() => {
  if (!selectedReport.value) return "未选择";
  return isEditMode.value ? "编辑中" : "已完成";
});
const selectedReportDate = computed(() =>
  selectedReport.value ? formatDateTime(selectedReport.value.updated_at) : "暂无记录",
);
const reportFilterLabel = computed(() => (form.matchId ? `匹配结果 #${form.matchId}` : "全部报告"));
const recommendationCards = computed(() => {
  const score = selectedReport.value?.total_score ?? matchDetail.value?.total_score ?? 0;
  const title = reportTargetTitle.value;
  return [
    {
      title,
      score: score || 86,
      meta: "当前目标岗位",
      tags: ["画像匹配", "能力路径", "报告依据"],
      accent: "green",
    },
    {
      title: "数据分析师",
      score: Math.max(72, Math.min(92, Math.round(score || 82))),
      meta: "职业发展方向",
      tags: ["SQL", "Python", "可视化"],
      accent: "blue",
    },
    {
      title: "数据挖掘工程师",
      score: Math.max(68, Math.min(88, Math.round((score || 82) - 4))),
      meta: "进阶储备方向",
      tags: ["机器学习", "建模", "工程化"],
      accent: "teal",
    },
  ];
});

function formatDate(raw: string): string {
  return new Date(raw).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(raw: string): string {
  return new Date(raw).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatReportTitle(report: CareerReportSummary): string {
  return `匹配 #${report.match_id} 职业规划报告`;
}

function reportStatusText(report: CareerReportSummary): string {
  return selectedReport.value?.id === report.id ? "已选中" : "已完成";
}

function updateSectionContent(section: CareerReportSection, event: Event): void {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;
  section.content = target.innerText;
}

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

async function loadMatchDetail(matchId: number): Promise<void> {
  loading.match = true;
  try {
    matchDetail.value = await fetchMatchDetail(matchId);
  } finally {
    loading.match = false;
  }
}

async function loadReportList(matchId?: number): Promise<void> {
  loading.list = true;
  try {
    const response = await fetchReportList(matchId ? { match_id: matchId } : {});
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

async function refreshAllReports(): Promise<void> {
  uiState.error = "";
  uiState.success = "";
  matchDetail.value = null;

  try {
    await loadReportList();

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

function shouldCreateReportFromQuery(rawValue: unknown): boolean {
  return rawValue === "1" || rawValue === "true";
}

async function clearCreateReportQuery(): Promise<void> {
  if (!shouldCreateReportFromQuery(route.query.create_report)) {
    return;
  }

  const nextQuery = { ...route.query };
  delete nextQuery.create_report;
  await router.replace({
    path: "/report",
    query: nextQuery,
  });
}

async function handleQueryMatchId(rawMatchId: unknown): Promise<void> {
  const matchId = typeof rawMatchId === "string" ? toPositiveInt(rawMatchId) : undefined;
  if (!matchId) {
    form.matchId = "";
    await refreshAllReports();
    return;
  }

  form.matchId = String(matchId);
  await refreshByMatchId(matchId);

  if (shouldCreateReportFromQuery(route.query.create_report)) {
    await createNewVersion();
    await clearCreateReportQuery();
  }
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
    } else {
      await loadReportList();
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
    <Transition name="fade">
      <div v-if="uiState.error" class="alert alert-error">
        <span class="material-symbols-outlined">error</span>
        <span>{{ uiState.error }}</span>
      </div>
    </Transition>
    <Transition name="fade">
      <div v-if="uiState.success" class="alert alert-success">
        <span class="material-symbols-outlined">check_circle</span>
        <span>{{ uiState.success }}</span>
      </div>
    </Transition>

    <section class="control-strip">
      <div class="context-picker">
        <label for="match-id-input">选择学生</label>
        <div class="match-input">
          <span class="material-symbols-outlined">person_search</span>
          <input
            id="match-id-input"
            v-model="form.matchId"
            type="text"
            placeholder="输入匹配结果 ID / 学生报告"
            @keyup.enter="searchByMatchId"
          />
        </div>
        <button
          class="btn btn-secondary"
          :disabled="loading.match || loading.list"
          @click="searchByMatchId"
        >
          <span class="material-symbols-outlined">refresh</span>
          {{ loading.match || loading.list ? "刷新中" : "刷新" }}
        </button>
      </div>

      <div class="control-actions">
        <span class="scope-pill">{{ reportFilterLabel }}</span>
        <button
          class="btn btn-primary"
          :disabled="!canCreate || loading.create"
          @click="createNewVersion"
        >
          <span class="material-symbols-outlined">auto_awesome</span>
          {{ loading.create ? "生成中" : "生成职业规划报告" }}
        </button>
      </div>
    </section>

    <div class="report-workspace" :class="{ 'editing-mode': isEditMode }">
      <aside class="report-sidebar panel">
        <template v-if="isEditMode && selectedReport">
          <div class="panel-title-row">
            <div>
              <h2>报告大纲</h2>
              <p>{{ editableSections.length }} 个章节</p>
            </div>
            <button class="icon-action" type="button">
              <span class="material-symbols-outlined">add</span>
            </button>
          </div>

          <div class="list-search">
            <span class="material-symbols-outlined">search</span>
            <input type="text" placeholder="搜索大纲内容..." readonly />
          </div>

          <div class="editor-outline">
            <a
              v-for="(section, index) in editableSections"
              :key="section.key"
              :href="`#section-${section.key}`"
              class="editor-outline-link"
              :class="{ active: index === 0 }"
            >
              <span class="material-symbols-outlined">keyboard_arrow_down</span>
              <strong>{{ index + 1 }}、{{ section.title }}</strong>
            </a>
          </div>

          <div class="editor-outline-footer">
            <span>字数统计：{{ selectedReportWordCount }}</span>
            <button type="button">全文检查</button>
          </div>
        </template>

        <template v-else>
          <div class="panel-title-row">
            <div>
              <h2>报告列表</h2>
              <p>{{ reports.length }} 份报告</p>
            </div>
            <button
              class="icon-action"
              type="button"
              :disabled="!canCreate || loading.create"
              @click="createNewVersion"
            >
              <span class="material-symbols-outlined">add</span>
            </button>
          </div>

          <div class="list-search">
            <span class="material-symbols-outlined">search</span>
            <input type="text" placeholder="搜索报告标题" readonly />
          </div>

          <div class="status-tabs" aria-label="报告状态">
            <button class="active" type="button">全部</button>
            <button type="button">已完成</button>
            <button type="button">生成中</button>
            <button type="button">草稿</button>
          </div>

          <div class="report-list">
            <button
              v-for="report in reports"
              :key="report.id"
              class="report-list-item"
              :class="{ active: selectedReport?.id === report.id }"
              type="button"
              @click="openReport(report.id)"
            >
              <div class="report-list-head">
                <strong>{{ formatReportTitle(report) }}</strong>
                <span>{{ reportStatusText(report) }}</span>
              </div>
              <p>匹配 #{{ report.match_id }} · 学生画像 #{{ report.student_profile_id }}</p>
              <div class="report-list-meta">
                <span>生成时间：{{ formatDateTime(report.created_at) }}</span>
                <span>v{{ report.version }}</span>
              </div>
            </button>

            <div v-if="!loading.list && reports.length === 0" class="empty-card">
              <span class="material-symbols-outlined">article</span>
              <p>暂无报告。输入匹配结果 ID 后可生成第一份职业规划报告。</p>
            </div>
            <div v-if="loading.list" class="loading-state">
              <span class="spinner"></span> 报告加载中
            </div>
          </div>

          <div class="report-pagination">
            <button type="button">
              <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <button class="active" type="button">1</button>
            <button type="button">2</button>
            <button type="button">3</button>
            <span>...</span>
            <button type="button">{{ Math.max(1, reports.length) }}</button>
            <button type="button">
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </template>
      </aside>

      <main class="report-main panel">
        <template v-if="selectedReport">
          <header class="document-header">
            <div class="document-title">
              <div class="title-line">
                <h1>职业规划报告</h1>
                <span class="done-badge">{{ selectedReportStatus }}</span>
              </div>
              <p>
                生成时间：{{ formatDateTime(selectedReport.created_at) }}
                <span>版本：v{{ selectedReport.version }}</span>
                <span>模式：{{ selectedReport.generator_mode }}</span>
              </p>
            </div>
            <div class="document-actions">
              <button
                class="btn btn-secondary"
                :disabled="loading.export"
                @click="exportCurrentReport"
              >
                <span class="material-symbols-outlined">picture_as_pdf</span>
                {{ loading.export ? "导出中" : "导出 PDF" }}
              </button>
              <button
                class="btn btn-secondary"
                :class="{ active: isEditMode }"
                @click="isEditMode = !isEditMode"
              >
                <span class="material-symbols-outlined">{{
                  isEditMode ? "visibility" : "edit_square"
                }}</span>
                {{ isEditMode ? "预览报告" : "编辑报告" }}
              </button>
              <button
                v-if="isEditMode"
                class="btn btn-primary"
                :disabled="loading.save"
                @click="saveCurrentReport"
              >
                <span class="material-symbols-outlined">save</span>
                {{ loading.save ? "保存中" : "保存" }}
              </button>
            </div>
          </header>

          <div class="report-tabs">
            <button class="active" type="button">报告概览</button>
            <button
              v-for="section in editableSections.slice(0, 5)"
              :key="section.key"
              type="button"
            >
              {{ section.title }}
            </button>
          </div>

          <div v-if="isEditMode" class="editor-toolbar" aria-label="报告编辑工具栏">
            <button type="button">标题</button>
            <button type="button">正文</button>
            <span class="toolbar-divider"></span>
            <button type="button"><strong>B</strong></button>
            <button type="button"><em>I</em></button>
            <button type="button"><u>U</u></button>
            <button type="button">
              <span class="material-symbols-outlined">format_color_text</span>
            </button>
            <span class="toolbar-divider"></span>
            <button type="button">
              <span class="material-symbols-outlined">format_list_bulleted</span>
            </button>
            <button type="button">
              <span class="material-symbols-outlined">format_list_numbered</span>
            </button>
            <button type="button"><span class="material-symbols-outlined">table</span></button>
            <span class="toolbar-divider"></span>
            <button type="button"><span class="material-symbols-outlined">undo</span></button>
            <button type="button"><span class="material-symbols-outlined">redo</span></button>
          </div>

          <section class="summary-table">
            <div>
              <span>匹配结果</span>
              <strong>#{{ selectedReport.match_id }}</strong>
            </div>
            <div>
              <span>学生画像</span>
              <strong>#{{ selectedReport.student_profile_id }}</strong>
            </div>
            <div>
              <span>目标岗位</span>
              <strong>{{ reportTargetTitle }}</strong>
            </div>
            <div>
              <span>匹配分</span>
              <strong>{{ selectedReport.total_score }}</strong>
            </div>
            <div>
              <span>字数</span>
              <strong>{{ selectedReportWordCount }}</strong>
            </div>
            <div>
              <span>段落</span>
              <strong>{{ selectedReportParagraphCount }}</strong>
            </div>
            <div>
              <span>更新</span>
              <strong>{{ selectedReportDate }}</strong>
            </div>
          </section>

          <section class="document-body" :class="{ editing: isEditMode }">
            <article
              v-for="(section, index) in editableSections"
              :id="`section-${section.key}`"
              :key="section.key"
              class="report-section"
            >
              <div class="section-heading">
                <h2>{{ index + 1 }}、{{ section.title }}</h2>
                <button
                  v-if="isEditMode"
                  class="small-action"
                  type="button"
                  :disabled="loading.save || isAnyPolishing"
                  @click="handlePolishSection(section)"
                >
                  <span class="material-symbols-outlined">auto_fix_high</span>
                  {{ loading.polish[section.key] ? "润色中" : "AI 润色" }}
                </button>
              </div>

              <div
                v-if="!isEditMode"
                class="markdown-content"
                v-html="renderMarkdown(section.content)"
              ></div>
              <div
                v-else
                class="document-editable"
                :contenteditable="loading.save || isAnyPolishing ? 'false' : 'plaintext-only'"
                role="textbox"
                :aria-label="section.title"
                :data-placeholder="'请输入该章节的具体分析与反馈内容...'"
                v-text="section.content"
                @input="updateSectionContent(section, $event)"
              ></div>
            </article>
          </section>
        </template>

        <div v-else class="empty-document">
          <span class="material-symbols-outlined">description</span>
          <h2>未选择报告</h2>
          <p>左侧选择历史报告，或输入匹配结果 ID 后生成新的职业规划报告。</p>
        </div>
      </main>

      <aside class="insight-sidebar">
        <section class="panel recommendation-panel">
          <div class="panel-title-row">
            <div>
              <h2>推荐岗位</h2>
              <p>基于当前报告上下文</p>
            </div>
            <RouterLink to="/job-profiles" class="text-link">查看全部</RouterLink>
          </div>

          <div class="job-card-list">
            <article
              v-for="card in recommendationCards"
              :key="card.title"
              class="job-card"
              :class="`accent-${card.accent}`"
            >
              <div class="job-icon">
                <span class="material-symbols-outlined">badge</span>
              </div>
              <div>
                <div class="job-title-line">
                  <strong>{{ card.title }}</strong>
                  <span>匹配 {{ card.score }}%</span>
                </div>
                <p>{{ card.meta }}</p>
                <div class="job-tags">
                  <span v-for="tag in card.tags" :key="tag">{{ tag }}</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section v-if="!isEditMode" class="panel path-panel">
          <div class="panel-title-row">
            <h2>职业发展路径建议</h2>
            <RouterLink to="/career-paths" class="text-link">查看详情</RouterLink>
          </div>
          <div class="timeline">
            <div class="timeline-item target">
              <span></span>
              <strong>目标岗位</strong>
              <p>{{ reportTargetTitle }}</p>
            </div>
            <div class="timeline-item orange">
              <span></span>
              <strong>3-5 年</strong>
              <p>高级分析师 / 业务数据负责人</p>
            </div>
            <div class="timeline-item yellow">
              <span></span>
              <strong>1-3 年</strong>
              <p>数据分析师 / 数据工程储备</p>
            </div>
            <div class="timeline-item blue">
              <span></span>
              <strong>0-1 年</strong>
              <p>补齐工具链与项目经验</p>
            </div>
          </div>
        </section>

        <section v-if="isEditMode" class="panel ai-panel">
          <div class="panel-title-row">
            <div>
              <h2>AI 润色</h2>
              <p>智能优化内容表达</p>
            </div>
            <span class="material-symbols-outlined">auto_awesome</span>
          </div>
          <button
            class="btn btn-primary full"
            :disabled="loading.save || isAnyPolishing"
            @click="handlePolishAll"
          >
            <span class="material-symbols-outlined">auto_fix_high</span>
            {{ isAnyPolishing ? "润色中" : "润色全部段落" }}
          </button>
          <button
            v-if="editableSections[0]"
            class="btn btn-secondary full"
            :disabled="loading.save || isAnyPolishing"
            @click="handlePolishSection(editableSections[0])"
          >
            补充首段推荐理由
          </button>
          <div class="tone-grid">
            <button class="active" type="button">专业严谨</button>
            <button type="button">积极自信</button>
            <button type="button">简洁明了</button>
          </div>
        </section>

        <section class="panel reason-panel">
          <h2>{{ isEditMode ? "优化建议" : "岗位推荐理由" }}</h2>
          <ul class="check-list">
            <li v-for="item in selectedReport?.evidence_refs ?? []" :key="item">{{ item }}</li>
            <li v-if="selectedReport && selectedReport.evidence_refs.length === 0">
              当前报告暂无依据引用。
            </li>
            <li v-if="!selectedReport">选择报告后展示推荐理由与证据引用。</li>
          </ul>
        </section>

        <section v-if="selectedReport" class="panel delivery-panel">
          <div class="panel-title-row">
            <h2>导出记录</h2>
            <button
              class="text-link button-link"
              type="button"
              @click="exportCurrentReportByFormat('markdown')"
            >
              导出 MD
            </button>
          </div>
          <button
            v-for="item in exportsList"
            :key="item.id"
            class="export-file-card"
            type="button"
            @click="triggerDownload(item.download_path)"
          >
            <span class="file-icon">{{ formatExportTag(item.format) }}</span>
            <span>
              <strong>{{ item.file_name }}</strong>
              <small
                >{{ Math.max(1, Math.round(item.file_size_bytes / 1024)) }} KB ·
                {{ formatDate(item.created_at) }}</small
              >
            </span>
          </button>
          <p v-if="!loading.exportList && exportsList.length === 0" class="muted-tip">
            当前版本暂无导出记录。
          </p>
          <div v-if="loading.exportList" class="loading-state">
            <span class="spinner"></span> 归档加载中
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.report-container {
  --report-blue: #1464e9;
  --report-blue-soft: #eaf2ff;
  --report-ink: #162033;
  --report-muted: #667085;
  --report-line: #dce3ee;
  --report-bg: #f6f8fb;
  --report-panel: #ffffff;
  --report-green: #079455;
  --report-orange: #f79009;

  min-height: calc(100vh - 90px);
  margin: -16px 0 -24px;
  padding: 10px 12px 24px;
  color: var(--report-ink);
  background: var(--report-bg);
  font-family: "Avenir Next", "PingFang SC", "Noto Sans SC", sans-serif;
}

.control-strip,
.report-workspace {
  max-width: 1740px;
  margin: 0 auto;
}

.control-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 0 12px;
}

.context-picker,
.control-actions,
.document-actions,
.report-list-head,
.panel-title-row,
.job-title-line {
  display: flex;
  align-items: center;
}

.context-picker {
  gap: 10px;
  color: #344054;
  font-size: 14px;
}

.context-picker label {
  font-weight: 700;
  white-space: nowrap;
}

.match-input,
.list-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  border: 1px solid var(--report-line);
  border-radius: 6px;
  background: #fff;
  color: #98a2b3;
}

.match-input {
  width: 330px;
  padding: 0 12px;
}

.match-input input,
.list-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--report-ink);
  font: inherit;
}

.control-actions {
  gap: 12px;
}

.scope-pill {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #cfe0ff;
  border-radius: 999px;
  background: #fff;
  color: #175cd3;
  font-size: 13px;
  font-weight: 700;
}

.btn,
.icon-action,
.small-action,
.text-link,
.status-tabs button,
.tone-grid button {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 800;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.btn:disabled,
.icon-action:disabled,
.small-action:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.btn-primary {
  background: var(--report-blue);
  color: #fff;
  box-shadow: 0 8px 18px rgba(20, 100, 233, 0.16);
}

.btn-secondary {
  border: 1px solid var(--report-line);
  background: #fff;
  color: #344054;
}

.btn-secondary.active,
.btn-secondary:hover {
  border-color: #9fc2ff;
  color: var(--report-blue);
}

.btn.full {
  width: 100%;
}

.report-workspace {
  display: grid;
  grid-template-columns: 300px minmax(520px, 1fr) 320px;
  gap: 12px;
  align-items: start;
}

.panel {
  border: 1px solid var(--report-line);
  border-radius: 8px;
  background: var(--report-panel);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03);
}

.report-sidebar,
.report-main,
.insight-sidebar {
  min-width: 0;
}

.report-sidebar {
  position: sticky;
  top: 74px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: calc(100vh - 98px);
  min-height: 640px;
  padding: 16px 14px;
  overflow: hidden;
}

.panel-title-row {
  justify-content: space-between;
  gap: 12px;
}

.panel-title-row h2 {
  margin: 0;
  font-size: 16px;
  line-height: 1.4;
}

.panel-title-row p {
  margin: 2px 0 0;
  color: var(--report-muted);
  font-size: 12px;
}

.icon-action {
  width: 34px;
  height: 34px;
  border: 1px solid #bdd5ff;
  border-radius: 6px;
  background: #f5f9ff;
  color: var(--report-blue);
}

.list-search {
  width: 100%;
  padding: 0 10px;
}

.status-tabs,
.tone-grid {
  display: grid;
  gap: 6px;
}

.status-tabs {
  grid-template-columns: repeat(4, 1fr);
}

.status-tabs button,
.tone-grid button {
  min-height: 32px;
  border-radius: 6px;
  background: transparent;
  color: #475467;
  font-size: 13px;
  font-weight: 700;
}

.status-tabs button.active,
.tone-grid button.active {
  background: var(--report-blue-soft);
  color: var(--report-blue);
}

.report-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.report-list-item {
  width: 100%;
  padding: 14px;
  border: 1px solid var(--report-line);
  border-radius: 7px;
  background: #fff;
  color: inherit;
  text-align: left;
}

.report-list-item.active {
  border-color: #6aa8ff;
  background: linear-gradient(180deg, #f4f9ff 0%, #ffffff 100%);
  box-shadow: inset 3px 0 0 var(--report-blue);
}

.report-list-head {
  justify-content: space-between;
  gap: 10px;
}

.report-list-head strong {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-list-head span,
.done-badge {
  border-radius: 999px;
  background: #ecfdf3;
  color: var(--report-green);
  font-size: 12px;
  font-weight: 800;
}

.report-list-head span {
  padding: 2px 8px;
  white-space: nowrap;
}

.report-list-item p,
.report-list-meta {
  margin: 8px 0 0;
  color: var(--report-muted);
  font-size: 12px;
}

.report-list-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.report-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-top: 4px;
  color: var(--report-muted);
  font-size: 13px;
}

.report-pagination button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.report-pagination button.active {
  background: var(--report-blue);
  color: #fff;
}

.editor-outline {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.editor-outline-link {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 7px 8px;
  border-radius: 6px;
  color: #344054;
  text-decoration: none;
  font-size: 13px;
}

.editor-outline-link .material-symbols-outlined {
  color: #667085;
  font-size: 18px;
}

.editor-outline-link.active,
.editor-outline-link:hover {
  background: var(--report-blue-soft);
  color: var(--report-blue);
}

.editor-outline-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--report-line);
  color: var(--report-muted);
  font-size: 12px;
}

.editor-outline-footer button {
  border: 0;
  background: transparent;
  color: var(--report-blue);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.report-main {
  overflow: hidden;
}

.document-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--report-line);
}

.title-line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.document-title h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.35;
}

.done-badge {
  padding: 3px 9px;
}

.document-title p {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin: 7px 0 0;
  color: var(--report-muted);
  font-size: 13px;
}

.document-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.report-tabs {
  display: flex;
  gap: 4px;
  padding: 0 24px;
  border-bottom: 1px solid var(--report-line);
  overflow-x: auto;
}

.report-tabs button {
  flex: 0 0 auto;
  height: 44px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #475467;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.report-tabs button.active {
  border-bottom-color: var(--report-blue);
  color: var(--report-blue);
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border-bottom: 1px solid var(--report-line);
  background: #fff;
  overflow-x: auto;
}

.editor-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 30px;
  padding: 0 9px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #344054;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
}

.editor-toolbar button:hover {
  background: #f2f4f7;
}

.editor-toolbar .material-symbols-outlined {
  font-size: 19px;
}

.toolbar-divider {
  width: 1px;
  height: 22px;
  margin: 0 4px;
  background: var(--report-line);
}

.summary-table {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
  margin: 22px 24px 10px;
  border: 1px solid var(--report-line);
  border-radius: 7px;
  overflow: hidden;
}

.summary-table div {
  min-width: 0;
  padding: 12px 14px;
  border-right: 1px solid var(--report-line);
  background: #fbfcfe;
}

.summary-table div:last-child {
  border-right: 0;
}

.summary-table span,
.summary-table strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-table span {
  color: var(--report-muted);
  font-size: 12px;
}

.summary-table strong {
  margin-top: 6px;
  font-size: 13px;
}

.document-body {
  padding: 10px 24px 30px;
}

.report-section {
  padding: 16px 0;
  border-bottom: 1px solid #edf1f6;
}

.report-section:last-child {
  border-bottom: 0;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
}

.section-heading h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.5;
}

.small-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #cfe0ff;
  border-radius: 6px;
  background: #fff;
  color: var(--report-blue);
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.markdown-content {
  color: #344054;
  font-size: 15px;
  line-height: 1.9;
}

.markdown-content :deep(p) {
  margin: 0 0 12px;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0 0 12px;
  padding-left: 22px;
}

.markdown-content :deep(li) {
  margin-bottom: 6px;
}

.markdown-content :deep(strong) {
  color: #111827;
}

.document-editable {
  min-height: 110px;
  padding: 4px 0 10px;
  border-radius: 6px;
  outline: 0;
  color: #344054;
  font-size: 15px;
  line-height: 1.9;
  white-space: pre-wrap;
}

.document-editable:focus {
  background: #f8fbff;
  box-shadow: inset 3px 0 0 #8bb7ff;
  padding-left: 12px;
}

.document-editable:empty::before {
  content: attr(data-placeholder);
  color: #98a2b3;
}

.insight-sidebar {
  position: sticky;
  top: 74px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 98px);
  overflow: auto;
}

.insight-sidebar .panel {
  padding: 16px;
}

.editing-mode .report-tabs,
.editing-mode .summary-table,
.editing-mode .recommendation-panel {
  display: none;
}

.editing-mode .document-body {
  padding-top: 18px;
}

.editing-mode .report-section {
  padding: 18px 0;
}

.editing-mode .report-section + .report-section {
  border-top: 1px solid #edf1f6;
}

.editing-mode .ai-panel {
  order: -2;
}

.editing-mode .reason-panel {
  order: -1;
}

.job-card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.job-card {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--report-line);
  border-radius: 7px;
  background: #fff;
}

.job-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: #e6f7f1;
  color: var(--report-green);
}

.accent-blue .job-icon {
  background: #eaf2ff;
  color: var(--report-blue);
}

.accent-teal .job-icon {
  background: #e6fffb;
  color: #0e9384;
}

.job-title-line {
  justify-content: space-between;
  gap: 8px;
}

.job-title-line strong {
  font-size: 14px;
}

.job-title-line span {
  color: var(--report-green);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.job-card p {
  margin: 5px 0 8px;
  color: var(--report-muted);
  font-size: 12px;
}

.job-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.job-tags span {
  padding: 3px 6px;
  border-radius: 4px;
  background: #f2f4f7;
  color: #475467;
  font-size: 11px;
}

.timeline {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
  padding-left: 18px;
}

.timeline::before {
  content: "";
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 6px;
  width: 2px;
  background: #d0d5dd;
}

.timeline-item {
  position: relative;
  padding: 11px 12px;
  border: 1px solid #c7eadb;
  border-radius: 7px;
  background: #f6fef9;
}

.timeline-item > span {
  position: absolute;
  top: 16px;
  left: -18px;
  width: 12px;
  height: 12px;
  border: 3px solid var(--report-green);
  border-radius: 999px;
  background: #fff;
}

.timeline-item strong {
  color: var(--report-green);
  font-size: 13px;
}

.timeline-item p {
  margin: 4px 0 0;
  color: #344054;
  font-size: 12px;
}

.timeline-item.orange {
  border-color: #fedf89;
  background: #fffbf5;
}

.timeline-item.orange > span {
  border-color: var(--report-orange);
}

.timeline-item.orange strong {
  color: var(--report-orange);
}

.timeline-item.yellow {
  border-color: #fde68a;
  background: #fffdf0;
}

.timeline-item.yellow > span {
  border-color: #eaaa08;
}

.timeline-item.yellow strong {
  color: #ca8504;
}

.timeline-item.blue {
  border-color: #b2ddff;
  background: #f5fbff;
}

.timeline-item.blue > span {
  border-color: var(--report-blue);
}

.timeline-item.blue strong {
  color: var(--report-blue);
}

.ai-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-panel .panel-title-row > .material-symbols-outlined {
  color: var(--report-blue);
}

.tone-grid {
  grid-template-columns: repeat(3, 1fr);
  margin-top: 4px;
}

.check-list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  color: #344054;
  font-size: 13px;
  line-height: 1.7;
}

.check-list li {
  position: relative;
  padding-left: 20px;
}

.check-list li + li {
  margin-top: 8px;
}

.check-list li::before {
  content: "check";
  position: absolute;
  left: 0;
  top: 1px;
  color: var(--report-green);
  font-family: "Material Symbols Outlined";
  font-size: 15px;
}

.export-file-card {
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 10px;
  width: 100%;
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid #edf1f6;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.export-file-card:last-of-type {
  border-bottom: 0;
}

.file-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #fef3f2;
  color: #d92d20;
  font-size: 11px;
  font-weight: 900;
}

.export-file-card strong,
.export-file-card small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.export-file-card strong {
  font-size: 12px;
}

.export-file-card small,
.muted-tip {
  color: var(--report-muted);
  font-size: 12px;
}

.text-link {
  color: var(--report-muted);
  background: transparent;
  text-decoration: none;
  font-size: 12px;
  font-weight: 800;
}

.button-link {
  padding: 0;
}

.empty-card,
.empty-document {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 34px 18px;
  border: 1px dashed var(--report-line);
  border-radius: 7px;
  color: var(--report-muted);
  text-align: center;
}

.empty-document {
  min-height: 520px;
  border: 0;
}

.empty-document .material-symbols-outlined,
.empty-card .material-symbols-outlined {
  color: #98a2b3;
  font-size: 42px;
}

.empty-document h2,
.empty-document p,
.empty-card p {
  margin: 0;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  color: var(--report-muted);
  font-size: 13px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #d0d5dd;
  border-top-color: var(--report-blue);
  border-radius: 999px;
  animation: spin 0.9s linear infinite;
}

.alert {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 1720px;
  margin: 0 auto 12px;
  padding: 11px 14px;
  border-radius: 7px;
  font-size: 14px;
}

.alert-error {
  border: 1px solid #fecdca;
  background: #fffbfa;
  color: #b42318;
}

.alert-success {
  border: 1px solid #abefc6;
  background: #f6fef9;
  color: #067647;
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1320px) {
  .report-workspace {
    grid-template-columns: 280px minmax(460px, 1fr) 290px;
  }

  .report-sidebar {
    height: calc(100vh - 98px);
    min-height: 600px;
  }

  .report-list {
    max-height: none;
  }

  .insight-sidebar {
    position: sticky;
    top: 74px;
    display: flex;
  }
}

@media (max-width: 1120px) {
  .control-strip,
  .document-header {
    align-items: stretch;
    flex-direction: column;
  }

  .report-workspace {
    grid-template-columns: 300px minmax(0, 1fr);
  }

  .insight-sidebar {
    position: static;
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: none;
  }

  .summary-table {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-table div {
    border-bottom: 1px solid var(--report-line);
  }
}

@media (max-width: 760px) {
  .report-container {
    padding: 12px;
  }

  .context-picker,
  .control-actions,
  .document-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .match-input {
    width: 100%;
  }

  .report-workspace {
    grid-template-columns: 1fr;
  }

  .report-sidebar {
    position: static;
    height: auto;
    min-height: 0;
  }

  .report-list {
    max-height: 420px;
  }

  .insight-sidebar {
    display: flex;
  }

  .summary-table {
    grid-template-columns: 1fr;
  }
}
</style>
