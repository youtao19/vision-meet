<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import type {
  AgentAnalyzeResponse,
  JobRecord,
  StudentProfileRecord,
} from "@career/contracts/types";

import { runAgentAnalysis } from "@/shared/api/agent";
import { ApiRequestError } from "@/shared/api/http";
import { fetchJobs } from "@/shared/api/jobs";
import { fetchStudentProfiles } from "@/shared/api/profile";

const router = useRouter();

const profiles = ref<StudentProfileRecord[]>([]);
const jobs = ref<JobRecord[]>([]);
const result = ref<AgentAnalyzeResponse | null>(null);

const loading = reactive({
  bootstrap: false,
  analyze: false,
});

const form = reactive({
  studentProfileId: "",
  jobId: "",
  forceRecalculate: false,
  topK: 5,
});

const uiState = reactive({
  error: "",
  success: "",
});

function toPositiveInt(raw: string): number | undefined {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.traceId ? `${error.message}（trace_id: ${error.traceId}）` : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "请求失败，请稍后重试";
}

async function bootstrap(): Promise<void> {
  loading.bootstrap = true;
  uiState.error = "";

  try {
    const [profileResponse, jobsResponse] = await Promise.all([fetchStudentProfiles(), fetchJobs(50)]);
    profiles.value = profileResponse.items;
    jobs.value = jobsResponse.items;

    if (!form.studentProfileId && profiles.value[0]) {
      form.studentProfileId = String(profiles.value[0].id);
    }

    if (!form.jobId && jobs.value[0]) {
      form.jobId = String(jobs.value[0].id);
    }
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.bootstrap = false;
  }
}

async function submitAnalyze(): Promise<void> {
  const studentProfileId = toPositiveInt(form.studentProfileId);
  const jobId = toPositiveInt(form.jobId);
  if (!studentProfileId || !jobId) {
    uiState.error = "请选择合法的学生画像和岗位";
    return;
  }

  loading.analyze = true;
  uiState.error = "";
  uiState.success = "";

  try {
    result.value = await runAgentAnalysis({
      student_profile_id: studentProfileId,
      job_id: jobId,
      force_recalculate: form.forceRecalculate,
      top_k: form.topK,
    });

    uiState.success = result.value.report
      ? `Pi Agent 已完成分析并生成报告 #${result.value.report.id}`
      : "Pi Agent 已完成匹配分析，但本次未生成证据型报告";
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.analyze = false;
  }
}

function openReport(): void {
  if (!result.value) {
    return;
  }

  router.push({
    path: "/report",
    query: {
      match_id: String(result.value.match_result.id),
    },
  });
}

const canAnalyze = computed(() => {
  return toPositiveInt(form.studentProfileId) !== undefined && toPositiveInt(form.jobId) !== undefined;
});

onMounted(async () => {
  await bootstrap();
});
</script>

