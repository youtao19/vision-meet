<template>
  <section class="dashboard-page">
    <h1>Career Agent V2</h1>
    <p>全链路闭环：数据处理 -> 岗位画像 -> 路径图谱 -> 人岗匹配 -> 职业报告。</p>
    <nav class="entry-links">
      <RouterLink to="/pipeline">数据处理中心</RouterLink>
      <RouterLink to="/job-profiles">岗位画像中心</RouterLink>
      <RouterLink to="/career-paths">路径图谱中心</RouterLink>
      <RouterLink to="/profile">学生画像中心</RouterLink>
      <RouterLink to="/matching">匹配分析中心</RouterLink>
      <RouterLink to="/report">职业报告中心</RouterLink>
      <RouterLink to="/agent">Pi Agent</RouterLink>
    </nav>
  </section>
</template>

<style scoped>
.dashboard-page {
  max-width: 980px;
  margin: 40px auto;
  padding: 28px;
  border: 1px solid #dbe4f0;
  border-radius: 18px;
  background: linear-gradient(140deg, #fff7ed 0%, #f8fafc 55%, #ecfeff 100%);
}

h1 {
  margin: 0;
  font-size: 34px;
  color: #111827;
}

p {
  margin: 10px 0 0;
  color: #334155;
}

.entry-links {
  margin-top: 18px;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.entry-links :deep(a) {
  display: block;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  color: #1f2937;
  text-decoration: none;
  background: #ffffff;
}

.entry-links :deep(a:hover) {
  border-color: #0f766e;
  color: #0f766e;
}

@media (max-width: 720px) {
  .entry-links {
    grid-template-columns: 1fr;
  }
}
</style>
