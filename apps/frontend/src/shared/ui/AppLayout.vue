<template>
  <div class="app-shell">
    <aside class="sidenav">
      <RouterLink to="/profile" class="brand-card" aria-label="返回学生画像">
        <span class="brand-icon material-symbols-outlined">route</span>
        <span class="brand-copy">
          <span class="brand-mark">预见遇见</span>
          <span class="brand-subtitle">Career Agent</span>
        </span>
      </RouterLink>

      <nav class="nav-list">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-link"
        >
          <span class="material-symbols-outlined">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidenav-footer">
        <span class="material-symbols-outlined">verified</span>
        <span>画像 · 匹配 · 报告闭环</span>
      </div>
    </aside>

    <div class="shell-body">
      <header class="topbar">
        <div class="breadcrumb-group">
          <div>
            <p class="breadcrumb">工作台 / {{ currentTitle }}</p>
            <h1>{{ currentTitle }}</h1>
          </div>
        </div>

        <div class="topbar-actions">
          <button class="icon-btn" type="button" aria-label="通知">
            <span class="material-symbols-outlined">notifications</span>
          </button>
          <button class="icon-btn" type="button" aria-label="帮助">
            <span class="material-symbols-outlined">help</span>
          </button>
          <RouterLink to="/report" class="icon-btn" aria-label="报告中心">
            <span class="material-symbols-outlined">edit_note</span>
          </RouterLink>
        </div>
      </header>

      <main class="main-content"><RouterView /></main>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 文件作用：应用级页面壳层。
 * 职责说明：统一承载侧边导航、顶部上下文信息和页面内容出口；业务数据仍由各 feature 页面负责。
 */
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

const navItems = [
  { path: "/job-profiles", label: "岗位画像", icon: "badge" },
  { path: "/profile", label: "学生画像", icon: "person" },
  { path: "/career-paths", label: "路径图谱", icon: "route" },
  { path: "/matching", label: "匹配分析", icon: "compare_arrows" },
  { path: "/report", label: "职业报告", icon: "analytics" },
] as const;

const titleByPath: ReadonlyMap<string, string> = new Map(
  navItems.map((item) => [item.path, item.label]),
);

const currentTitle = computed(() => titleByPath.get(route.path) ?? "工作台");
</script>

<style>
:root {
  --glass-bg:
    radial-gradient(circle at 10% 10%, rgba(255, 255, 255, 0.8), transparent 22%),
    radial-gradient(circle at 88% 18%, rgba(156, 230, 255, 0.52), transparent 24%),
    radial-gradient(circle at 78% 84%, rgba(255, 201, 236, 0.38), transparent 20%),
    linear-gradient(145deg, #dff5ff 0%, #eef4ff 36%, #f8f6ff 68%, #fff5ef 100%);
  --glass-panel: linear-gradient(135deg, rgba(255, 255, 255, 0.64), rgba(255, 255, 255, 0.24));
  --glass-panel-strong: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.78),
    rgba(255, 255, 255, 0.32)
  );
  --glass-border: rgba(255, 255, 255, 0.56);
  --glass-stroke: rgba(255, 255, 255, 0.72);
  --glass-title: #11233f;
  --glass-muted: rgba(37, 55, 88, 0.74);
  --glass-primary: #1787c7;
  --glass-primary-strong: #3558d6;
  --glass-shadow: 0 24px 64px rgba(38, 63, 110, 0.14);
  --glass-radius-xl: 28px;
  --glass-radius-lg: 22px;
  --glass-radius-md: 16px;
  --glass-transition: 180ms ease;
}

html,
body,
#app {
  min-height: 100%;
}

body {
  margin: 0;
  background: var(--glass-bg);
  color: var(--glass-title);
  font-family: "Avenir Next", "PingFang SC", "Noto Sans SC", sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

.app-shell {
  min-height: 100vh;
  position: relative;
  isolation: isolate;
}

.app-shell::before,
.app-shell::after {
  content: "";
  position: fixed;
  border-radius: 999px;
  pointer-events: none;
  z-index: -1;
  filter: blur(18px);
}

.app-shell::before {
  width: 360px;
  height: 360px;
  top: -96px;
  right: -72px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.86) 0%, rgba(255, 255, 255, 0) 72%);
}

