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

// 提取详情列表配置，用于模板中 v-for 循环渲染，减少代码冗余
const dimensionsConfig = computed(() => {
  if (!selected.value) return [];
  const s = selected.value;
  return [
    { key: "skills", title: "技能能力", data: s.skills, icon: "⚡️" },
    { key: "certification", title: "资质要求", data: s.certification, icon: "🎓" },
    { key: "innovation", title: "创新能力", data: s.innovation, icon: "💡" },
    { key: "learning", title: "学习能力", data: s.learning, icon: "📚" },
    { key: "stress", title: "抗压能力", data: s.stress, icon: "🛡️" },
    { key: "communication", title: "沟通能力", data: s.communication, icon: "💬" },
    { key: "experience", title: "经验要求", data: s.experience, icon: "💼" },
  ];
});

onMounted(loadProfiles);
</script>

<template>
  <div class="job-profiles-container">
    <header class="page-header">
      <div class="header-titles">
        <h2>岗位画像中心</h2>
        <p>当前页面直连数据库中的人工岗位画像，支持查看标准样本与能力模型。</p>
      </div>
      <div class="header-actions">
        <button class="btn-primary" :disabled="loading.list" @click="loadProfiles">
          <span class="btn-icon">↻</span> {{ loading.list ? "正在同步..." : "刷新数据" }}
        </button>
      </div>
    </header>

    <div v-if="uiState.error" class="notice notice-error">
      <span class="notice-icon">⚠️</span> {{ uiState.error }}
    </div>

    <main class="layout-grid">
      <!-- 左侧：过滤与列表 -->
      <aside class="left-panel card">
        <div class="filter-section">
          <label class="filter-label">
            <span class="label-text">分类筛选</span>
            <div class="select-wrapper">
              <select v-model="activeCategory">
                <option value="all">全部岗位</option>
                <option
                  v-for="item in categoryOptions.filter((i) => i !== 'all')"
                  :key="item"
                  :value="item"
                >
                  {{ item }}
                </option>
              </select>
            </div>
          </label>
        </div>

        <div class="list-section">
          <div v-if="loading.list && visibleProfiles.length === 0" class="state-hint">
            <div class="spinner"></div>
            <p>加载中...</p>
          </div>

          <ul v-else-if="visibleProfiles.length > 0" class="profile-list">
            <li
              v-for="item in visibleProfiles"
              :key="item.job_name"
              class="profile-item"
              :class="{ active: selected?.job_name === item.job_name }"
              @click="selected = item"
            >
              <div class="item-content">
                <h4 class="item-title">{{ item.job_name }}</h4>
                <span class="item-badge">{{ item.category }}</span>
              </div>
            </li>
          </ul>

          <div v-else class="state-hint empty">
            <span class="empty-icon">📭</span>
            <p>未找到符合条件的岗位画像</p>
          </div>
        </div>
      </aside>

      <!-- 右侧：详情展示 -->
      <article class="right-panel card">
        <div v-if="selected" class="detail-content">
          <header class="detail-header">
            <div class="title-group">
              <span class="category-tag">{{ selected.category }}</span>
              <h3 class="job-title">{{ selected.job_name }}</h3>
            </div>
          </header>

          <div class="dimensions-grid">
            <div v-for="dim in dimensionsConfig" :key="dim.key" class="dimension-card">
              <div class="dim-header">
                <div class="dim-title-wrap">
                  <span class="dim-icon">{{ dim.icon }}</span>
                  <span class="dim-title">{{ dim.title }}</span>
                </div>
                <div class="dim-stats">
                  <span class="stat-badge level">L{{ dim.data.level }}</span>
                  <span class="stat-badge weight">Wt. {{ dim.data.weight }}</span>
                </div>
              </div>
              <p class="dim-desc">{{ dim.data.description || "暂无详细描述" }}</p>
            </div>
          </div>
        </div>

        <div v-else class="state-hint empty-detail">
          <span class="empty-icon">👈</span>
          <p>请从左侧列表中选择一个岗位查看详情</p>
        </div>
      </article>
    </main>
  </div>
</template>

<style scoped>
/* 引入现代设计变量 */
.job-profiles-container {
  --primary-color: var(--glass-primary);
  --primary-hover: var(--glass-primary-strong);
  --primary-light: rgba(217, 241, 255, 0.6);
  --bg-color: rgba(255, 255, 255, 0.3);
  --surface-color: rgba(255, 255, 255, 0.7);
  --border-color: rgba(255, 255, 255, 0.56);
  --text-main: var(--glass-title);
  --text-secondary: var(--glass-muted);
  --text-muted: rgba(77, 101, 139, 0.58);
  --radius-md: 18px;
  --radius-lg: 24px;
  --shadow-sm: inset 0 1px 0 rgba(255, 255, 255, 0.78);
  --shadow-md: 0 18px 34px rgba(48, 78, 134, 0.12);
  --shadow-float: 0 22px 42px rgba(40, 69, 124, 0.14);

  max-width: 1200px;
  margin: 24px auto;
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

/* 头部样式 */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 1px solid rgba(255, 255, 255, 0.46);
  padding-bottom: 18px;
}

