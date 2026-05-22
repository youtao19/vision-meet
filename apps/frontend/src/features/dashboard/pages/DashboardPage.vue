<script setup lang="ts">
/**
 * 文件作用：系统仪表盘首页。
 * 职责说明：聚合学生画像、岗位画像和匹配结果的真实后端数据，只负责展示入口与关键状态，不在本页改写业务数据。
 */
import type {
  ManualJobPortraitRecord,
  MatchResultSummary,
  StudentProfileRecord,
} from "@career/contracts/types";
import { computed, onMounted, ref } from "vue";

import { fetchManualJobPortraits } from "@/shared/api/job-profiles";
import { fetchMatchList } from "@/shared/api/matching";
import { fetchStudentProfiles } from "@/shared/api/profile";
import {
  profileCertificateNames,
  profileCompleteness,
  profileCompetitiveness,
  profileGraduationYear,
  profileMajor,
  profileName,
  profileSkillNames,
  profileTargetRole,
} from "@/features/profile/model/profile-selectors";

const loading = ref(true);
const loadError = ref("");
const profiles = ref<StudentProfileRecord[]>([]);
const portraits = ref<ManualJobPortraitRecord[]>([]);
const matches = ref<MatchResultSummary[]>([]);

const latestProfile = computed(() => profiles.value[0]);
const latestMatch = computed(() => matches.value[0]);

const averageMatchScore = computed(() => {
  if (!matches.value.length) return 0;
  const total = matches.value.reduce((sum, item) => sum + item.total_score, 0);
  return Math.round(total / matches.value.length);
});

const averageCompleteness = computed(() => {
  if (!profiles.value.length) return 0;
  const total = profiles.value.reduce((sum, item) => sum + profileCompleteness(item), 0);
  return Math.round(total / profiles.value.length);
});

const topPortraits = computed(() => portraits.value.slice(0, 5));
const recentMatches = computed(() => matches.value.slice(0, 5));
const recommendedJobs = computed(() => portraits.value.slice(0, 6));
const isInitialLoading = computed(
  () => loading.value && !profiles.value.length && !portraits.value.length && !matches.value.length,
);

const metricCards = computed(() => [
  {
    label: "学生画像",
    value: profiles.value.length,
    suffix: "份",
    trend: `平均完整度 ${averageCompleteness.value}%`,
    icon: "person",
    to: "/profile",
  },
  {
    label: "岗位画像",
    value: portraits.value.length,
    suffix: "个",
    trend: "来自岗位画像中心",
    icon: "badge",
    to: "/job-profiles",
  },
  {
    label: "匹配记录",
    value: matches.value.length,
    suffix: "条",
    trend: `平均匹配度 ${averageMatchScore.value}%`,
    icon: "compare_arrows",
    to: "/matching",
  },
  {
    label: "路径图谱",
    value: portraits.value.filter((item) => item.job_id).length,
    suffix: "个",
    trend: "可进入晋升/转岗分析",
    icon: "route",
    to: "/career-paths",
  },
]);

