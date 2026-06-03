<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";

import type {
  DimensionKey,
  ManualJobPortraitRecord,
  MatchResultDetail,
  MatchResultSummary,
  StudentProfileRecord,
} from "@career/contracts/types";

import { fetchManualJobPortraits } from "@/shared/api/job-profiles";
import { createMatch, fetchMatchDetail, fetchMatchList } from "@/shared/api/matching";
import { ApiRequestError } from "@/shared/api/http";
import { fetchStudentProfiles } from "@/shared/api/profile";
import { profileName, profileTargetRole } from "@/features/profile/model/profile-selectors";

const router = useRouter();
const profiles = ref<StudentProfileRecord[]>([]);
const manualPortraits = ref<ManualJobPortraitRecord[]>([]);
const matches = ref<MatchResultSummary[]>([]);
const selectedDetail = ref<MatchResultDetail | null>(null);

const loading = reactive({
  bootstrap: false,
  create: false,
  agent: false,
  list: false,
  detail: false,
});

const createForm = reactive({
  studentProfileId: "",
  jobKey: "",
  forceRecalculate: false,
});

const queryForm = reactive({
  studentProfileId: "",
  jobKey: "",
  offset: 0,
  limit: 20,
});

const uiState = reactive({
  error: "",
  success: "",
});

const targetJobs = computed(() => {
  // 核心约束：目标岗位必须是已经构建了岗位画像的计算机相关岗位
  // 这里通过 fetchManualJobPortraits 获取，它本身就是流水线清洗后的计算机岗位子集
  return manualPortraits.value.map((p) => ({
    jobName: p.job_name,
    key: p.job_name,
    title: portraitDisplayName(p),
    category: p.category,
  }));
});

const DIMENSION_META: Record<
  DimensionKey,
  {
    label: string;
    shortLabel: string;
    description: string;
    accent: string;
  }
> = {
  base_requirements: {
    label: "基础要求",
    shortLabel: "基础",
    description: "学历、证书、实习等硬性门槛",
    accent: "#2f7dd3",
  },
  professional_skills: {
    label: "职业技能",
    shortLabel: "技能",
    description: "岗位核心技能与项目证明",
    accent: "#0f9f8f",
  },
  professional_quality: {
    label: "职业素养",
    shortLabel: "素养",
    description: "沟通、协作、抗压等工作质量",
    accent: "#a7651a",
  },
  development_potential: {
    label: "发展潜力",
    shortLabel: "潜力",
    description: "学习能力、竞赛项目与成长信号",
    accent: "#7f62c9",
  },
};

const DIMENSION_ORDER: DimensionKey[] = [
  "base_requirements",
  "professional_skills",
  "professional_quality",
  "development_potential",
];

const canCreate = computed(() => {
  return (
    toPositiveInt(createForm.studentProfileId) !== undefined && selectedCreateTarget.value !== null
  );
});

const selectedCreateTarget = computed(() => {
  return targetJobs.value.find((job) => job.key === createForm.jobKey) ?? null;
});

const selectedQueryTarget = computed(() => {
  return targetJobs.value.find((job) => job.key === queryForm.jobKey) ?? null;
});

const selectedDimensionCards = computed(() => {
  const detail = selectedDetail.value;
  if (!detail) {
    return [];
  }

  return DIMENSION_ORDER.map((key) => {
    const score = detail.dimension_scores[key];
    return {
      key,
      score,
      tone: scoreTone(score),
      ...DIMENSION_META[key],
    };
  });
});

const selectedScoreTone = computed(() => {
  const score = selectedDetail.value?.total_score ?? 0;
  if (score >= 90) return "高度匹配";
  if (score >= 80) return "优势明显";
  if (score >= 70) return "基本匹配";
  if (score >= 60) return "需要补强";
  return "优先重建";
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

function scoreTone(score: number): string {
  if (score >= 90) return "excellent";
  if (score >= 80) return "good";
  if (score >= 70) return "watch";
  return "risk";
}

function dimensionLabel(key: DimensionKey): string {
  return DIMENSION_META[key]?.label ?? key;
}

function normalizeJobName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[（）()【】\[\]\s._-]+/g, "");
}

