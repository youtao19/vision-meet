<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";

import type {
  JobRecord,
  MatchResultDetail,
  MatchResultSummary,
  StudentProfileRecord,
} from "@career/contracts/types";

import { fetchJobs } from "@/shared/api/jobs";
import { createMatch, fetchMatchDetail, fetchMatchList } from "@/shared/api/matching";
import { ApiRequestError } from "@/shared/api/http";
import { fetchStudentProfiles } from "@/shared/api/profile";

const profiles = ref<StudentProfileRecord[]>([]);
const jobs = ref<JobRecord[]>([]);
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
  return toPositiveInt(createForm.studentProfileId) !== undefined && toPositiveInt(createForm.jobId) !== undefined;
});

function toPositiveInt(raw: string): number | undefined {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.traceId
      ? `${error.message}（trace_id: ${error.traceId}）`
      : error.message;
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
    const [profileResponse, jobsResponse] = await Promise.all([
      fetchStudentProfiles(),
      fetchJobs(50),
    ]);

    profiles.value = profileResponse.items;
    jobs.value = jobsResponse.items;

    if (!createForm.studentProfileId && profiles.value[0]) {
      createForm.studentProfileId = String(profiles.value[0].id);
      queryForm.studentProfileId = String(profiles.value[0].id);
    }

    if (!createForm.jobId && jobs.value[0]) {
      createForm.jobId = String(jobs.value[0].id);
      queryForm.jobId = String(jobs.value[0].id);
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
          <select v-model="createForm.studentProfileId" :disabled="loading.bootstrap || loading.create">
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
            <option v-for="job in jobs" :key="job.id" :value="String(job.id)">
              #{{ job.id }} {{ job.title }}
            </option>
          </select>
        </label>
      </div>

      <label class="checkbox-row">
        <input v-model="createForm.forceRecalculate" type="checkbox" :disabled="loading.create" />
        强制重算（忽略缓存）
      </label>

      <button class="primary-btn" :disabled="!canCreate || loading.create" @click="submitCreateMatch">
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
            {{ gap.dimension }}：当前 {{ gap.current_score }} / 目标 {{ gap.target_score }}（差距 {{ gap.gap }}）
          </li>
        </ul>
      </div>

      <div class="sub-panel">
        <h4>建议</h4>
        <ul>
          <li v-for="item in selectedDetail.suggestions" :key="item">{{ item }}</li>
        </ul>
      </div>

      <button class="ghost-btn" :disabled="loading.create" @click="repeatAnalyze">重复分析（验证一致性）</button>
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
            <option v-for="job in jobs" :key="job.id" :value="String(job.id)">
              #{{ job.id }} {{ job.title }}
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
              <button class="table-btn" :disabled="loading.detail" @click="openDetail(item.id)">详情</button>
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
  max-width: 1060px;
  margin: 24px auto;
  display: grid;
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

.grid {
  display: grid;
  gap: 12px;
}

.two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

label {
  display: grid;
  gap: 6px;
  color: #334155;
}

select,
input[type="text"] {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
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
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
}

.primary-btn {
  border: 1px solid #0f766e;
  background: #0f766e;
  color: #ffffff;
}

.ghost-btn,
.table-btn {
  border: 1px solid #94a3b8;
  background: #f8fafc;
  color: #0f172a;
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
  background: #ecfccb;
  color: #3f6212;
  padding: 2px 10px;
  font-size: 12px;
}

.score-line {
  margin: 8px 0;
}

.score-grid {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 4px;
}

.sub-panel {
  margin-top: 12px;
}

.sub-panel h4 {
  margin: 0 0 6px;
}

.result-table {
  width: 100%;
  margin-top: 12px;
  border-collapse: collapse;
}

.result-table th,
.result-table td {
  border-bottom: 1px solid #e2e8f0;
  padding: 8px;
  text-align: left;
  font-size: 14px;
}

.empty-row {
  text-align: center;
  color: #64748b;
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
