<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import type {
  JobPortraitComicContext,
  JobPortraitSubIndustry,
  ManualJobPortraitRecord,
} from "@career/contracts/types";

import { apiBaseUrl, ApiRequestError } from "@/shared/api/http";
import { fetchManualJobPortraits, generateJobPortraitComic } from "@/shared/api/job-profiles";

const profiles = ref<ManualJobPortraitRecord[]>([]);
const selected = ref<ManualJobPortraitRecord | null>(null);
const selectedSubIndustry = ref<JobPortraitSubIndustry | null>(null);
const activeCategory = ref("all");
const selectedJobName = ref("");
const keyword = ref("");
const abilityFilter = ref("all");
const loading = reactive({ list: false, comicJobName: "" });
const uiState = reactive({ error: "" });

const categoryOptions = computed(() => {
  const industries =
    selected.value?.profile_detail.subIndustries.map((industry) => industry.industry) ?? [];
  return ["all", ...industries];
});

const abilityOptions = computed(() => {
  const skills = profiles.value.flatMap((item) => item.profile_detail.skills);
  return Array.from(new Set(skills)).slice(0, 16);
});

const visibleProfiles = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  return profiles.value.filter((item) => {
    const detail = item.profile_detail;
    const matchesAbility =
      abilityFilter.value === "all" ||
      detail.skills.some((skill) => skill.toLowerCase().includes(abilityFilter.value));
    const matchesKeyword =
      !query ||
      item.job_name.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query) ||
      detail.description.toLowerCase().includes(query) ||
      detail.skills.some((skill) => skill.toLowerCase().includes(query)) ||
      detail.subIndustries.some((industry) => industry.industry.toLowerCase().includes(query));

    return matchesAbility && matchesKeyword;
  });
});

const relatedProfiles = computed(() => {
  if (!selected.value) return [];
  const activeIndustry = selectedSubIndustry.value?.industry;
  return profiles.value
    .filter((item) => item.job_name !== selected.value?.job_name)
    .filter((item) =>
      activeIndustry
        ? item.profile_detail.subIndustries.some((industry) => industry.industry === activeIndustry)
        : item.category === selected.value?.category,
    )
    .slice(0, 6);
});

function portraitDisplayName(profile: ManualJobPortraitRecord): string {
  return profile.profile_detail.name.trim() || profile.job_name.trim();
}

function categoryLabel(category: string): string {
  if (category === "all") return "全部方向";
  return category;
}

function selectProfile(
  profile: ManualJobPortraitRecord,
  options: { keepDirection?: boolean } = {},
): void {
  selected.value = profile;
  selectedJobName.value = profile.job_name;
  const nextSubIndustry = options.keepDirection
    ? profile.profile_detail.subIndustries.find(
        (industry) => industry.industry === activeCategory.value,
      )
    : null;
  selectedSubIndustry.value = nextSubIndustry ?? profile.profile_detail.subIndustries[0] ?? null;
  activeCategory.value = selectedSubIndustry.value?.industry ?? "all";
}

function resetFilters(): void {
  keyword.value = "";
  activeCategory.value = "all";
  abilityFilter.value = "all";
}

function applyFilterSelection(): void {
  const first = visibleProfiles.value[0];
  if (first) selectProfile(first);
}

function resolveAssetUrl(path: string): string {
  return new URL(path, apiBaseUrl).toString();
}

function openComic(): void {
  if (!selected.value?.comic_image_url) return;
  window.open(resolveAssetUrl(selected.value.comic_image_url), "_blank", "noopener,noreferrer");
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.traceId ? `${error.message}（trace_id: ${error.traceId}）` : error.message;
  }
  if (error instanceof Error) return error.message;
  return "请求失败，请稍后重试";
}

function buildComicContext(profile: ManualJobPortraitRecord): JobPortraitComicContext {
  const detail = profile.profile_detail;
  return {
    category: profile.category,
    summary: detail.description,
    tech_stack: detail.skills,
    industry_context: detail.subIndustries.map((item) => item.industry).join("、"),
    core_responsibilities: [detail.internshipAbility],
    suitable_for: detail.educationRequirements,
    not_suitable_for: [],
  };
}

function patchProfileComic(jobName: string, comicImageUrl: string): void {
  const target = profiles.value.find((item) => item.job_name === jobName);
  if (target) {
    target.comic_image_url = comicImageUrl;
    target.comic_generated_at = new Date().toISOString();
  }
}

async function submitGenerateComic(force = false): Promise<void> {
  if (!selected.value || loading.comicJobName) return;
  loading.comicJobName = selected.value.job_name;
  uiState.error = "";
  try {
    const response = await generateJobPortraitComic(selected.value.job_name, {
      force,
      comic_context: buildComicContext(selected.value),
    });
    patchProfileComic(response.job_name, response.comic_image_url);
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.comicJobName = "";
  }
}

