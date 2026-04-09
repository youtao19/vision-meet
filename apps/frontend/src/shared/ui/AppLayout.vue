<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-group">
        <span class="brand-mark">预见遇见</span>
        <span class="brand-subtitle">Career Agent Console</span>
      </div>
      <div class="topbar-actions">
        <button class="icon-btn">
          <span class="material-symbols-outlined">notifications</span>
        </button>
        <button class="icon-btn">
          <span class="material-symbols-outlined">settings</span>
        </button>
      </div>
    </header>

    <div class="shell-body">
      <aside class="sidenav">
        <nav class="nav-list">
          <RouterLink to="/" class="nav-link">
            <span class="material-symbols-outlined">dashboard</span>
            <span>控制台</span>
          </RouterLink>
          <RouterLink to="/pipeline" class="nav-link">
            <span class="material-symbols-outlined">hub</span>
            <span>数据处理中心</span>
          </RouterLink>
          <RouterLink to="/profile" class="nav-link">
            <span class="material-symbols-outlined">person</span>
            <span>学生画像中心</span>
          </RouterLink>
          <RouterLink to="/job-profiles" class="nav-link">
            <span class="material-symbols-outlined">badge</span>
            <span>岗位画像中心</span>
          </RouterLink>
          <RouterLink to="/career-paths" class="nav-link">
            <span class="material-symbols-outlined">route</span>
            <span>路径图谱中心</span>
          </RouterLink>

          <RouterLink to="/matching" class="nav-link">
            <span class="material-symbols-outlined">compare_arrows</span>
            <span>匹配分析中心</span>
          </RouterLink>
          <RouterLink to="/report" class="nav-link">
            <span class="material-symbols-outlined">analytics</span>
            <span>职业报告中心</span>
          </RouterLink>
        </nav>
      </aside>

      <main class="main-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

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

.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  height: 78px;
  margin: 18px 18px 0;
  padding: 0 22px;
  border-radius: 24px;
  border: 1px solid var(--glass-border);
  background: var(--glass-panel);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  box-shadow:
    inset 0 1px 0 var(--glass-stroke),
    0 18px 42px rgba(48, 77, 131, 0.12);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brand-mark {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--glass-title);
}

.brand-subtitle {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(31, 58, 97, 0.58);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-btn {
  width: 42px;
  height: 42px;
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 14px;
  background: var(--glass-panel-strong);
  color: rgba(23, 53, 92, 0.68);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    transform var(--glass-transition),
    box-shadow var(--glass-transition),
    color var(--glass-transition);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.icon-btn:hover {
  transform: translateY(-1px);
  color: var(--glass-primary);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.76),
    0 12px 24px rgba(55, 90, 150, 0.12);
}

.shell-body {
  display: flex;
  min-height: calc(100vh - 96px);
}

.sidenav {
  position: fixed;
  top: 112px;
  left: 18px;
  width: 272px;
  height: calc(100vh - 130px);
  padding: 18px 14px;
  border: 1px solid var(--glass-border);
  border-radius: 28px;
  background: var(--glass-panel);
  backdrop-filter: blur(26px) saturate(170%);
  -webkit-backdrop-filter: blur(26px) saturate(170%);
  box-shadow:
    inset 0 1px 0 var(--glass-stroke),
    0 20px 42px rgba(43, 72, 126, 0.12);
  display: none;
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
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
  transform: translateX(2px);
  color: var(--glass-title);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.22));
}

.nav-link.router-link-exact-active {
  color: var(--glass-title);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(219, 241, 255, 0.38));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 14px 28px rgba(56, 92, 154, 0.14);
}

.main-content {
  width: 100%;
  min-height: 100%;
  padding: 22px 22px 36px;
}

@media (min-width: 768px) {
  .sidenav {
    display: flex;
  }

  .main-content {
    margin-left: 290px;
    padding: 24px 26px 40px;
  }
}

@media (max-width: 767px) {
  .topbar {
    margin: 12px 12px 0;
    height: 72px;
    padding: 0 16px;
  }

  .brand-mark {
    font-size: 24px;
  }

  .brand-subtitle {
    font-size: 10px;
    letter-spacing: 0.12em;
  }

  .main-content {
    padding: 14px 12px 28px;
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