function portraitDisplayName(item: ManualJobPortraitRecord): string {
  return item.profile_detail.name.trim() || item.job_name.trim();
}

function resolveMatchJobTitle(match: MatchResultSummary | MatchResultDetail): string {
  return match.job_title || match.job_portrait_name || "岗位画像";
}

function syncTargetJobFromProfile(): void {
  const profileId = toPositiveInt(createForm.studentProfileId);
  if (!profileId) {
    return;
  }

  const profile = profiles.value.find((item) => item.id === profileId);
  const targetRole = profile ? profileTargetRole(profile).trim() : "";
  if (!targetRole) {
    return;
  }

  const normalizedTargetRole = normalizeJobName(targetRole);
  if (!normalizedTargetRole) {
    return;
  }

  const matchedJob =
    targetJobs.value.find((job) => normalizeJobName(job.title) === normalizedTargetRole) ||
    targetJobs.value.find((job) => {
      const normalizedTitle = normalizeJobName(job.title);
      return (
        normalizedTitle.includes(normalizedTargetRole) ||
        normalizedTargetRole.includes(normalizedTitle)
      );
    });

  if (matchedJob) {
    createForm.jobKey = matchedJob.key;
  }
}

async function bootstrap(): Promise<void> {
  loading.bootstrap = true;
  uiState.error = "";

  try {
    const [profileResponse, portraitResponse] = await Promise.all([
      fetchStudentProfiles(),
      fetchManualJobPortraits(),
    ]);

    profiles.value = profileResponse.items;
    manualPortraits.value = portraitResponse.items;

    if (!createForm.studentProfileId && profiles.value[0]) {
      createForm.studentProfileId = String(profiles.value[0].id);
      queryForm.studentProfileId = String(profiles.value[0].id);
    }

    if (!createForm.jobKey && targetJobs.value[0]) {
      createForm.jobKey = targetJobs.value[0].key;
      queryForm.jobKey = targetJobs.value[0].key;
    }

    syncTargetJobFromProfile();
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
      job_portrait_name: selectedQueryTarget.value?.jobName,
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
  const jobPortraitName = selectedCreateTarget.value?.jobName;
  if (!studentProfileId || !jobPortraitName) {
    uiState.error = "请选择学生画像和岗位";
    return;
  }

  loading.create = true;
  uiState.error = "";
  uiState.success = "";

  try {
    const detail = await createMatch({
      student_profile_id: studentProfileId,
      job_portrait_name: jobPortraitName,
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
  createForm.jobKey = selectedDetail.value.job_portrait_name;
  createForm.forceRecalculate = false;
  await submitCreateMatch();
}

function goToReport(matchId: number): void {
  router.push({
    path: "/report",
    query: {
      match_id: String(matchId),
      create_report: "1",
    },
  });
}

onMounted(async () => {
  await bootstrap();
  await loadMatches();
});

watch(
  () => createForm.studentProfileId,
  () => {
    syncTargetJobFromProfile();
  },
);
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
              #{{ profile.id }} {{ profileName(profile) }}（{{
                profileTargetRole(profile) || "暂未选择目标岗位"
              }}）
            </option>
          </select>
        </label>

        <label>
          目标岗位
          <select v-model="createForm.jobKey" :disabled="loading.bootstrap || loading.create">
            <option value="">请选择</option>
            <option v-for="job in targetJobs" :key="job.key" :value="job.key">
              {{ job.title }}
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
        :disabled="!canCreate || loading.create || loading.agent"
        @click="submitCreateMatch"
      >
        {{ loading.create ? "分析中..." : "开始匹配分析" }}
      </button>
    </section>

    <section v-if="selectedDetail" class="match-detail-panel">
      <div class="detail-hero">
        <div class="score-orb" :style="{ '--score': `${selectedDetail.total_score}%` }">
          <span>总分</span>
          <strong>{{ selectedDetail.total_score }}</strong>
          <em>{{ selectedScoreTone }}</em>
        </div>

        <div class="detail-heading">
          <div class="panel-title-row">
            <div>
              <p class="eyebrow">Match Assessment</p>
              <h3>
                匹配详情 #{{ selectedDetail.id }} ·
                {{ resolveMatchJobTitle(selectedDetail) }}
              </h3>
            </div>
            <span v-if="selectedDetail.from_cache" class="cache-tag">from_cache</span>
          </div>
          <p class="detail-summary">
            该结果由岗位画像、学生画像和证据覆盖率共同计算，重点关注技能命中、差距动作和可执行路径。
          </p>
        </div>
      </div>

      <div class="dimension-board">
        <article
          v-for="card in selectedDimensionCards"
          :key="card.key"
          class="dimension-card"
          :class="`tone-${card.tone}`"
          :style="{ '--accent': card.accent, '--score': `${card.score}%` }"
        >
          <div class="dimension-card-head">
            <span>{{ card.shortLabel }}</span>
            <strong>{{ card.score }}</strong>
          </div>
          <h4>{{ card.label }}</h4>
          <p>{{ card.description }}</p>
          <div class="metric-track">
            <span />
          </div>
        </article>
      </div>

      <div class="detail-grid">
        <section class="insight-card gaps-card">
          <div class="section-title">
            <span>01</span>
            <h4>差距诊断</h4>
          </div>
          <div class="gap-list">
            <article v-for="gap in selectedDetail.gaps" :key="gap.dimension" class="gap-item">
              <div class="gap-topline">
                <strong>{{ dimensionLabel(gap.dimension) }}</strong>
                <span>差距 {{ gap.gap }}</span>
              </div>
              <div class="gap-numbers">
                <span>当前 {{ gap.current_score }}</span>
                <span>目标 {{ gap.target_score }}</span>
              </div>
              <div class="gap-track">
                <span :style="{ width: `${gap.current_score}%` }" />
              </div>
              <p v-for="evidence in gap.evidence.slice(0, 2)" :key="evidence">
                {{ evidence }}
              </p>
            </article>
          </div>
        </section>

        <section class="insight-card action-card">
          <div class="section-title">
            <span>02</span>
            <h4>行动建议</h4>
          </div>
          <ol class="action-list">
            <li v-for="item in selectedDetail.suggestions" :key="item">{{ item }}</li>
          </ol>
        </section>
      </div>

      <section class="insight-card explanation-card">
        <div class="section-title">
          <span>03</span>
          <h4>维度解释</h4>
        </div>
        <div class="explanation-grid">
          <article
            v-for="item in selectedDetail.explanations"
            :key="item.dimension"
            class="explanation-item"
          >
            <h5>{{ dimensionLabel(item.dimension) }}</h5>
            <p>{{ item.reasoning }}</p>
          </article>
        </div>
      </section>

      <div class="detail-actions">
        <button class="ghost-btn" :disabled="loading.create" @click="repeatAnalyze">
          重复分析（验证一致性）
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
              #{{ profile.id }} {{ profileName(profile) }}
            </option>
          </select>
        </label>

        <label>
          按岗位筛选
          <select v-model="queryForm.jobKey" :disabled="loading.list">
            <option value="">全部</option>
            <option v-for="job in targetJobs" :key="job.key" :value="job.key">
              {{ job.title }}
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
            <td>{{ resolveMatchJobTitle(item) }}</td>
            <td>{{ item.total_score }}</td>
            <td>{{ new Date(item.created_at).toLocaleString() }}</td>
            <td>
              <div class="table-actions">
                <button class="table-btn" :disabled="loading.detail" @click="openDetail(item.id)">
                  详情
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
  gap: 16px;
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

.match-detail-panel {
  position: relative;
  overflow: hidden;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.68);
  border-radius: 28px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.86), rgba(232, 246, 255, 0.5)),
    radial-gradient(circle at 16% 12%, rgba(52, 125, 211, 0.12), transparent 32%),
    radial-gradient(circle at 92% 18%, rgba(15, 159, 143, 0.12), transparent 30%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.84),
    0 28px 58px rgba(37, 65, 111, 0.14);
  display: grid;
  gap: 18px;
}

