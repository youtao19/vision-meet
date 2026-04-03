<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";

import type { JobProfileV2Record } from "@career/contracts/types";

import { ApiRequestError } from "@/shared/api/http";
import { fetchJobProfiles } from "@/shared/api/job-profiles";

const profiles = ref<JobProfileV2Record[]>([]);
const selected = ref<JobProfileV2Record | null>(null);

const loading = reactive({
  list: false,
});

const query = reactive({
  keyword: "",
  family: "",
});

const uiState = reactive({
  error: "",
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
    const response = await fetchJobProfiles({
      keyword: query.keyword.trim() || undefined,
      job_family: query.family.trim() || undefined,
      limit: 100,
    });
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
      <p>查看岗位族、核心技能和七大能力维度画像。</p>
    </header>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>

    <section class="panel">
      <div class="toolbar">
        <label>
          关键字
          <input v-model="query.keyword" type="text" placeholder="岗位名称关键字" />
        </label>
        <label>
          岗位族
          <input v-model="query.family" type="text" placeholder="如 backend / frontend" />
        </label>
        <button class="ghost-btn" :disabled="loading.list" @click="loadProfiles">
          {{ loading.list ? "查询中..." : "查询画像" }}
        </button>
      </div>
    </section>

    <section class="layout">
      <article class="panel list-panel">
        <h3>画像列表</h3>
        <ul class="profile-list">
          <li
            v-for="item in profiles"
            :key="item.id"
            :class="{ active: selected?.id === item.id }"
            @click="selected = item"
          >
            <p>#{{ item.job_id }} {{ item.normalized_title }}</p>
            <p class="meta">{{ item.job_family }} · L{{ item.job_level }} · {{ item.generation_mode }}</p>
          </li>
          <li v-if="profiles.length === 0" class="empty">暂无岗位画像数据</li>
        </ul>
      </article>

      <article class="panel detail-panel">
        <h3>画像详情</h3>
        <div v-if="selected">
          <p><strong>{{ selected.normalized_title }}</strong></p>
          <p>岗位族：{{ selected.job_family }} · 层级：{{ selected.job_level }}</p>
          <p>生成方式：{{ selected.generation_mode }} · 置信度：{{ selected.confidence }}</p>
          <p>核心技能：{{ selected.professional_skills.join("、") || "暂无" }}</p>
          <p>证书要求：{{ selected.certificate_requirements.join("、") || "暂无" }}</p>
          <p>创新能力：{{ selected.innovation_score }}</p>
          <p>学习能力：{{ selected.learning_score }}</p>
          <p>抗压能力：{{ selected.stress_tolerance_score }}</p>
          <p>沟通能力：{{ selected.communication_score }}</p>
          <p>实习能力：{{ selected.internship_score }}</p>
          <p>摘要：{{ selected.summary }}</p>
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

.toolbar {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

label {
  display: grid;
  gap: 6px;
  color: #334155;
}

input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
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