<template>
  <section class="agent-page">
    <header class="page-header">
      <div>
        <h2>Pi Agent 编排分析</h2>
        <p>统一执行知识检索、匹配分析、LLM 摘要和报告生成，输出可追踪的工具轨迹。</p>
      </div>
      <RouterLink class="nav-link" to="/matching">返回匹配页</RouterLink>
    </header>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice notice-success">{{ uiState.success }}</p>

    <section class="panel">
      <h3>执行参数</h3>
      <div class="grid two-col">
        <label>
          学生画像
          <select v-model="form.studentProfileId" :disabled="loading.bootstrap || loading.analyze">
            <option value="">请选择</option>
            <option v-for="profile in profiles" :key="profile.id" :value="String(profile.id)">
              #{{ profile.id }} {{ profile.name }}（{{ profile.target_role }}）
            </option>
          </select>
        </label>

        <label>
          目标岗位
          <select v-model="form.jobId" :disabled="loading.bootstrap || loading.analyze">
            <option value="">请选择</option>
            <option v-for="job in jobs" :key="job.id" :value="String(job.id)">
              #{{ job.id }} {{ job.title }}
            </option>
          </select>
        </label>
      </div>

      <div class="grid two-col">
        <label>
          检索 Top K
          <input v-model.number="form.topK" type="number" min="1" max="10" :disabled="loading.analyze" />
        </label>

        <label class="checkbox-row">
          <input v-model="form.forceRecalculate" type="checkbox" :disabled="loading.analyze" />
          强制重算匹配结果
        </label>
      </div>

      <button class="primary-btn" :disabled="!canAnalyze || loading.analyze" @click="submitAnalyze">
        {{ loading.analyze ? "编排执行中..." : "运行 Pi Agent" }}
      </button>
    </section>

    <section v-if="result" class="result-layout">
      <section class="panel">
        <div class="panel-title-row">
          <h3>执行状态</h3>
          <span class="trace-tag">run #{{ result.agent_run_id }}</span>
        </div>
        <p>trace_id：{{ result.trace_id }}</p>
        <p>模型：{{ result.model || "未返回" }}</p>
        <p>匹配结果：#{{ result.match_result.id }}，总分 {{ result.match_result.total_score }}</p>
        <p v-if="result.warnings.length === 0">本次执行未触发降级告警。</p>
        <div v-else class="warning-box">
          <p>降级提示：</p>
          <ul>
            <li
              v-for="warning in result.warnings"
              :key="warning"
            >
              {{
                warning === "EVIDENCE_INSUFFICIENT"
                  ? "已完成匹配，但未生成证据型报告。"
                  : "报告生成已回退到模板兜底版本。"
              }}
            </li>
          </ul>
        </div>
      </section>

      <section class="panel">
        <h3>证据片段</h3>
        <div v-if="result.knowledge_hits.length > 0" class="knowledge-list">
          <article v-for="item in result.knowledge_hits" :key="item.id" class="knowledge-card">
            <header>
              <strong>{{ item.title }}</strong>
              <span>score {{ item.final_score.toFixed(3) }}</span>
            </header>
            <p v-if="item.section_path" class="muted">{{ item.section_path }}</p>
            <p>{{ item.chunk_text }}</p>
          </article>
        </div>
        <p v-else class="empty-text">本次没有检索到可用证据。</p>
      </section>

      <section class="panel">
        <h3>匹配摘要</h3>
        <ul class="score-grid">
          <li>基础要求：{{ result.match_result.dimension_scores.base_requirements }}</li>
          <li>职业技能：{{ result.match_result.dimension_scores.professional_skills }}</li>
          <li>职业素养：{{ result.match_result.dimension_scores.professional_quality }}</li>
          <li>发展潜力：{{ result.match_result.dimension_scores.development_potential }}</li>
        </ul>
        <div class="sub-panel">
          <h4>建议</h4>
          <ul>
            <li v-for="item in result.match_result.suggestions" :key="item">{{ item }}</li>
          </ul>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title-row">
          <h3>报告结果</h3>
          <button v-if="result.report" class="primary-btn" @click="openReport">查看报告</button>
        </div>
        <div v-if="result.report" class="report-card">
          <p>报告 #{{ result.report.id }}，版本 V{{ result.report.version }}</p>
          <p>章节数：{{ result.report.sections.length }}，总分：{{ result.report.total_score }}</p>
        </div>
        <p v-else class="empty-text">当前只有匹配结果，未生成证据型报告。</p>
      </section>

      <section class="panel full-width">
        <h3>工具轨迹</h3>
        <table class="trace-table">
          <thead>
            <tr>
              <th>步骤</th>
              <th>状态</th>
              <th>耗时</th>
              <th>输入摘要</th>
              <th>输出摘要</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in result.tool_trace" :key="`${item.step}-${item.input_summary}`">
              <td>{{ item.step }}</td>
              <td>{{ item.status }}</td>
              <td>{{ item.duration_ms }} ms</td>
              <td>{{ item.input_summary }}</td>
              <td>{{ item.output_summary }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </section>
  </section>
</template>

<style scoped>
.agent-page {
  max-width: 1120px;
  margin: 24px auto;
  display: grid;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.page-header h2 {
  margin: 0 0 8px;
  color: #0f172a;
}

.page-header p {
  margin: 0;
  color: #475569;
}

.nav-link {
  color: #1d4ed8;
  text-decoration: none;
}

.panel {
  padding: 20px;
  border-radius: 16px;
  border: 1px solid #dbe3f0;
  background: #ffffff;
}

.panel h3,
.panel h4 {
  margin: 0 0 12px;
  color: #0f172a;
}

.grid {
  display: grid;
  gap: 16px;
}

.two-col {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

label {
  display: grid;
  gap: 8px;
  color: #334155;
  font-weight: 600;
}

select,
input[type="number"] {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  font: inherit;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-row input {
  width: auto;
}

.primary-btn,
.notice,
.warning-box,
.trace-tag {
  border-radius: 12px;
}

.primary-btn {
  margin-top: 16px;
  padding: 10px 16px;
  border: none;
  background: #0f766e;
  color: #ffffff;
  cursor: pointer;
}

.primary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.notice {
  margin: 0;
  padding: 12px 16px;
}

.notice-error {
  background: #fee2e2;
  color: #991b1b;
}

.notice-success {
  background: #dcfce7;
  color: #166534;
}

.warning-box {
  padding: 12px 16px;
  background: #fff7ed;
  color: #9a3412;
}

.result-layout {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.full-width {
  grid-column: 1 / -1;
}

.panel-title-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.trace-tag {
  padding: 4px 10px;
  background: #e0f2fe;
  color: #0369a1;
}

.knowledge-list,
.score-grid {
  display: grid;
  gap: 12px;
}

.knowledge-card,
.sub-panel,
.report-card {
  padding: 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.knowledge-card header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.knowledge-card p,
.report-card p {
  margin: 0;
}

.muted,
.empty-text {
  color: #64748b;
}

.score-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  list-style: none;
  padding: 0;
  margin: 0;
}

.trace-table {
  width: 100%;
  border-collapse: collapse;
}

.trace-table th,
.trace-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  vertical-align: top;
}

@media (max-width: 900px) {
  .result-layout {
    grid-template-columns: 1fr;
  }
}
</style>
