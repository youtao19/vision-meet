<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import type {
  ManualJobPortraitRecord,
  MatchResultDetail,
  MatchResultSummary,
  StudentProfileRecord,
} from "@career/contracts/types";

import { fetchManualJobPortraits } from "@/shared/api/job-profiles";
import { createMatch, fetchMatchDetail, fetchMatchList } from "@/shared/api/matching";
import { ApiRequestError } from "@/shared/api/http";
import { fetchStudentProfiles } from "@/shared/api/profile";

const router = useRouter();
const profiles = ref<StudentProfileRecord[]>([]);
const jobPortraits = ref<ManualJobPortraitRecord[]>([]);
const matches = ref<MatchResultSummary[]>([]);
const selectedDetail = ref<MatchResultDetail | null>(null);

const loading = reactive({
  bootstrap: false,
  create: false,
  list: false,
  detail: false,
});

const createForm = reactive({
  studentProfileId: "",
  jobId: "",
  forceRecalculate: false,
});

const queryForm = reactive({
  studentProfileId: "",
  jobId: "",
  offset: 0,
  limit: 20,
});

const uiState = reactive({
  error: "",
  success: "",
});

const canCreate = computed(() => {
  return (
    toPositiveInt(createForm.studentProfileId) !== undefined &&
    toPositiveInt(createForm.jobId) !== undefined
  );
});