function formatDate(value?: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function scoreLabel(score: number): string {
  if (score >= 90) return "高度匹配";
  if (score >= 75) return "基本匹配";
  if (score >= 60) return "需要补强";
  return "差距较大";
}

function portraitScore(item: ManualJobPortraitRecord): number {
  const dimensions = [
    item.skills,
    item.certification,
    item.innovation,
    item.learning,
    item.stress,
    item.communication,
    item.experience,
  ];
  const total = dimensions.reduce((sum, dimension) => sum + dimension.level, 0);
  return Math.round(total / dimensions.length);
}

async function loadDashboard(): Promise<void> {
  loading.value = true;
  loadError.value = "";

  const [profileResult, portraitResult, matchResult] = await Promise.allSettled([
    fetchStudentProfiles(),
    fetchManualJobPortraits(),
    fetchMatchList({ offset: 0, limit: 20 }),
  ]);

  // 首页是总览入口，单个接口失败不应拖垮整页；成功的数据仍然展示。
  if (profileResult.status === "fulfilled") {
    profiles.value = profileResult.value.items;
  }
  if (portraitResult.status === "fulfilled") {
    portraits.value = portraitResult.value.items;
  }
  if (matchResult.status === "fulfilled") {
    matches.value = matchResult.value.items;
  }

  const failedCount = [profileResult, portraitResult, matchResult].filter(
    (result) => result.status === "rejected",
  ).length;
  if (failedCount > 0) {
    loadError.value = `有 ${failedCount} 个数据源暂时不可用，已展示可读取的数据。`;
  }

  loading.value = false;
}

onMounted(() => {
  void loadDashboard();
});
</script>

<template>
  <section class="dashboard-page">
    <div class="dashboard-head">
      <div>
        <p class="eyebrow">职业规划系统</p>
        <h2>综合仪表盘</h2>
        <p class="dashboard-desc">聚合画像构建、岗位画像、路径图谱、人岗匹配和职业报告的当前状态。</p>
      </div>
      <div class="head-actions">
        <RouterLink to="/profile">新建学生画像</RouterLink>
        <RouterLink to="/matching">发起匹配</RouterLink>
      </div>
    </div>

    <div v-if="loadError" class="status-banner">
      <span class="material-symbols-outlined">info</span>
      <span>{{ loadError }}</span>
      <button type="button" @click="loadDashboard">重试</button>
    </div>

    <div class="metric-grid" :class="{ 'is-loading': isInitialLoading }">
      <RouterLink v-for="card in metricCards" :key="card.label" :to="card.to" class="metric-card">
        <span class="metric-icon material-symbols-outlined">{{ card.icon }}</span>
        <span class="metric-copy">
          <span class="metric-label">{{ card.label }}</span>
          <strong>{{ isInitialLoading ? "--" : card.value }}<small>{{ card.suffix }}</small></strong>
          <span class="metric-trend">{{ isInitialLoading ? "正在读取数据" : card.trend }}</span>
        </span>
        <span class="material-symbols-outlined metric-arrow">chevron_right</span>
      </RouterLink>
    </div>

    <div class="dashboard-grid">
      <article class="panel profile-panel">
        <header class="panel-head">
          <div>
            <p>学生画像</p>
            <h3>{{ latestProfile ? profileName(latestProfile) : "暂无学生画像" }}</h3>
          </div>
          <RouterLink to="/profile">编辑</RouterLink>
        </header>

        <div v-if="isInitialLoading" class="skeleton-stack">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <template v-else-if="latestProfile">
          <div class="profile-summary">
            <div class="avatar">
              <span class="material-symbols-outlined">person</span>
            </div>
            <div>
              <strong>{{ profileTargetRole(latestProfile) || "暂未选择目标岗位" }}</strong>
              <span>{{ profileMajor(latestProfile) || "专业未填写" }} · {{ profileGraduationYear(latestProfile) || "届别未填" }}</span>
            </div>
          </div>
          <div class="tag-row">
            <span v-for="skill in profileSkillNames(latestProfile).slice(0, 6)" :key="skill">{{ skill }}</span>
          </div>
          <dl class="profile-facts">
            <div>
              <dt>完整度</dt>
              <dd>{{ profileCompleteness(latestProfile) }}%</dd>
            </div>
            <div>
              <dt>竞争力</dt>
              <dd>{{ profileCompetitiveness(latestProfile) }}%</dd>
            </div>
            <div>
              <dt>证书</dt>
              <dd>{{ profileCertificateNames(latestProfile).length }} 项</dd>
            </div>
          </dl>
        </template>
        <p v-else class="empty-text">还没有可复用的学生画像，请先进入学生画像中心创建。</p>
      </article>

      <article class="panel match-panel">
        <header class="panel-head">
          <div>
            <p>岗位匹配</p>
            <h3>最近匹配结果</h3>
          </div>
          <RouterLink to="/matching">查看全部</RouterLink>
        </header>

        <div v-if="isInitialLoading" class="match-list">
          <div v-for="item in 5" :key="item" class="match-row skeleton-row">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <div v-else-if="recentMatches.length" class="match-list">
          <div v-for="item in recentMatches" :key="item.id" class="match-row">
            <div class="rank">#{{ item.id }}</div>
            <div class="match-main">
              <strong>{{ item.job_title || `岗位 ${item.job_id}` }}</strong>
              <span>学生画像 {{ item.student_profile_id }} · {{ formatDate(item.created_at) }}</span>
            </div>
            <div class="score-cell">
              <strong>{{ item.total_score }}%</strong>
              <span>{{ scoreLabel(item.total_score) }}</span>
            </div>
          </div>
        </div>
        <p v-else class="empty-text">暂无匹配记录，完成学生画像和岗位画像后即可发起匹配。</p>
      </article>

      <article class="panel graph-panel">
        <header class="panel-head">
          <div>
            <p>岗位换岗 / 晋升关系图</p>
            <h3>{{ topPortraits[0]?.job_name || "等待岗位画像" }}</h3>
          </div>
          <RouterLink to="/career-paths">全屏查看</RouterLink>
        </header>

        <div class="path-map" :class="{ 'is-skeleton': isInitialLoading }" aria-label="岗位路径示意">
          <div v-for="item in topPortraits.slice(1, 3)" :key="item.job_name" class="path-node side-node">
            {{ item.job_name }}
          </div>
          <div class="path-node target-node">
            {{ topPortraits[0]?.job_name || "目标岗位" }}
          </div>
          <div v-for="item in topPortraits.slice(3, 5)" :key="item.job_name" class="path-node side-node">
            {{ item.job_name }}
          </div>
        </div>
        <p class="panel-hint">点击路径图谱中心，可基于已构建岗位画像生成晋升和转岗路线。</p>
      </article>
    </div>

    <div class="lower-grid">
      <article class="panel table-panel">
        <header class="panel-head">
          <div>
            <p>推荐岗位</p>
            <h3>已构建岗位画像</h3>
          </div>
          <RouterLink to="/job-profiles">查看更多</RouterLink>
        </header>

        <div v-if="isInitialLoading" class="table-skeleton">
          <span v-for="item in 6" :key="item"></span>
        </div>
        <table v-else-if="recommendedJobs.length">
          <thead>
            <tr>
              <th>岗位名称</th>
              <th>类别</th>
              <th>综合等级</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in recommendedJobs" :key="item.job_name">
              <td>{{ item.job_name }}</td>
              <td>{{ item.category }}</td>
              <td>
                <span class="progress"><i :style="{ width: `${portraitScore(item)}%` }"></i></span>
                {{ portraitScore(item) }}
              </td>
              <td>{{ formatDate(item.updated_at) }}</td>
              <td><RouterLink to="/job-profiles">查看</RouterLink></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-text">暂无岗位画像，请先运行岗位画像生产流程。</p>
      </article>

      <article class="panel report-panel">
        <header class="panel-head">
          <div>
            <p>职业规划报告</p>
            <h3>报告编辑与导出</h3>
          </div>
          <RouterLink :to="latestMatch ? `/report?match_id=${latestMatch.id}` : '/report'">进入报告</RouterLink>
        </header>

        <div class="report-preview">
          <div class="report-paper">
            <p>一、个人概况</p>
            <p>二、职业目标</p>
            <p>三、能力评估</p>
            <p>四、行动计划</p>
          </div>
          <aside>
            <strong>AI 辅助润色</strong>
            <span>基于匹配结果生成结构化报告，可继续编辑并导出。</span>
            <RouterLink :to="latestMatch ? `/report?match_id=${latestMatch.id}` : '/report'">
              {{ latestMatch ? "打开最近报告链路" : "选择匹配结果" }}
            </RouterLink>
          </aside>
        </div>
      </article>
    </div>
  </section>
</template>

<style>
.dashboard-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dashboard-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding: 6px 2px 2px;
}