.header-titles h2 {
  margin: 0 0 8px 0;
  color: var(--text-main);
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
}

.header-titles p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

/* 按钮样式 */
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.36));
  color: var(--text-main);
  border: 1px solid var(--border-color);
  padding: 10px 18px;
  border-radius: 16px;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: var(--shadow-sm);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(109, 194, 255, 0.88);
  box-shadow: var(--shadow-md);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 提示框 */
.notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 0.95rem;
  animation: slideDown 0.3s ease;
}

.notice-error {
  background: linear-gradient(135deg, rgba(255, 232, 236, 0.82), rgba(255, 244, 245, 0.52));
  color: #8c2343;
  border: 1px solid rgba(255, 214, 224, 0.78);
}

/* 布局网格 */
.layout-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
  align-items: start;
}

/* 通用卡片样式 */
.card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.28));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 18px 36px rgba(44, 73, 127, 0.1);
  backdrop-filter: blur(24px) saturate(170%);
  -webkit-backdrop-filter: blur(24px) saturate(170%);
  overflow: hidden;
}

/* 左侧栏 */
.left-panel {
  display: flex;
  flex-direction: column;
  height: 680px;
}

.filter-section {
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.42);
  background: rgba(255, 255, 255, 0.22);
}

.filter-label {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.select-wrapper select {
  width: 100%;
  appearance: none;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(255, 255, 255, 0.42))
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")
    no-repeat right 12px center/16px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 10px 36px 10px 12px;
  font-size: 0.95rem;
  color: var(--text-main);
  outline: none;
  transition: border-color 0.2s;
}

.select-wrapper select:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-light);
}

.list-section {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* 自定义滚动条 */
.list-section::-webkit-scrollbar {
  width: 6px;
}
.list-section::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 10px;
}

.profile-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-item {
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  background: rgba(255, 255, 255, 0.28);
}

.profile-item:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.44);
}

.profile-item.active {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(219, 241, 255, 0.42));
  border-color: rgba(107, 194, 255, 0.88);
  position: relative;
  box-shadow: 0 14px 28px rgba(53, 92, 161, 0.14);
}

.profile-item.active::before {
  content: "";
  position: absolute;
  left: -1px;
  top: 10%;
  height: 80%;
  width: 4px;
  background-color: var(--primary-color);
  border-radius: 0 4px 4px 0;
}

.item-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.item-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-main);
}

.profile-item.active .item-title {
  color: var(--primary-hover);
  font-weight: 600;
}

.item-badge {
  font-size: 0.75rem;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.54);
  color: var(--text-secondary);
  border-radius: 12px;
  white-space: nowrap;
  border: 1px solid var(--border-color);
}

/* 右侧详情 */
.right-panel {
  min-height: 680px;
  padding: 32px;
}

.detail-header {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.44);
}

.category-tag {
  display: inline-block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary-color);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(223, 242, 255, 0.54));
  padding: 5px 12px;
  border-radius: 999px;
  margin-bottom: 12px;
  border: 1px solid rgba(134, 214, 255, 0.78);
}

.job-title {
  margin: 0;
  font-size: 2rem;
  color: var(--text-main);
  font-weight: 800;
  letter-spacing: -0.02em;
}

/* 维度网格 */
.dimensions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.dimension-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.32));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 20px;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.dimension-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(239, 248, 255, 0.4));
}

.dim-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.dim-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dim-icon {
  font-size: 1.2rem;
}

.dim-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-main);
}

.dim-stats {
  display: flex;
  gap: 6px;
}

.stat-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.stat-badge.level {
  background: rgba(235, 255, 245, 0.82);
  color: #059669;
  border: 1px solid rgba(167, 243, 208, 0.78);
}

.stat-badge.weight {
  background: rgba(255, 240, 243, 0.82);
  color: #dc2626;
  border: 1px solid rgba(254, 202, 202, 0.78);
}

.dim-desc {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* 状态提示 (空状态 & 加载) */
.state-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  text-align: center;
  padding: 40px 20px;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-detail {
  min-height: 500px;
}

/* 简单加载动画 */
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 响应式调整 */
@media (max-width: 900px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .layout-grid {
    grid-template-columns: 1fr;
  }

  .left-panel {
    height: 400px; /* 移动端限制列表高度 */
  }

  .right-panel {
    padding: 20px;
  }
}
</style>
