<template>
  <section class="dashboard-page">
    <h1>Career Agent</h1>
    <p>全链路闭环：数据处理 -> 岗位画像 -> 路径图谱 -> 人岗匹配 -> 职业报告。</p>
    <nav class="entry-links">
      <RouterLink to="/pipeline">数据处理中心</RouterLink>
      <RouterLink to="/job-profiles">岗位画像中心</RouterLink>
      <RouterLink to="/career-paths">路径图谱中心</RouterLink>
      <RouterLink to="/profile">学生画像中心</RouterLink>
      <RouterLink to="/matching">匹配分析中心</RouterLink>
      <RouterLink to="/report">职业报告中心</RouterLink>
    </nav>
  </section>
</template>

<style>
.dashboard-page {
  max-width: 1100px;
  margin: 24px auto;
  padding: 32px;
  border: 1px solid var(--glass-border);
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0.24));
  backdrop-filter: blur(26px) saturate(170%);
  -webkit-backdrop-filter: blur(26px) saturate(170%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.76),
    0 24px 48px rgba(44, 73, 127, 0.12);
  position: relative;
  overflow: hidden;
}

.dashboard-page h1 {
  margin: 0;
  font-size: 40px;
  color: var(--glass-title);
  letter-spacing: -0.04em;
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
}

.dashboard-page p {
  margin: 12px 0 0;
  color: var(--glass-muted);
  max-width: 760px;
  line-height: 1.8;
}

.entry-links {
  margin-top: 24px;
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.entry-links a {
  display: block;
  padding: 16px 18px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.64);
  color: var(--glass-title);
  text-decoration: none;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.28));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 14px 26px rgba(46, 79, 138, 0.08);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease;
}

.entry-links a:hover {
  transform: translateY(-2px);
  border-color: rgba(107, 195, 255, 0.92);
  color: var(--glass-primary);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 18px 34px rgba(53, 92, 161, 0.14);
}

@media (max-width: 720px) {
  .dashboard-page {
    padding: 22px;
  }

  .dashboard-page h1 {
    font-size: 32px;
  }

  .entry-links {
    grid-template-columns: 1fr;
  }
}
</style>