function toPositiveInt(raw: string): number | undefined {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
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

async function bootstrap(): Promise<void> {
  loading.bootstrap = true;
  uiState.error = "";

  try {
    const [profileResponse, portraitsResponse] = await Promise.all([
      fetchStudentProfiles(),
      fetchManualJobPortraits(),
    ]);

    profiles.value = profileResponse.items;
    jobPortraits.value = portraitsResponse.items;

    if (!createForm.studentProfileId && profiles.value[0]) {
      createForm.studentProfileId = String(profiles.value[0].id);
      queryForm.studentProfileId = String(profiles.value[0].id);
    }

    if (!createForm.jobId && jobPortraits.value[0]?.job_id) {
      createForm.jobId = String(jobPortraits.value[0].job_id);
      queryForm.jobId = String(jobPortraits.value[0].job_id);
    }
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.bootstrap = false;
  }
}

async function loadMatches(): Promise<void> {
  loading.list = true;
  uiState.error = "";

  try {
    const response = await fetchMatchList({
      student_profile_id: toPositiveInt(queryForm.studentProfileId),
      job_id: toPositiveInt(queryForm.jobId),
      offset: queryForm.offset,
      limit: queryForm.limit,
    });

    matches.value = response.items;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.list = false;
  }
}

async function submitCreateMatch(): Promise<void> {
  const studentProfileId = toPositiveInt(createForm.studentProfileId);
  const jobId = toPositiveInt(createForm.jobId);
  if (!studentProfileId || !jobId) {
    uiState.error = "请选择学生画像和岗位";
    return;
  }

  loading.create = true;
  uiState.error = "";
  uiState.success = "";

  try {
    const detail = await createMatch({
      student_profile_id: studentProfileId,
      job_id: jobId,
      force_recalculate: createForm.forceRecalculate,
    });

    selectedDetail.value = detail;
    uiState.success = detail.from_cache
      ? "命中历史结果，已返回可复用匹配结论"
      : "已完成匹配分析并生成新结果";

    await loadMatches();
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.create = false;
  }
}

async function openDetail(matchId: number): Promise<void> {
  loading.detail = true;
  uiState.error = "";

  try {
    selectedDetail.value = await fetchMatchDetail(matchId);
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.detail = false;
  }
}

async function repeatAnalyze(): Promise<void> {
  if (!selectedDetail.value) {
    return;
  }

  createForm.studentProfileId = String(selectedDetail.value.student_profile_id);
  createForm.jobId = String(selectedDetail.value.job_id);
  createForm.forceRecalculate = false;
  await submitCreateMatch();
}

function goToReport(matchId: number): void {
  router.push({
    path: "/report",
    query: {
      match_id: String(matchId),
    },
  });
}

function goToCareerPath(jobId: number, studentProfileId?: number): void {
  router.push({
    path: "/career-paths",
    query: {
      job_id: String(jobId),
      ...(studentProfileId ? { student_profile_id: String(studentProfileId) } : {}),
      depth: "2",
    },
  });
}

onMounted(async () => {
  await bootstrap();
  await loadMatches();
});
</script>

<template>
  <section class="matching-page">
    <header class="page-header">
      <h2>人岗匹配分析</h2>
      <p>支持创建匹配、查询历史结果、查看详情解释与重复分析。</p>
    </header>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice notice-success">{{ uiState.success }}</p>

    <section class="panel">
      <h3>发起匹配</h3>
      <div class="grid two-col">
        <label>
          学生画像
          <select
            v-model="createForm.studentProfileId"
            :disabled="loading.bootstrap || loading.create"
          >
            <option value="">请选择</option>
            <option v-for="profile in profiles" :key="profile.id" :value="String(profile.id)">
              #{{ profile.id }} {{ profile.name }}（{{ profile.target_role }}）
            </option>
          </select>
        </label>

        <label>
          目标岗位
          <select v-model="createForm.jobId" :disabled="loading.bootstrap || loading.create">
            <option value="">请选择</option>
            <option
              v-for="portrait in jobPortraits"
              :key="portrait.job_id ?? `${portrait.job_name}-${portrait.category}`"
              :value="String(portrait.job_id)"
            >
              #{{ portrait.job_id }} {{ portrait.job_name }}
            </option>
          </select>
        </label>
      </div>

      <label class="checkbox-row">
        <input v-model="createForm.forceRecalculate" type="checkbox" :disabled="loading.create" />
        强制重算（忽略缓存）
      </label>

      <button
        class="primary-btn"
        :disabled="!canCreate || loading.create"
        @click="submitCreateMatch"
      >
        {{ loading.create ? "分析中..." : "开始匹配分析" }}
      </button>
    </section>

    <section v-if="selectedDetail" class="panel">
      <div class="panel-title-row">
        <h3>匹配详情 #{{ selectedDetail.id }}</h3>
        <span v-if="selectedDetail.from_cache" class="cache-tag">from_cache</span>
      </div>

      <p class="score-line">
        总分：<strong>{{ selectedDetail.total_score }}</strong>
      </p>

      <ul class="score-grid">
        <li>基础要求：{{ selectedDetail.dimension_scores.base_requirements }}</li>
        <li>职业技能：{{ selectedDetail.dimension_scores.professional_skills }}</li>
        <li>职业素养：{{ selectedDetail.dimension_scores.professional_quality }}</li>
        <li>发展潜力：{{ selectedDetail.dimension_scores.development_potential }}</li>
      </ul>

      <div class="sub-panel">
        <h4>差距项</h4>
        <ul>
          <li v-for="gap in selectedDetail.gaps" :key="gap.dimension">
            {{ gap.dimension }}：当前 {{ gap.current_score }} / 目标 {{ gap.target_score }}（差距
            {{ gap.gap }}）
          </li>
        </ul>
      </div>

      <div class="sub-panel">
        <h4>建议</h4>
        <ul>
          <li v-for="item in selectedDetail.suggestions" :key="item">{{ item }}</li>
        </ul>
      </div>

      <div class="sub-panel">
        <h4>证据引用</h4>
        <ul>
          <li v-for="item in selectedDetail.evidence_refs" :key="item">{{ item }}</li>
        </ul>
      </div>

      <div class="sub-panel">
        <h4>路径建议</h4>
        <ul>
          <li v-for="item in selectedDetail.path_recommendations" :key="item.route_id">
            {{ item.title }}（适配度 {{ item.suitability_score }}）
          </li>
        </ul>
      </div>

      <div class="action-row">
        <button class="ghost-btn" :disabled="loading.create" @click="repeatAnalyze">
          重复分析（验证一致性）
        </button>
        <button
          class="ghost-btn"
          @click="goToCareerPath(selectedDetail.job_id, selectedDetail.student_profile_id)"
        >
          查看路径规划
        </button>
        <button class="primary-btn" @click="goToReport(selectedDetail.id)">生成/查看报告</button>
      </div>
    </section>

    <section class="panel">
      <h3>历史结果查询</h3>
      <div class="grid two-col">
        <label>
          按学生画像筛选
          <select v-model="queryForm.studentProfileId" :disabled="loading.list">
            <option value="">全部</option>
            <option v-for="profile in profiles" :key="profile.id" :value="String(profile.id)">
              #{{ profile.id }} {{ profile.name }}
            </option>
          </select>
        </label>

        <label>
          按岗位筛选
          <select v-model="queryForm.jobId" :disabled="loading.list">
            <option value="">全部</option>
            <option
              v-for="portrait in jobPortraits"
              :key="portrait.job_id ?? `${portrait.job_name}-${portrait.category}`"
              :value="String(portrait.job_id)"
            >
              #{{ portrait.job_id }} {{ portrait.job_name }}
            </option>
          </select>
        </label>
      </div>

      <button class="ghost-btn" :disabled="loading.list" @click="loadMatches">
        {{ loading.list ? "查询中..." : "刷新列表" }}
      </button>

      <table class="result-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>学生画像</th>
            <th>岗位</th>
            <th>总分</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in matches" :key="item.id">
            <td>{{ item.id }}</td>
            <td>{{ item.student_profile_id }}</td>
            <td>{{ item.job_id }}</td>
            <td>{{ item.total_score }}</td>
            <td>{{ new Date(item.created_at).toLocaleString() }}</td>
            <td>
              <div class="table-actions">
                <button class="table-btn" :disabled="loading.detail" @click="openDetail(item.id)">
                  详情
                </button>
                <button
                  class="table-btn"
                  @click="goToCareerPath(item.job_id, item.student_profile_id)"
                >
                  路径
                </button>
                <button class="table-btn" @click="goToReport(item.id)">报告</button>
              </div>
            </td>
          </tr>
          <tr v-if="matches.length === 0">
            <td colspan="6" class="empty-row">暂无匹配记录</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<style scoped>
.matching-page {
  --page-panel: linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.24));
  --page-panel-strong: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.82),
    rgba(231, 245, 255, 0.36)
  );
  max-width: 1120px;
  margin: 24px auto;
  display: grid;
  gap: 18px;
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

