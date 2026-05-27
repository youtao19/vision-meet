<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import type {
  JobPictureBook,
  JobPortraitPictureBookContext,
  JobPortraitSubIndustry,
  ManualJobPortraitRecord,
} from "@career/contracts/types";

import { apiBaseUrl, ApiRequestError } from "@/shared/api/http";
import {
  fetchJobPictureBook,
  fetchManualJobPortraits,
  generateJobPictureBook,
  generateJobPortraitPictureBook,
} from "@/shared/api/job-profiles";
import ComicBookViewer from "@/features/comic-book/components/ComicBookViewer.vue";

const profiles = ref<ManualJobPortraitRecord[]>([]);
const selected = ref<ManualJobPortraitRecord | null>(null);
const selectedSubIndustry = ref<JobPortraitSubIndustry | null>(null);
const pictureBook = ref<JobPictureBook | null>(null);
const activeCategory = ref("all");
const selectedJobName = ref("");
const keyword = ref("");
const abilityFilter = ref("all");
const showPictureBook = ref(false);
const loading = reactive({ list: false, pictureBookGenerateJobName: "", pictureBookJobName: "" });
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
  if (selected.value?.job_name !== profile.job_name) {
    showPictureBook.value = false;
    pictureBook.value = null;
  }
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

function openPictureBookRaw(): void {
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

function buildPictureBookContext(profile: ManualJobPortraitRecord): JobPortraitPictureBookContext {
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

function patchProfilePictureBook(jobName: string, comicImageUrl: string): void {
  const target = profiles.value.find((item) => item.job_name === jobName);
  if (target) {
    target.comic_image_url = comicImageUrl;
    target.comic_generated_at = new Date().toISOString();
  }
}

async function submitGeneratePictureBook(force = false): Promise<void> {
  if (!selected.value || loading.pictureBookGenerateJobName) return;
  loading.pictureBookGenerateJobName = selected.value.job_name;
  uiState.error = "";
  try {
    const response = await generateJobPortraitPictureBook(selected.value.job_name, {
      force,
      comic_context: buildPictureBookContext(selected.value),
    });
    patchProfilePictureBook(response.job_name, response.comic_image_url);
    pictureBook.value = null;
    showPictureBook.value = false;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.pictureBookGenerateJobName = "";
  }
}

async function loadPictureBook(jobName: string): Promise<JobPictureBook | null> {
  try {
    return await fetchJobPictureBook(jobName);
  } catch {
    return null;
  }
}

async function openPictureBook(force = false): Promise<void> {
  if (!selected.value || loading.pictureBookJobName) return;
  const profile = selected.value;
  showPictureBook.value = true;
  loading.pictureBookJobName = profile.job_name;
  uiState.error = "";

  try {
    const existingBook = force ? null : await loadPictureBook(profile.job_name);
    if (existingBook) {
      pictureBook.value = existingBook;
      return;
    }

    const response = await generateJobPictureBook(profile.job_name, {
      force,
      comic_context: buildPictureBookContext(profile),
    });
    pictureBook.value = {
      job_name: response.job_name,
      title: `${response.job_name}每天在做什么？`,
      pages: response.pages,
      total_pages: response.pages.length,
    };
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.pictureBookJobName = "";
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

      <article class="card picture-book-card profile-picture-book-card">
        <div class="card-title">
          <div class="title-with-icon">
            <span class="book-mark" aria-hidden="true"></span>
            <div>
              <span class="card-eyebrow">职业科普</span>
              <h3>岗位绘本</h3>
            </div>
          </div>
          <button
            type="button"
            class="view-raw-btn"
            :disabled="!selected.comic_image_url"
            @click="openPictureBookRaw"
          >
            查看原图
          </button>
        </div>

        <div class="picture-book-stage">
          <transition name="stage-fade" mode="out-in">
            <div
              v-if="showPictureBook && loading.pictureBookJobName === selected.job_name"
              class="stage-loading"
            >
              <div class="loader"></div>
              <h4>正在制作有声绘本</h4>
              <p>正在整理插图和旁白，完成后会直接替换这里的预览。</p>
            </div>

            <ComicBookViewer
              v-else-if="showPictureBook && pictureBook && pictureBook.pages.length > 0"
              :pages="pictureBook.pages"
              :title="pictureBook.title"
              :resolve-url="resolveAssetUrl"
            />

            <div v-else-if="showPictureBook" class="stage-error">
              <span class="error-symbol" aria-hidden="true">!</span>
              <h4>绘本生成失败</h4>
              <p>请重试生成，或先查看当前岗位原图。</p>
              <button type="button" @click="openPictureBook(true)">重新生成绘本</button>
            </div>

            <div v-else-if="selected.comic_image_url" class="image-preview-container">
              <img
                :src="resolveAssetUrl(selected.comic_image_url)"
                :alt="`${selected.job_name}岗位绘本`"
                class="preview-image"
              />
              <div class="preview-meta">
                <span>已生成岗位插图</span>
                <strong>{{ selected.job_name }}</strong>
                <button type="button" @click="openPictureBook(false)">进入有声绘本</button>
              </div>
            </div>

            <div v-else class="picture-book-empty">
              <div class="placeholder-content">
                <span class="empty-visual" aria-hidden="true"></span>
                <h3>{{ selected.job_name }}</h3>
                <p>生成后会在这里展示岗位插图，并可切换为有声绘本。</p>
                <div class="placeholder-skills">
                  <span v-for="skill in selected.profile_detail.skills.slice(0, 3)" :key="skill">
                    {{ skill }}
                  </span>
                </div>
              </div>
            </div>
          </transition>
        </div>

        <div class="picture-book-actions">
          <button
            type="button"
            class="action-btn secondary"
            :disabled="Boolean(loading.pictureBookGenerateJobName)"
            @click="submitGeneratePictureBook(Boolean(selected.comic_image_url))"
          >
            <span
              v-if="loading.pictureBookGenerateJobName === selected.job_name"
              class="spinner"
            ></span>
            {{
              loading.pictureBookGenerateJobName === selected.job_name
                ? "绘本绘制中..."
                : selected.comic_image_url
                  ? "重新绘制"
                  : "绘制岗位绘本"
            }}
          </button>

          <button
            type="button"
            class="action-btn primary"
            :disabled="Boolean(loading.pictureBookJobName)"
            @click="openPictureBook(true)"
          >
            <span v-if="loading.pictureBookJobName === selected.job_name" class="spinner"></span>
            {{ loading.pictureBookJobName === selected.job_name ? "制作中..." : "开启有声绘本" }}
          </button>
        </div>
      </article>
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

.profile-picture-book-card {
  grid-column: 1 / -1;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  padding: 22px;
}

.title-with-icon {
  display: flex;
  align-items: center;
  gap: 12px;
}

.book-mark {
  position: relative;
  width: 36px;
  height: 42px;
  flex: 0 0 auto;
  border: 2px solid #2563eb;
  border-radius: 6px;
  background: #eff6ff;
}

.book-mark::before {
  position: absolute;
  top: 7px;
  bottom: 7px;
  left: 50%;
  width: 2px;
  background: #bfdbfe;
  content: "";
}

.book-mark::after {
  position: absolute;
  right: 6px;
  bottom: -2px;
  width: 8px;
  height: 16px;
  border-radius: 0 0 4px 4px;
  background: #2563eb;
  content: "";
}

.card-eyebrow {
  display: block;
  margin-bottom: 2px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.title-with-icon h3 {
  margin: 0;
}

.view-raw-btn {
  min-height: 44px;
  border: 1px solid #cbd5e1 !important;
  border-radius: 8px;
  background: #ffffff !important;
  color: #334155 !important;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.view-raw-btn:hover:not(:disabled) {
  background: #f8fafc !important;
  color: #1e293b !important;
}

.picture-book-stage {
  position: relative;
  min-height: 520px;
  margin-top: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stage-loading,
.stage-error,
.picture-book-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 520px;
  padding: 42px;
  text-align: center;
}

.stage-loading h4,
.stage-error h4,
.picture-book-empty h3 {
  margin: 0;
  color: #0f172a;
}

.stage-loading p,
.stage-error p,
.placeholder-content p {
  max-width: 460px;
  margin: 8px auto 0;
  color: #64748b;
  line-height: 1.65;
}

.loader {
  width: 40px;
  height: 40px;
  border: 3px solid #e2e8f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-symbol {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: 14px;
  border-radius: 50%;
  background: #fee2e2;
  color: #b91c1c;
  font-weight: 800;
}

.image-preview-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 520px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  background: #ffffff;
}

.preview-image {
  width: 100%;
  height: 100%;
  max-height: 520px;
  object-fit: contain;
  background: #f8fafc;
}

.preview-meta {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 32px;
  border-left: 1px solid #e2e8f0;
  background: #ffffff;
}

.preview-meta span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.preview-meta strong {
  color: #0f172a;
  font-size: 22px;
  line-height: 1.35;
}

.preview-meta button,
.stage-error button {
  min-height: 44px;
  padding: 0 18px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.preview-meta button:hover,
.stage-error button:hover {
  background: #1d4ed8;
}

.empty-visual {
  width: 68px;
  height: 50px;
  margin-bottom: 18px;
  border: 2px solid #cbd5e1;
  border-radius: 8px;
  background:
    linear-gradient(135deg, transparent 48%, #cbd5e1 49%, #cbd5e1 51%, transparent 52%),
    linear-gradient(#e2e8f0, #e2e8f0);
  background-size:
    100% 100%,
    32px 2px;
  background-position:
    center,
    center 15px;
  background-repeat: no-repeat;
}

.placeholder-skills {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
}

.placeholder-skills span {
  padding: 6px 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 99px;
  font-size: 13px;
  color: #475569;
}

.picture-book-actions {
  display: flex;
  gap: 16px;
  margin-top: 20px;
}

.action-btn {
  flex: 1;
  height: 48px;
  min-width: 0;
  border-radius: 8px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.2s ease;
}

.action-btn.primary {
  background: #2563eb;
  color: #ffffff;
  border: none;
}

.action-btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
  transform: translateY(-1px);
}

.action-btn.secondary {
  background: white;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.action-btn.secondary:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.action-btn.secondary .spinner {
  border-color: rgba(0, 0, 0, 0.1);
  border-top-color: #2563eb;
}

/* Transitions */
.stage-fade-enter-active,
.stage-fade-leave-active {
  transition: opacity 0.3s ease;
}

.stage-fade-enter-from,
.stage-fade-leave-to {
  opacity: 0;
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

  .picture-book-actions {
    flex-direction: column;
  }

  .image-preview-container {
    grid-template-columns: 1fr;
  }

  .preview-meta {
    border-top: 1px solid #e2e8f0;
    border-left: 0;
  }
}
</style>