.match-detail-panel::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(27, 54, 92, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(27, 54, 92, 0.05) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: linear-gradient(135deg, rgba(0, 0, 0, 0.38), transparent 62%);
}

.detail-hero,
.dimension-board,
.detail-grid,
.insight-card,
.detail-actions {
  position: relative;
  z-index: 1;
}

.detail-hero {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 22px;
  align-items: center;
}

.score-orb {
  --score: 0%;
  width: 168px;
  aspect-ratio: 1;
  border-radius: 999px;
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.96) 0 57%, transparent 58%),
    conic-gradient(#0f9f8f var(--score), rgba(26, 54, 91, 0.12) 0);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 22px 38px rgba(33, 76, 129, 0.16);
  display: grid;
  place-items: center;
  align-content: center;
  color: #132a47;
}

.score-orb span,
.score-orb em {
  font-size: 12px;
  font-style: normal;
  color: rgba(29, 53, 86, 0.64);
}

.score-orb strong {
  line-height: 0.95;
  font-size: 52px;
  font-family: "DIN Alternate", "Avenir Next", "PingFang SC", sans-serif;
  letter-spacing: 0;
}

.detail-heading h3 {
  margin: 0;
  font-size: 30px;
  letter-spacing: 0;
}

.eyebrow {
  margin: 0 0 4px;
  color: rgba(15, 119, 131, 0.82);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.detail-summary {
  max-width: 760px;
  margin: 12px 0 0;
  color: rgba(31, 54, 86, 0.72);
  line-height: 1.8;
}

.dimension-board {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.dimension-card {
  --score: 0%;
  --accent: #2f7dd3;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.66);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.76),
    0 14px 26px rgba(42, 71, 118, 0.08);
}

.dimension-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  color: var(--accent);
  font-weight: 800;
}

.dimension-card-head strong {
  font-size: 28px;
  font-family: "DIN Alternate", "Avenir Next", "PingFang SC", sans-serif;
}

.dimension-card h4,
.insight-card h4 {
  margin: 8px 0 0;
  color: #132a47;
}

.dimension-card p {
  min-height: 44px;
  margin: 6px 0 12px;
  color: rgba(31, 54, 86, 0.66);
  line-height: 1.55;
  font-size: 13px;
}

.metric-track,
.gap-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(30, 58, 96, 0.1);
}

