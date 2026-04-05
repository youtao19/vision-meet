<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";

import type { ManualJobPortraitRecord } from "@career/contracts/types";

import { ApiRequestError } from "@/shared/api/http";
import { fetchManualJobPortraits } from "@/shared/api/job-profiles";

/**
 * 文件作用：岗位画像中心页面。
 * 职责说明：仅提供人工岗位画像列表与详情浏览，不再承载个人履历录入功能。
 */
const profiles = ref<ManualJobPortraitRecord[]>([]);
const selected = ref<ManualJobPortraitRecord | null>(null);
const activeCategory = ref("all");

const loading = reactive({
  list: false,
});

const uiState = reactive({
  error: "",
});

const categoryOptions = computed(() => {
  const categories = Array.from(new Set(profiles.value.map((item) => item.category))).sort();
  return ["all", ...categories];
});

const visibleProfiles = computed(() => {
  if (activeCategory.value === "all") {
    return profiles.value;
  }
  return profiles.value.filter((item) => item.category === activeCategory.value);
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

async function loadProfiles(): Promise<void> {
  loading.list = true;
  uiState.error = "";

  try {
    const response = await fetchManualJobPortraits();
    profiles.value = response.items;
    selected.value = response.items[0] ?? null;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.list = false;
  }
}

onMounted(loadProfiles);
</script>

<template>
  <section class="job-profiles-page">
    <header class="page-header">
      <h2>岗位画像中心</h2>
      <p>当前页面直连数据库中的人工岗位画像，支持查看标准样本。</p>
    </header>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>

    <section class="panel">
      <div class="toolbar">
        <label>
          岗位分类
          <select v-model="activeCategory">
            <option v-for="item in categoryOptions" :key="item" :value="item">
              {{ item }}
            </option>
          </select>
        </label>
        <button class="ghost-btn" :disabled="loading.list" @click="loadProfiles">
          {{ loading.list ? "刷新中..." : "刷新数据" }}
        </button>
      </div>
    </section>

    <section class="layout">
      <article class="panel list-panel">
        <h3>画像列表</h3>
        <ul class="profile-list">
          <li
            v-for="item in visibleProfiles"
            :key="item.job_name"
            :class="{ active: selected?.job_name === item.job_name }"
            @click="selected = item"
          >
            <p>{{ item.job_name }}</p>
            <p class="meta">{{ item.category }}</p>
          </li>
          <li v-if="visibleProfiles.length === 0" class="empty">暂无岗位画像数据</li>
        </ul>
      </article>

      <article class="panel detail-panel">
        <h3>画像详情</h3>
        <div v-if="selected">
          <p><strong>{{ selected.job_name }}</strong></p>
          <p>岗位分类：{{ selected.category }}</p>

          <ul class="dimension-list">
            <li>
              <p class="dimension-title">技能能力</p>
              <p>等级：{{ selected.skills.level }} · 权重：{{ selected.skills.weight }}</p>
              <p>{{ selected.skills.description }}</p>
            </li>
            <li>
              <p class="dimension-title">资质要求</p>
              <p>等级：{{ selected.certification.level }} · 权重：{{ selected.certification.weight }}</p>
              <p>{{ selected.certification.description }}</p>
            </li>
            <li>
              <p class="dimension-title">创新能力</p>
              <p>等级：{{ selected.innovation.level }} · 权重：{{ selected.innovation.weight }}</p>
              <p>{{ selected.innovation.description }}</p>
            </li>
            <li>
              <p class="dimension-title">学习能力</p>
              <p>等级：{{ selected.learning.level }} · 权重：{{ selected.learning.weight }}</p>
              <p>{{ selected.learning.description }}</p>
            </li>
            <li>
              <p class="dimension-title">抗压能力</p>
              <p>等级：{{ selected.stress.level }} · 权重：{{ selected.stress.weight }}</p>
              <p>{{ selected.stress.description }}</p>
            </li>
            <li>
              <p class="dimension-title">沟通能力</p>
              <p>等级：{{ selected.communication.level }} · 权重：{{ selected.communication.weight }}</p>
              <p>{{ selected.communication.description }}</p>
            </li>
            <li>
              <p class="dimension-title">经验要求</p>
              <p>等级：{{ selected.experience.level }} · 权重：{{ selected.experience.weight }}</p>
              <p>{{ selected.experience.description }}</p>
            </li>
          </ul>
        </div>
        <p v-else class="empty">请从左侧选择岗位画像。</p>
      </article>
    </section>
  </section>
</template>

<style scoped>
.job-profiles-page {
  max-width: 1100px;
  margin: 24px auto;
  display: grid;
  gap: 16px;
}

.page-header h2 {
  margin: 0;
  color: #111827;
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

.panel {
  background: #ffffff;
  border: 1px solid #dbe4f0;
  border-radius: 12px;
  padding: 16px;
}

label {
  display: grid;
  gap: 6px;
  color: #334155;
}

select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  background: #ffffff;
  font: inherit;
}

.toolbar {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr auto;
}

.ghost-btn {
  border: 1px solid #94a3b8;
  background: #f8fafc;
  color: #111827;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  align-self: end;
}

.ghost-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.layout {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr 1.3fr;
}

.profile-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  max-height: 560px;
  overflow: auto;
}

.profile-list li {
  border: 1px solid #dbe4f0;
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
}

.profile-list li.active {
  border-color: #0f766e;
  background: #f0fdfa;
}

.profile-list p {
  margin: 0;
}

.meta {
  color: #64748b;
  font-size: 13px;
  margin-top: 4px !important;
}

.detail-panel p {
  margin: 8px 0;
}

.dimension-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.dimension-list li {
  border: 1px solid #dbe4f0;
  border-radius: 10px;
  padding: 10px;
  background: #f8fafc;
}

.dimension-title {
  margin: 0;
  font-weight: 600;
  color: #0f172a;
}

.empty {
  color: #94a3b8;
}

@media (max-width: 900px) {
  .toolbar {
    grid-template-columns: 1fr;
  }

  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
