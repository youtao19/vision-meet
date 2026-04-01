<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";

import type { StudentProfileRecord } from "@career/contracts/types";

import { ApiRequestError } from "@/shared/api/http";
import {
  createStudentProfile,
  createStudentProfileFromResume,
  fetchStudentProfiles,
} from "@/shared/api/profile";

const profiles = ref<StudentProfileRecord[]>([]);

const loading = reactive({
  list: false,
  createManual: false,
  createResume: false,
});

const manualForm = reactive({
  name: "",
  targetRole: "",
  skills: "",
  personalSummary: "",
});

const resumeForm = reactive({
  targetRole: "",
  name: "",
  parseMode: "tolerant" as "strict" | "tolerant",
});

const resumeFile = ref<File | null>(null);

const uiState = reactive({
  error: "",
  success: "",
});

function parseSkillText(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[，,\n\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.traceId
      ? `${error.message}（trace_id: ${error.traceId}）`
      : error.message;
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
    const response = await fetchStudentProfiles();
    profiles.value = response.items;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.list = false;
  }
}

async function submitManualProfile(): Promise<void> {
  const skills = parseSkillText(manualForm.skills);
  if (!manualForm.name.trim() || !manualForm.targetRole.trim() || skills.length === 0) {
    uiState.error = "姓名、目标岗位、技能为必填";
    return;
  }

  loading.createManual = true;
  uiState.error = "";
  uiState.success = "";

  try {
    await createStudentProfile({
      name: manualForm.name.trim(),
      target_role: manualForm.targetRole.trim(),
      skills,
      personal_summary: manualForm.personalSummary.trim() || undefined,
    });

    uiState.success = "已创建学生画像（手动录入）";
    manualForm.name = "";
    manualForm.targetRole = "";
    manualForm.skills = "";
    manualForm.personalSummary = "";
    await loadProfiles();
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.createManual = false;
  }
}

async function submitResumeProfile(): Promise<void> {
  if (!resumeFile.value) {
    uiState.error = "请先选择简历文件";
    return;
  }

  if (!resumeForm.targetRole.trim()) {
    uiState.error = "请填写目标岗位";
    return;
  }

  loading.createResume = true;
  uiState.error = "";
  uiState.success = "";

  try {
    await createStudentProfileFromResume({
      file: resumeFile.value,
      targetRole: resumeForm.targetRole.trim(),
      name: resumeForm.name.trim() || undefined,
      parseMode: resumeForm.parseMode,
    });

    uiState.success = "已创建学生画像（简历上传）";
    resumeFile.value = null;
    resumeForm.name = "";
    resumeForm.targetRole = "";
    resumeForm.parseMode = "tolerant";
    await loadProfiles();
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.createResume = false;
  }
}

function onResumeChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files && input.files[0] ? input.files[0] : null;
  resumeFile.value = file;
}

onMounted(loadProfiles);
</script>

<template>
  <section class="profile-page">
    <header class="page-header">
      <h2>学生画像</h2>
      <p>支持手动录入与简历上传，两种入口生成统一结构的学生画像。</p>
    </header>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice notice-success">{{ uiState.success }}</p>

    <section class="panel">
      <h3>手动录入</h3>
      <div class="grid two-col">
        <label>
          姓名
          <input v-model="manualForm.name" type="text" placeholder="例如：张三" :disabled="loading.createManual" />
        </label>
        <label>
          目标岗位
          <input
            v-model="manualForm.targetRole"
            type="text"
            placeholder="例如：前端开发工程师"
            :disabled="loading.createManual"
          />
        </label>
      </div>

      <label>
        技能（逗号或空格分隔）
        <input
          v-model="manualForm.skills"
          type="text"
          placeholder="TypeScript, Vue, 测试"
          :disabled="loading.createManual"
        />
      </label>

      <label>
        个人摘要（可选）
        <input
          v-model="manualForm.personalSummary"
          type="text"
          placeholder="一句话说明优势"
          :disabled="loading.createManual"
        />
      </label>

      <button class="primary-btn" :disabled="loading.createManual" @click="submitManualProfile">
        {{ loading.createManual ? "提交中..." : "创建手动画像" }}
      </button>
    </section>

    <section class="panel">
      <h3>简历上传</h3>
      <div class="grid two-col">
        <label>
          目标岗位
          <input
            v-model="resumeForm.targetRole"
            type="text"
            placeholder="例如：后端开发工程师"
            :disabled="loading.createResume"
          />
        </label>
        <label>
          姓名（可选）
          <input v-model="resumeForm.name" type="text" placeholder="不填则自动提取" :disabled="loading.createResume" />
        </label>
      </div>

      <div class="grid two-col">
        <label>
          解析模式
          <select v-model="resumeForm.parseMode" :disabled="loading.createResume">
            <option value="tolerant">tolerant（容错）</option>
            <option value="strict">strict（严格）</option>
          </select>
        </label>

        <label>
          简历文件
          <input type="file" accept=".txt,.md,.csv,.json" :disabled="loading.createResume" @change="onResumeChange" />
        </label>
      </div>

      <button class="primary-btn" :disabled="loading.createResume" @click="submitResumeProfile">
        {{ loading.createResume ? "上传中..." : "创建简历画像" }}
      </button>
    </section>

    <section class="panel">
      <h3>画像列表</h3>
      <button class="ghost-btn" :disabled="loading.list" @click="loadProfiles">
        {{ loading.list ? "刷新中..." : "刷新画像列表" }}
      </button>

      <ul class="profile-list">
        <li v-for="profile in profiles" :key="profile.id">
          <div>
            <strong>#{{ profile.id }} {{ profile.name }}</strong>
            <p>目标岗位：{{ profile.target_role }}</p>
            <p>完整度：{{ profile.completeness_score }}，竞争力：{{ profile.competitiveness_score }}</p>
          </div>
        </li>
        <li v-if="profiles.length === 0" class="empty">暂无画像数据</li>
      </ul>

      <RouterLink class="goto-matching" to="/matching">前往人岗匹配分析</RouterLink>
    </section>
  </section>
</template>

<style scoped>
.profile-page {
  max-width: 980px;
  margin: 24px auto;
  display: grid;
  gap: 16px;
}

.page-header h2 {
  margin: 0;
  color: #0f172a;
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

.notice-success {
  background: #dcfce7;
  color: #166534;
}

.panel {
  padding: 16px;
  border: 1px solid #dbe4f0;
  border-radius: 12px;
  background: #ffffff;
}

.panel h3 {
  margin: 0 0 12px;
}

.grid {
  display: grid;
  gap: 12px;
}

.two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

label {
  display: grid;
  gap: 6px;
  color: #334155;
}

input,
select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
}

.primary-btn,
.ghost-btn {
  margin-top: 12px;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
}

.primary-btn {
  border: 1px solid #0f766e;
  background: #0f766e;
  color: #ffffff;
}

.ghost-btn {
  border: 1px solid #94a3b8;
  background: #f8fafc;
  color: #0f172a;
}

.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.profile-list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.profile-list li {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
}

.profile-list p {
  margin: 4px 0 0;
  color: #475569;
}

.empty {
  text-align: center;
  color: #64748b;
}

.goto-matching {
  display: inline-block;
  margin-top: 12px;
  color: #0f766e;
}

@media (max-width: 860px) {
  .two-col {
    grid-template-columns: 1fr;
  }
}
</style>