.metric-track span,
.gap-track span {
  display: block;
  height: 100%;
  width: var(--score);
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), rgba(255, 255, 255, 0.78));
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: 14px;
}

.insight-card {
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.68);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.64);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.74),
    0 16px 30px rgba(42, 71, 118, 0.08);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.section-title span {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #132a47;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
}

.gap-list,
.explanation-grid {
  display: grid;
  gap: 10px;
}

.gap-item,
.explanation-item {
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(224, 233, 246, 0.86);
  background: rgba(255, 255, 255, 0.58);
}

.gap-topline,
.gap-numbers {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.gap-topline strong {
  color: #132a47;
}

.gap-topline span {
  color: #9f3f24;
  font-weight: 800;
}

.gap-numbers {
  margin-top: 6px;
  color: rgba(31, 54, 86, 0.64);
  font-size: 13px;
}

.gap-track {
  margin: 9px 0;
}

.gap-track span {
  --accent: #0f9f8f;
}

.gap-item p,
.explanation-item p,
.empty-note {
  margin: 6px 0 0;
  color: rgba(31, 54, 86, 0.7);
  line-height: 1.65;
}

.action-list {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
  list-style: none;
  counter-reset: action;
}

.action-list li {
  counter-increment: action;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  color: #132a47;
  line-height: 1.7;
}

.action-list li::before {
  content: counter(action);
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(15, 159, 143, 0.14);
  color: #0b756d;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
}

.explanation-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.explanation-item h5 {
  margin: 0;
  color: #132a47;
  font-size: 15px;
}

.detail-actions,
.table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-actions {
  padding-top: 2px;
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

  .detail-hero,
  .detail-grid,
  .explanation-grid {
    grid-template-columns: 1fr;
  }

  .score-orb {
    width: 148px;
  }

  .dimension-board {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .result-table {
    display: block;
    overflow-x: auto;
  }
}

@media (max-width: 560px) {
  .match-detail-panel {
    padding: 18px;
  }

  .dimension-board {
    grid-template-columns: 1fr;
  }

  .panel-title-row,
  .gap-topline,
  .gap-numbers {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