.eyebrow,
.panel-head p {
  margin: 0;
  color: rgba(31, 58, 97, 0.58);
  font-size: 12px;
  font-weight: 700;
}

.dashboard-head h2 {
  margin: 4px 0 0;
  color: var(--glass-title);
  font-size: 28px;
  letter-spacing: 0;
}

.dashboard-desc {
  margin: 8px 0 0;
  color: var(--glass-muted);
  line-height: 1.7;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.head-actions a,
.panel-head a,
.report-preview a,
.status-banner button {
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 12px;
  padding: 9px 13px;
  color: var(--glass-title);
  background: var(--glass-panel-strong);
  text-decoration: none;
  font-size: 13px;
  font-weight: 700;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 16px;
  color: var(--glass-muted);
  background: rgba(255, 255, 255, 0.36);
}

.status-banner button {
  margin-left: auto;
  cursor: pointer;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-grid.is-loading {
  opacity: 0.72;
}

.metric-card,
.panel {
  border: 1px solid var(--glass-border);
  background: var(--glass-panel);
  backdrop-filter: blur(24px) saturate(170%);
  -webkit-backdrop-filter: blur(24px) saturate(170%);
  box-shadow:
    inset 0 1px 0 var(--glass-stroke),
    0 16px 32px rgba(49, 79, 136, 0.1);
}

.metric-card {
  min-height: 112px;
  padding: 16px;
  border-radius: 20px;
  color: var(--glass-title);
  text-decoration: none;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 18px 36px rgba(49, 79, 136, 0.14);
}

.metric-icon {
  width: 46px;
  height: 46px;
  border-radius: 16px;
  color: white;
  background: linear-gradient(135deg, var(--glass-primary), var(--glass-primary-strong));
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.metric-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.metric-label,
.metric-trend {
  color: var(--glass-muted);
  font-size: 12px;
}

.metric-copy strong {
  color: var(--glass-title);
  font-size: 28px;
  line-height: 1.1;
}

.metric-copy small {
  margin-left: 2px;
  color: var(--glass-muted);
  font-size: 13px;
  font-weight: 700;
}

.metric-arrow {
  color: rgba(31, 58, 97, 0.42);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(360px, 1.25fr) minmax(360px, 1.5fr);
  gap: 12px;
}

.lower-grid {
  display: grid;
  grid-template-columns: minmax(520px, 1.2fr) minmax(420px, 1fr);
  gap: 12px;
}

.panel {
  min-width: 0;
  border-radius: 20px;
  padding: 16px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-head h3 {
  margin: 4px 0 0;
  color: var(--glass-title);
  font-size: 17px;
  letter-spacing: 0;
}

.profile-summary {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 58px;
  height: 58px;
  border-radius: 20px;
  color: white;
  background: linear-gradient(135deg, var(--glass-primary), var(--glass-primary-strong));
  display: flex;
  align-items: center;
  justify-content: center;
}

.profile-summary strong,
.profile-summary span {
  display: block;
}

.profile-summary span {
  margin-top: 4px;
  color: var(--glass-muted);
  font-size: 13px;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.tag-row span {
  padding: 6px 9px;
  border-radius: 10px;
  color: rgba(23, 53, 92, 0.76);
  background: rgba(255, 255, 255, 0.42);
  font-size: 12px;
}

.profile-facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 16px 0 0;
}

.profile-facts div {
  padding: 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.34);
}

.profile-facts dt,
.profile-facts dd {
  margin: 0;
}

.profile-facts dt {
  color: var(--glass-muted);
  font-size: 12px;
}

.profile-facts dd {
  margin-top: 4px;
  color: var(--glass-title);
  font-weight: 800;
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.34);
}

.rank {
  color: var(--glass-primary);
  font-weight: 800;
}

.match-main {
  min-width: 0;
}

.match-main strong,
.match-main span,
.score-cell strong,
.score-cell span {
  display: block;
}

.match-main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-main span,
.score-cell span {
  margin-top: 3px;
  color: var(--glass-muted);
  font-size: 12px;
}

.score-cell {
  text-align: right;
}

.path-map {
  min-height: 210px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(54px, 1fr));
  gap: 10px;
  align-items: center;
}

.path-node {
  min-height: 42px;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 12px;
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--glass-title);
  background: rgba(255, 255, 255, 0.38);
  font-size: 13px;
  font-weight: 700;
}