async function loadProfiles(): Promise<void> {
  loading.list = true;
  uiState.error = "";
  try {
    const response = await fetchManualJobPortraits();
    profiles.value = response.items;
    const firstProfile = profiles.value[0];
    if (firstProfile) selectProfile(firstProfile);
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.list = false;
  }
}

watch(selectedJobName, (jobName) => {
  const target = profiles.value.find((item) => item.job_name === jobName);
  if (target) selectProfile(target);
});

watch(activeCategory, (industryName) => {
  if (!selected.value) return;
  selectedSubIndustry.value =
    selected.value.profile_detail.subIndustries.find(
      (industry) => industry.industry === industryName,
    ) ??
    selected.value.profile_detail.subIndustries[0] ??
    null;
});

onMounted(loadProfiles);
</script>

<template>
  <div class="job-profiles-page">
    <header class="page-header">
      <div>
        <p>岗位画像中心</p>
        <h1>主岗位画像 + 子行业画像</h1>
      </div>
      <strong>{{ profiles.length }} 个岗位</strong>
    </header>

    <section class="filters">
      <label>
        <span>岗位</span>
        <select v-model="selectedJobName">
          <option v-for="item in profiles" :key="item.job_name" :value="item.job_name">
            {{ portraitDisplayName(item) }}
          </option>
        </select>
      </label>
      <label>
        <span>分类</span>
        <select v-model="activeCategory">
          <option v-for="category in categoryOptions" :key="category" :value="category">
            {{ categoryLabel(category) }}
          </option>
        </select>
      </label>
      <label>
        <span>能力</span>
        <select v-model="abilityFilter">
          <option value="all">全部</option>
          <option v-for="skill in abilityOptions" :key="skill" :value="skill.toLowerCase()">
            {{ skill }}
          </option>
        </select>
      </label>
      <input v-model="keyword" type="search" placeholder="搜索岗位 / 技能 / 子行业" />
      <button type="button" @click="applyFilterSelection">搜索</button>
      <button type="button" @click="resetFilters">重置</button>
    </section>

    <p v-if="uiState.error" class="notice error">{{ uiState.error }}</p>
    <p v-else-if="loading.list" class="notice">正在加载岗位画像...</p>

    <main v-if="selected" class="profile-layout">
      <section class="main-profile">
        <article class="summary-panel">
          <div>
            <span>{{ selected.category }}</span>
            <h2>{{ portraitDisplayName(selected) }}</h2>
            <p>{{ selected.profile_detail.description }}</p>
          </div>
          <div class="summary-stat">
            <span>薪资等级</span>
            <strong>{{ selectedSubIndustry?.salaryLevel || "-" }}</strong>
            <small>加班强度：{{ selectedSubIndustry?.overtimeLevel || "-" }}</small>
          </div>
        </article>

        <section class="card-grid">
          <article class="card">
            <h3>学历要求</h3>
            <ul>
              <li v-for="item in selected.profile_detail.educationRequirements" :key="item">
                {{ item }}
              </li>
            </ul>
          </article>
          <article class="card">
            <h3>核心技能</h3>
            <div class="chips">
              <span v-for="skill in selected.profile_detail.skills" :key="skill">{{ skill }}</span>
            </div>
          </article>
          <article class="card">
            <h3>软技能</h3>
            <div class="chips">
              <span v-for="skill in selected.profile_detail.softSkills" :key="skill">
                {{ skill }}
              </span>
            </div>
          </article>
          <article class="card">
            <h3>证书</h3>
            <div class="chips">
              <span v-for="certificate in selected.profile_detail.certificates" :key="certificate">
                {{ certificate }}
              </span>
              <span v-if="selected.profile_detail.certificates.length === 0">无强制证书</span>
            </div>
          </article>
          <article class="card">
            <h3>能力侧重点</h3>
            <ul>
              <li>创新：{{ selected.profile_detail.innovationAbility }}</li>
              <li>学习：{{ selected.profile_detail.learningAbility }}</li>
              <li>抗压：{{ selected.profile_detail.stressResistance }}</li>
              <li>沟通：{{ selected.profile_detail.communicationAbility }}</li>
              <li>{{ selected.profile_detail.internshipAbility }}</li>
            </ul>
          </article>
          <article class="card">
            <h3>职业路径</h3>
            <div class="path">
              <span v-for="step in selected.profile_detail.careerPath" :key="step">
                {{ step }}
              </span>
            </div>
          </article>
        </section>

        <article class="card comic-card">
          <div class="card-title">
            <h3>岗位漫画</h3>
            <button type="button" :disabled="!selected.comic_image_url" @click="openComic">
              查看
            </button>
          </div>
          <img
            v-if="selected.comic_image_url"
            :src="resolveAssetUrl(selected.comic_image_url)"
            :alt="`${selected.job_name}岗位漫画`"
          />
          <div v-else class="comic-placeholder">
            <span>{{ selected.job_name }}</span>
            <strong>{{ selected.profile_detail.skills.slice(0, 3).join(" / ") }}</strong>
          </div>
          <button
            type="button"
            :disabled="Boolean(loading.comicJobName)"
            @click="submitGenerateComic(Boolean(selected.comic_image_url))"
          >
            {{
              loading.comicJobName === selected.job_name
                ? "生成中..."
                : selected.comic_image_url
                  ? "重新生成"
                  : "生成岗位漫画"
            }}
          </button>
        </article>
      </section>

      <aside class="side-panel">
        <section v-if="selectedSubIndustry" class="card subindustry-detail">
          <h3>{{ selectedSubIndustry.industry }}</h3>
          <p>{{ selectedSubIndustry.description }}</p>
          <h4>代表公司</h4>
          <div class="chips">
            <span v-for="company in selectedSubIndustry.representCompanies" :key="company">
              {{ company }}
            </span>
          </div>
          <h4>技能</h4>
          <div class="chips">
            <span v-for="skill in selectedSubIndustry.skills" :key="skill">{{ skill }}</span>
          </div>
          <h4>行业特点</h4>
          <ul>
            <li v-for="feature in selectedSubIndustry.industryFeatures" :key="feature">
              {{ feature }}
            </li>
          </ul>
          <h4>推荐项目</h4>
          <ul>
            <li v-for="project in selectedSubIndustry.recommendedProjects" :key="project">
              {{ project }}
            </li>
          </ul>
        </section>

        <section class="card">
          <h3>相关岗位</h3>
          <button
            v-for="profile in relatedProfiles"
            :key="profile.job_name"
            type="button"
            class="related-button"
            @click="selectProfile(profile)"
          >
            {{ profile.job_name }}
          </button>
        </section>
      </aside>
    </main>

    <section v-else-if="!loading.list" class="empty">
      <h2>暂无岗位画像</h2>
      <p>请先执行 npm run job-portraits:seed。</p>
    </section>
  </div>