.app-shell::after {
  width: 320px;
  height: 320px;
  left: -84px;
  bottom: 8vh;
  background: radial-gradient(circle, rgba(126, 217, 255, 0.34) 0%, rgba(126, 217, 255, 0) 76%);
}

.shell-body {
  min-height: 100vh;
  padding: 0 14px 14px;
}

.sidenav {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 60;
  width: 220px;
  padding: 18px 12px;
  border-right: 1px solid rgba(31, 58, 97, 0.08);
  background: rgba(255, 255, 255, 0.34);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  box-shadow: none;
  display: flex;
  flex-direction: column;
}

.brand-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 6px 8px;
  border-radius: 12px;
  color: var(--glass-title);
  text-decoration: none;
}

.brand-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: white;
  background: linear-gradient(135deg, var(--glass-primary), var(--glass-primary-strong));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 18px rgba(36, 110, 190, 0.16);
}

.brand-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.brand-mark {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0;
  color: var(--glass-title);
}

.brand-subtitle {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(31, 58, 97, 0.58);
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 20px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  text-decoration: none;
  color: rgba(31, 58, 97, 0.76);
  font-size: 14px;
  font-weight: 700;
  transition:
    transform var(--glass-transition),
    color var(--glass-transition),
    background var(--glass-transition),
    box-shadow var(--glass-transition);
}

.nav-link:hover {
  transform: none;
  color: var(--glass-title);
  background: rgba(255, 255, 255, 0.38);
}

.nav-link.router-link-exact-active {
  color: #ffffff;
  background: linear-gradient(135deg, var(--glass-primary), var(--glass-primary-strong));
  box-shadow: 0 10px 22px rgba(39, 102, 202, 0.18);
}

.nav-link .material-symbols-outlined {
  font-size: 21px;
}

.nav-link.router-link-exact-active .material-symbols-outlined {
  color: #ffffff;
}

.sidenav-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  color: rgba(31, 58, 97, 0.62);
  font-size: 12px;
  line-height: 1.5;
}

.topbar {
  position: relative;
  z-index: 50;
  min-height: 58px;
  padding: 0 2px 0 4px;
  border-bottom: 1px solid rgba(31, 58, 97, 0.1);
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  box-shadow: none;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  align-items: center;
  gap: 14px;
}

.breadcrumb-group {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.menu-btn {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 12px;
  color: rgba(23, 53, 92, 0.72);
  background: transparent;
  display: none;
  align-items: center;
  justify-content: center;
}

.breadcrumb {
  margin: 0 0 3px;
  color: rgba(31, 58, 97, 0.58);
  font-size: 12px;
}

.topbar h1 {
  margin: 0;
  color: var(--glass-title);
  font-size: 18px;
  letter-spacing: 0;
}

.topbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.icon-btn {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(23, 53, 92, 0.68);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    transform var(--glass-transition),
    box-shadow var(--glass-transition),
    color var(--glass-transition);
  box-shadow: none;
}

.icon-btn:hover {
  transform: translateY(-1px);
  color: var(--glass-primary);
  background: rgba(255, 255, 255, 0.34);
  box-shadow: none;
}

.main-content {
  min-height: calc(100vh - 90px);
  padding: 16px 0 24px;
}

@media (min-width: 960px) {
  .shell-body {
    margin-left: 220px;
  }
}

.glass-card {
  background: var(--glass-panel);
  backdrop-filter: blur(24px) saturate(170%);
  -webkit-backdrop-filter: blur(24px) saturate(170%);
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 var(--glass-stroke),
    0 16px 32px rgba(49, 79, 136, 0.1);
}

.glass-card-elevated {
  background: var(--glass-panel-strong);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.62);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.76),
    0 20px 40px rgba(45, 76, 132, 0.14);
}

.material-symbols-outlined {
  font-variation-settings:
    "FILL" 0,
    "wght" 400,
    "GRAD" 0,
    "opsz" 24;
}
</style>