.target-node {
  grid-column: 2;
  grid-row: 2;
  min-height: 76px;
  color: white;
  background: linear-gradient(135deg, var(--glass-primary), var(--glass-primary-strong));
  box-shadow: 0 16px 32px rgba(36, 110, 190, 0.18);
}

.side-node:nth-child(1) {
  grid-column: 2;
  grid-row: 1;
}

.side-node:nth-child(2) {
  grid-column: 1;
  grid-row: 2;
}

.side-node:nth-child(4) {
  grid-column: 3;
  grid-row: 2;
}

.side-node:nth-child(5) {
  grid-column: 2;
  grid-row: 3;
}

.panel-hint,
.empty-text {
  margin: 12px 0 0;
  color: var(--glass-muted);
  line-height: 1.7;
  font-size: 13px;
}

.skeleton-stack,
.table-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-stack span,
.table-skeleton span,
.skeleton-row span,
.path-map.is-skeleton .path-node {
  display: block;
  min-height: 18px;
  border-radius: 999px;
  color: transparent;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.3),
    rgba(255, 255, 255, 0.58),
    rgba(255, 255, 255, 0.3)
  );
  background-size: 180% 100%;
  animation: dashboard-skeleton 1.2s ease-in-out infinite;
}

.skeleton-stack span:first-child {
  width: 72%;
  height: 58px;
  border-radius: 18px;
}