</template>

<style scoped>
.job-profiles-page {
  min-height: 100vh;
  padding: 24px;
  background: #f6f8fb;
  color: #111827;
}

.page-header,
.filters,
.summary-panel,
.card,
.empty {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 10px 25px rgb(15 23 42 / 5%);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 20px 24px;
}

.page-header p,
.page-header h1 {
  margin: 0;
}

.page-header p {
  color: #64748b;
  font-size: 14px;
}

.page-header h1 {
  margin-top: 4px;
  font-size: 26px;
}

.filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr)) minmax(220px, 1.3fr) auto auto;
  gap: 12px;
  align-items: end;
  margin-bottom: 16px;
  padding: 16px;
}

.filters label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #64748b;
}

.filters select,
.filters input,
.filters button,
.comic-card button,
.related-button {
  min-height: 38px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #111827;
}

.filters button,
.comic-card button {
  padding: 0 14px;
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
  cursor: pointer;
}

.filters button:last-child {
  background: #ffffff;
  color: #334155;
  border-color: #cbd5e1;
}

.notice {
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 6px;
  background: #eff6ff;
  color: #1d4ed8;
}

.notice.error {
  background: #fef2f2;
  color: #b91c1c;
}

.profile-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
}

.main-profile,
.side-panel {
  display: grid;
  gap: 16px;
  align-content: start;
}

.summary-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: 20px;
  padding: 24px;
}

.summary-panel span,
.summary-panel small {
  color: #64748b;
}

.summary-panel h2 {
  margin: 6px 0 10px;
  font-size: 28px;
}

.summary-panel p {
  margin: 0;
  line-height: 1.75;
  color: #475569;
}

.summary-stat {
  display: grid;
  gap: 6px;
  align-content: center;
  border-left: 1px solid #e5e7eb;
  padding-left: 20px;
}

.summary-stat strong {
  font-size: 28px;
  color: #2563eb;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.card {
  padding: 18px;
}

.card h3,
.card h4 {
  margin: 0 0 12px;
}

.card p,
.card li {
  color: #475569;
  line-height: 1.7;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chips span {
  border-radius: 999px;
  background: #eef2ff;
  color: #1e40af;
  padding: 6px 10px;
  font-size: 13px;
}

.path {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.path span {
  border-radius: 6px;
  background: #f1f5f9;
  padding: 8px 10px;
}

.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.comic-card img {
  width: 100%;
  max-height: 360px;
  object-fit: contain;
  border-radius: 8px;
  background: #f8fafc;
}

.comic-placeholder {
  display: grid;
  place-items: center;
  min-height: 180px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: #f8fafc;
  color: #334155;
}

.related-button {
  display: grid;
  width: 100%;
  height: auto;
  margin-top: 8px;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
}

.empty {
  padding: 28px;
  text-align: center;
}

@media (max-width: 980px) {
  .filters,
  .profile-layout,
  .summary-panel,
  .card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
