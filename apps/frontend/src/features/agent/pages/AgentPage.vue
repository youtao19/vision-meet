<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import type { AgentTaskResponse, JobRecord, StudentProfileRecord } from "@career/contracts/types";

import { createAgentTask } from "@/shared/api/agent";
import { ApiRequestError } from "@/shared/api/http";
import { fetchJobs } from "@/shared/api/jobs";
import { fetchStudentProfiles } from "@/shared/api/profile";

const router = useRouter();

const profiles = ref<StudentProfileRecord[]>([]);
const jobs = ref<JobRecord[]>([]);
const result = ref<AgentTaskResponse | null>(null);

const loading = reactive({
  bootstrap: false,
  analyze: false,
});

const form = reactive({
  studentProfileId: "",
  jobId: "",
  objective: "",
  forceRecalculate: false,
  topK: 5,
  deliverables: {
    matchAnalysis: true,
    careerReport: true,
  },
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

const selectedDeliverables = computed(() => {
  const items: Array<"match_analysis" | "career_report"> = [];
  if (form.deliverables.matchAnalysis) {
    items.push("match_analysis");
  }
  if (form.deliverables.careerReport) {
    items.push("career_report");
  }
  return items;
});

async function submitTask(): Promise<void> {
  const studentProfileId = toPositiveInt(form.studentProfileId);
  const jobId = toPositiveInt(form.jobId);
  if (!studentProfileId || !jobId) {
    uiState.error = "请选择合法的学生画像和岗位";
    return;
  }

  if (selectedDeliverables.value.length === 0) {
    uiState.error = "至少选择一个任务交付物";
    return;
  }

  loading.analyze = true;
  uiState.error = "";
  uiState.success = "";

  try {
    result.value = await createAgentTask({
      student_profile_id: studentProfileId,
      job_id: jobId,
      objective: form.objective.trim() || undefined,
      deliverables: selectedDeliverables.value,
      force_recalculate: form.forceRecalculate,
      top_k: form.topK,
    });

    uiState.success = result.value.result.report
      ? `Agent 任务 #${result.value.task_id} 已完成，并生成报告 #${result.value.result.report.id}`
      : `Agent 任务 #${result.value.task_id} 已完成，当前未生成报告产物`;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.analyze = false;
  }
}

function openReport(): void {
  if (!result.value?.result.match_result) {
    return;
  }

  router.push({
    path: "/report",
    query: {
      match_id: String(result.value.result.match_result.id),
    },
  });
}

const canAnalyze = computed(() => {
  return (
    toPositiveInt(form.studentProfileId) !== undefined &&
    toPositiveInt(form.jobId) !== undefined &&
    selectedDeliverables.value.length > 0
  );
});

onMounted(async () => {
  await bootstrap();
});
</script>

<template>
  <section class="agent-page">
    <header class="page-header">
      <div>
        <h2>任务型 Agent 执行器</h2>
        <p>围绕明确任务目标自动规划步骤、调用工具，并返回可追踪的最终产物。</p>
      </div>
      <RouterLink class="nav-link" to="/matching">返回匹配页</RouterLink>
    </header>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice notice-success">{{ uiState.success }}</p>

    <section class="panel">
      <h3>任务参数</h3>
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

      <label>
        任务目标
        <textarea
          v-model="form.objective"
          rows="3"
          :disabled="loading.analyze"
          placeholder="例如：评估该学生是否适合该岗位，并生成一份可以继续编辑的职业报告"
        />
      </label>

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

      <div class="deliverable-grid">
        <label class="checkbox-row">
          <input v-model="form.deliverables.matchAnalysis" type="checkbox" :disabled="loading.analyze" />
          输出匹配结论
        </label>
        <label class="checkbox-row">
          <input v-model="form.deliverables.careerReport" type="checkbox" :disabled="loading.analyze" />
          输出职业报告
        </label>
      </div>

      <button class="primary-btn" :disabled="!canAnalyze || loading.analyze" @click="submitTask">
        {{ loading.analyze ? "任务执行中..." : "创建 Agent 任务" }}
      </button>
    </section>

    <section v-if="result" class="result-layout">
      <section class="panel">
        <div class="panel-title-row">
          <h3>任务状态</h3>
          <span class="trace-tag">task #{{ result.task_id }}</span>
        </div>
        <p>trace_id：{{ result.trace_id }}</p>
        <p>状态：{{ result.status }}</p>
        <p>模型：{{ result.model || "未返回" }}</p>
        <p>目标：{{ result.objective }}</p>
        <p v-if="result.result.match_result">
          匹配结果：#{{ result.result.match_result.id }}，总分 {{ result.result.match_result.total_score }}
        </p>
        <p v-if="result.result.warnings.length === 0">本次执行未触发降级告警。</p>
        <div v-else class="warning-box">
          <p>降级提示：</p>
          <ul>
            <li v-for="warning in result.result.warnings" :key="warning">
              {{
                warning === "EVIDENCE_INSUFFICIENT"
                  ? "证据不足，部分结论依赖本地规则和已有数据。"
                  : warning === "KNOWLEDGE_SEARCH_FAILED"
                    ? "知识检索失败，任务已降级继续执行。"
                    : warning === "REPORT_TEMPLATE_FALLBACK"
                      ? "报告生成已回退到模板兜底版本。"
                      : warning === "REPORT_GENERATION_FAILED"
                        ? "报告生成失败，但匹配结论已保留。"
                        : "最终总结使用了规则兜底版本。"
              }}
            </li>
          </ul>
        </div>
      </section>

      <section class="panel">
        <h3>执行计划</h3>
        <ol class="plan-list">
          <li v-for="step in result.planned_steps" :key="step.id">
            <strong>{{ step.title }}</strong>
            <p class="muted">{{ step.purpose }}</p>
          </li>
        </ol>
      </section>

      <section class="panel">
        <h3>证据片段</h3>
        <div v-if="result.result.knowledge_hits.length > 0" class="knowledge-list">
          <article v-for="item in result.result.knowledge_hits" :key="item.id" class="knowledge-card">
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
        <h3>最终总结</h3>
        <p>{{ result.result.summary }}</p>
        <template v-if="result.result.match_result">
          <ul class="score-grid">
            <li>基础要求：{{ result.result.match_result.dimension_scores.base_requirements }}</li>
            <li>职业技能：{{ result.result.match_result.dimension_scores.professional_skills }}</li>
            <li>职业素养：{{ result.result.match_result.dimension_scores.professional_quality }}</li>
            <li>发展潜力：{{ result.result.match_result.dimension_scores.development_potential }}</li>
          </ul>
          <div class="sub-panel">
            <h4>建议</h4>
            <ul>
              <li v-for="item in result.result.match_result.suggestions" :key="item">{{ item }}</li>
            </ul>
          </div>
        </template>
      </section>

      <section class="panel">
        <div class="panel-title-row">
          <h3>报告结果</h3>
          <button v-if="result.result.report" class="primary-btn" @click="openReport">查看报告</button>
        </div>
        <div v-if="result.result.report" class="report-card">
          <p>报告 #{{ result.result.report.id }}，版本 V{{ result.result.report.version }}</p>
          <p>章节数：{{ result.result.report.sections.length }}，总分：{{ result.result.report.total_score }}</p>
        </div>
        <p v-else class="empty-text">当前未生成报告产物。</p>
      </section>

      <section class="panel full-width">
        <h3>步骤轨迹</h3>
        <table class="trace-table">
          <thead>
            <tr>
              <th>步骤</th>
              <th>工具</th>
              <th>状态</th>
              <th>耗时</th>
              <th>输入摘要</th>
              <th>输出摘要</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in result.step_trace" :key="`${item.step_id}-${item.input_summary}`">
              <td>{{ item.title }}</td>
              <td>{{ item.tool }}</td>
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
textarea,
input[type="number"] {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  font: inherit;
}

textarea {
  resize: vertical;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-row input {
  width: auto;
}

.deliverable-grid {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 16px;
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

.warning-box ul {
  margin: 8px 0 0;
  padding-left: 18px;
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
.score-grid,
.plan-list {
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
.report-card p,
.plan-list p {
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

.plan-list {
  margin: 0;
  padding-left: 20px;
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