.skeleton-stack span:nth-child(2) {
  width: 92%;
}

.skeleton-stack span:nth-child(3) {
  width: 64%;
}

.skeleton-row {
  min-height: 58px;
}

.skeleton-row span:nth-child(2) {
  width: 60%;
}

.skeleton-row span:nth-child(3) {
  width: 48px;
}

@keyframes dashboard-skeleton {
  0% {
    background-position: 100% 0;
  }

  100% {
    background-position: -100% 0;
  }
}

.table-panel {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
}

th,
td {
  padding: 12px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.42);
  text-align: left;
  color: var(--glass-title);
  font-size: 13px;
}

th {
  color: var(--glass-muted);
  font-weight: 800;
}

td a {
  color: var(--glass-primary);
  font-weight: 800;
  text-decoration: none;
}

.progress {
  width: 72px;
  height: 6px;
  margin-right: 8px;
  border-radius: 999px;
  background: rgba(31, 58, 97, 0.1);
  display: inline-flex;
  overflow: hidden;
  vertical-align: middle;
}

.progress i {
  border-radius: inherit;
  background: linear-gradient(90deg, var(--glass-primary), var(--glass-primary-strong));
}

.report-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px;
  gap: 14px;
}

.report-paper {
  min-height: 230px;
  padding: 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.46);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.report-paper p {
  margin: 0 0 18px;
  color: var(--glass-title);
  font-weight: 800;
}

.report-preview aside {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.34);
}

.report-preview aside span {
  color: var(--glass-muted);
  line-height: 1.7;
  font-size: 13px;
}

.report-preview a {
  margin-top: auto;
  text-align: center;
}

@media (max-width: 1280px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-grid,
  .lower-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .dashboard-head,
  .panel-head {
    flex-direction: column;
    align-items: stretch;
  }

  .head-actions,
  .panel-head a {
    width: 100%;
  }

  .head-actions a,
  .panel-head a {
    text-align: center;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }

  .profile-facts,
  .report-preview {
    grid-template-columns: 1fr;
  }

  .path-map {
    grid-template-columns: 1fr;
    grid-template-rows: none;
  }

  .target-node,
  .side-node:nth-child(n) {
    grid-column: auto;
    grid-row: auto;
  }
}
</style>
