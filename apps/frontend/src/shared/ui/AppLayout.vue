<template>
  <div :class="{ dark: isDark }" class="font-body text-slate-800 dark:text-slate-200 transition-colors bg-surface dark:bg-[#1a2438] min-h-screen">
    <!-- TopNavBar -->
    <header class="sticky top-0 z-50 flex items-center justify-between px-6 h-16 w-full backdrop-blur-lg border-b border-sky-400/10 shadow-[0_0_30px_rgba(125,211,252,0.05)] bg-slate-100/60 dark:bg-slate-900/60">
      <div class="flex items-center gap-4">
        <span class="text-2xl font-semibold tracking-tight text-sky-600 dark:text-sky-300 font-['Inter']">预见遇见</span>
      </div>
      <div class="flex items-center gap-4">
        <button @click="toggleDark" class="p-2 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300 active:scale-95 transition-all outline-none" title="切换显示模式">
          <span class="material-symbols-outlined">{{ isDark ? 'light_mode' : 'dark_mode' }}</span>
        </button>
        <button class="p-2 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300 active:scale-95 transition-all">
          <span class="material-symbols-outlined">notifications</span>
        </button>
        <button class="p-2 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300 active:scale-95 transition-all">
          <span class="material-symbols-outlined">settings</span>
        </button>
      </div>
    </header>

    <div class="flex min-h-[calc(100vh-4rem)]">
      <!-- SideNavBar -->
      <aside class="hidden md:flex fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 flex-col pt-4 pb-8 backdrop-blur-xl border-r border-sky-400/10 shadow-2xl z-40 bg-slate-100/70 dark:bg-slate-900/70">
        <nav class="flex-1 space-y-1">
          <RouterLink to="/" class="text-slate-600 dark:text-slate-400 flex items-center gap-3 px-4 py-3 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200">
            <span class="material-symbols-outlined">dashboard</span>
            <span class="font-['Inter'] text-sm font-medium">控制台</span>
          </RouterLink>
          <RouterLink to="/pipeline" class="text-slate-600 dark:text-slate-400 flex items-center gap-3 px-4 py-3 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200">
            <span class="material-symbols-outlined">hub</span>
            <span class="font-['Inter'] text-sm font-medium">数据处理中心</span>
          </RouterLink>
          <RouterLink to="/job-profiles" class="text-slate-600 dark:text-slate-400 flex items-center gap-3 px-4 py-3 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200">
            <span class="material-symbols-outlined">explore</span>
            <span class="font-['Inter'] text-sm font-medium">岗位画像中心</span>
          </RouterLink>
          <RouterLink to="/career-paths" class="text-slate-600 dark:text-slate-400 flex items-center gap-3 px-4 py-3 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200">
            <span class="material-symbols-outlined">route</span>
            <span class="font-['Inter'] text-sm font-medium">路径图谱中心</span>
          </RouterLink>
          <RouterLink to="/profile" class="text-slate-600 dark:text-slate-400 flex items-center gap-3 px-4 py-3 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200">
            <span class="material-symbols-outlined">person</span>
            <span class="font-['Inter'] text-sm font-medium">学生画像中心</span>
          </RouterLink>
          <RouterLink to="/matching" class="text-slate-600 dark:text-slate-400 flex items-center gap-3 px-4 py-3 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200">
            <span class="material-symbols-outlined">compare_arrows</span>
            <span class="font-['Inter'] text-sm font-medium">匹配分析中心</span>
          </RouterLink>
          <RouterLink to="/report" class="text-slate-600 dark:text-slate-400 flex items-center gap-3 px-4 py-3 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200">
            <span class="material-symbols-outlined">analytics</span>
            <span class="font-['Inter'] text-sm font-medium">职业报告中心</span>
          </RouterLink>
          <RouterLink to="/agent" class="text-slate-600 dark:text-slate-400 flex items-center gap-3 px-4 py-3 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200">
            <span class="material-symbols-outlined">smart_toy</span>
            <span class="font-['Inter'] text-sm font-medium">Pi Agent</span>
          </RouterLink>
        </nav>
      </aside>

      <!-- Main Content Area -->
      <main class="md:ml-64 flex-1 w-full min-h-full p-6 lg:p-10">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const isDark = ref(true);

function toggleDark() {
  isDark.value = !isDark.value;
  updateHtmlClass();
}

function updateHtmlClass() {
  if (isDark.value) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

onMounted(() => {
  updateHtmlClass();
});
</script>

<style>
/* Base theme variables */
:root {
  --primary: #006382;
}

.dark {
  --primary: #7bd1fa;
}

.glass-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(125, 211, 252, 0.1);
}

.glass-card-elevated {
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(125, 211, 252, 0.15);
}

.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

/* 暗色模式下统一覆盖各业务页的浅色背景，避免出现黑白混杂 */
.dark :is(
    .dashboard-page,
    .pipeline-page,
    .job-profiles-page,
    .career-path-page,
    .profile-page,
    .matching-page,
    .report-page,
    .agent-page
  ) {
  color: #e2e8f0 !important;
}

.dark :is(
    .dashboard-page,
    .pipeline-page,
    .job-profiles-page,
    .career-path-page,
    .profile-page,
    .matching-page,
    .report-page,
    .agent-page
  ) :is(.panel, .task-card, .detail-panel, .warning-box, .entry-links a, .profile-list li, article, table, thead, tbody, tr, th, td) {
  background: #0f172a !important;
  border-color: #334155 !important;
  color: #e2e8f0 !important;
}

.dark :is(
    .dashboard-page,
    .pipeline-page,
    .job-profiles-page,
    .career-path-page,
    .profile-page,
    .matching-page,
    .report-page,
    .agent-page
  ) :is(h1, h2, h3, h4, p, label, li, span, strong) {
  color: #cbd5e1 !important;
}

.dark :is(
    .dashboard-page,
    .pipeline-page,
    .job-profiles-page,
    .career-path-page,
    .profile-page,
    .matching-page,
    .report-page,
    .agent-page
  ) :is(input, select, textarea) {
  background: #111827 !important;
  border-color: #374151 !important;
  color: #e2e8f0 !important;
}

.dark :is(
    .dashboard-page,
    .pipeline-page,
    .job-profiles-page,
    .career-path-page,
    .profile-page,
    .matching-page,
    .report-page,
    .agent-page
  ) :is(.ghost-btn, .nav-link) {
  background: #1f2937 !important;
  border-color: #475569 !important;
  color: #e2e8f0 !important;
}

.dark :is(
    .dashboard-page,
    .pipeline-page,
    .job-profiles-page,
    .career-path-page,
    .profile-page,
    .matching-page,
    .report-page,
    .agent-page
  ) :is(.notice-error, .notice-success) {
  border: 1px solid transparent !important;
}

.dark :is(
    .dashboard-page,
    .pipeline-page,
    .job-profiles-page,
    .career-path-page,
    .profile-page,
    .matching-page,
    .report-page,
    .agent-page
  ) .notice-error {
  background: #3f1d1d !important;
  color: #fecaca !important;
  border-color: #7f1d1d !important;
}

.dark :is(
    .dashboard-page,
    .pipeline-page,
    .job-profiles-page,
    .career-path-page,
    .profile-page,
    .matching-page,
    .report-page,
    .agent-page
  ) .notice-success {
  background: #10271b !important;
  color: #bbf7d0 !important;
  border-color: #166534 !important;
}
</style>