.notice {
  margin: 0;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.56);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
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
    inset 0 1px 0 rgba(255, 255, 255, 0.76),
    0 18px 36px rgba(44, 73, 127, 0.1);
}

.panel h3 {
  margin: 0 0 14px;
  color: var(--glass-title);
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
}

.grid {
  display: grid;
  gap: 12px;
}

.two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

label {
  display: grid;
  gap: 8px;
  color: rgba(28, 48, 82, 0.84);
  font-weight: 600;
}

select,
input[type="text"] {
  border: 1px solid rgba(255, 255, 255, 0.64);
  border-radius: 16px;
  padding: 10px 12px;
  font-size: 14px;
  color: #16304e;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.34));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.76),
    0 10px 22px rgba(61, 90, 152, 0.06);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

select:focus,
input[type="text"]:focus {
  outline: none;
  border-color: rgba(89, 178, 255, 0.92);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 0 0 3px rgba(91, 164, 255, 0.14);
}

.checkbox-row {
  margin: 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.primary-btn,
.ghost-btn,
.table-btn {
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
  color: #ffffff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 16px 28px rgba(45, 99, 203, 0.22);
}

.ghost-btn,
.table-btn {
  border: 1px solid rgba(255, 255, 255, 0.62);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.32));
  color: #16304e;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 10px 20px rgba(46, 74, 118, 0.08);
}

.primary-btn:hover,
.ghost-btn:hover,
.table-btn:hover {
  transform: translateY(-1px);
}

.primary-btn:disabled,
.ghost-btn:disabled,
.table-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cache-tag {
  display: inline-block;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.86), rgba(226, 255, 235, 0.5));
  color: #2d6a35;
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid rgba(179, 236, 191, 0.82);
}

.score-line {
  margin: 10px 0;
  color: #17314e;
}

.score-grid {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
  color: rgba(33, 53, 85, 0.82);
}

.sub-panel {
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: 18px;
  background: var(--page-panel-strong);
  border: 1px solid rgba(255, 255, 255, 0.62);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.74);
}

.sub-panel h4 {
  margin: 0 0 8px;
  color: var(--glass-title);
}

.action-row,
.table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.result-table {
  width: 100%;
  margin-top: 14px;
  border-collapse: separate;
  border-spacing: 0;
  overflow: hidden;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.42);
}

.result-table th,
.result-table td {
  border-bottom: 1px solid rgba(255, 255, 255, 0.44);
  padding: 12px 10px;
  text-align: left;
  font-size: 14px;
}

.result-table th {
  background: rgba(255, 255, 255, 0.4);
  color: rgba(28, 48, 82, 0.8);
  font-weight: 700;
}

.empty-row {
  text-align: center;
  color: rgba(56, 80, 116, 0.74);
}

@media (max-width: 860px) {
  .two-col {
    grid-template-columns: 1fr;
  }

  .result-table {
    display: block;
    overflow-x: auto;
  }
}
</style>
