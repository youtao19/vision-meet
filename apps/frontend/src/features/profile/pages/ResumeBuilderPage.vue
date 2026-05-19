<script setup lang="ts">
/**
 * 文件作用：AI 简历生成页。
 * 职责说明：根据用户录入的结构化经历生成 HTML 简历，并提供历史简历回看。
 * 依赖边界：只调用 AI 简历生成 API，不写入学生画像；画像生成仍在学生画像中心完成。
 */
import { onMounted, reactive, ref } from "vue";
import type { CreateResumeHtmlRequest, ResumeHtmlListItem } from "@career/contracts/types";

import { createResumeHtml, getResumeHtmlRecord, listResumeHtmlRecords } from "@/shared/api/ai";
import { ApiRequestError } from "@/shared/api/http";

const resumeHistory = ref<ResumeHtmlListItem[]>([]);
const resumePreviewVisible = ref(false);
const resumePreviewHtml = ref("");

const loading = reactive({
  resumeGenerate: false,
  resumeHistory: false,
  resumePreviewLoad: false,
});

const uiState = reactive({
  error: "",
  success: "",
});

const resumeBuilder = reactive({
  basic: {
    name: "",
    phone: "",
    email: "",
    targetPosition: "",
    targetCity: "",
  },
  summary: "",
  education: {
    school: "",
    major: "",
    degree: "",
    period: "",
    gpa: "",
    coreCourses: "",
    honors: "",
  },
  experience: {
    organization: "",
    role: "",
    period: "",
    type: "project" as "project" | "internship" | "competition" | "campus",
    background: "",
    techStack: "",
    responsibilities: "",
    achievements: "",
    difficulties: "",
  },
  skills: "",
  certificates: "",
  awards: "",
  portfolioLinks: "",
});

function formatApiError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.traceId ? `${error.message}（trace_id: ${error.traceId}）` : error.message;
  }
  if (error instanceof Error) return error.message;
  return "请求失败，请稍后重试";
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function resetMessage(): void {
  uiState.error = "";
  uiState.success = "";
}

function buildResumeRequestPayload(): CreateResumeHtmlRequest {
  return {
    basic: {
      name: resumeBuilder.basic.name.trim(),
      phone: resumeBuilder.basic.phone.trim(),
      email: resumeBuilder.basic.email.trim(),
      target_position: resumeBuilder.basic.targetPosition.trim(),
      target_city: resumeBuilder.basic.targetCity.trim() || undefined,
    },
    summary: resumeBuilder.summary.trim() || undefined,
    educations: [
      {
        school: resumeBuilder.education.school.trim(),
        major: resumeBuilder.education.major.trim(),
        degree: resumeBuilder.education.degree.trim(),
        period: resumeBuilder.education.period.trim(),
        gpa: resumeBuilder.education.gpa.trim() || undefined,
        core_courses: resumeBuilder.education.coreCourses.trim() || undefined,
        honors: resumeBuilder.education.honors.trim() || undefined,
      },
    ],
    experiences: [
      {
        organization: resumeBuilder.experience.organization.trim(),
        role: resumeBuilder.experience.role.trim(),
        period: resumeBuilder.experience.period.trim(),
        type: resumeBuilder.experience.type,
        background: resumeBuilder.experience.background.trim() || undefined,
        tech_stack: resumeBuilder.experience.techStack.trim() || undefined,
        responsibilities: resumeBuilder.experience.responsibilities.trim(),
        achievements: resumeBuilder.experience.achievements.trim(),
        difficulties: resumeBuilder.experience.difficulties.trim() || undefined,
      },
    ],
    skills: resumeBuilder.skills.trim(),
    certificates: resumeBuilder.certificates.trim() || undefined,
    awards: resumeBuilder.awards.trim() || undefined,
    portfolio_links: resumeBuilder.portfolioLinks.trim() || undefined,
  };
}

function validateResumeBuilder(): string[] {
  const errors: string[] = [];
  if (!resumeBuilder.basic.name.trim()) errors.push("请填写姓名");
  if (!resumeBuilder.basic.phone.trim()) errors.push("请填写电话");
  if (!resumeBuilder.basic.email.trim()) errors.push("请填写邮箱");
  if (!resumeBuilder.basic.targetPosition.trim()) errors.push("请填写目标职位");
  if (!resumeBuilder.basic.targetCity.trim()) errors.push("请填写意向城市");
  if (
    !resumeBuilder.education.school.trim() ||
    !resumeBuilder.education.major.trim() ||
    !resumeBuilder.education.degree.trim() ||
    !resumeBuilder.education.period.trim()
  ) {
    errors.push("请完整填写教育背景");
  }
  if (!resumeBuilder.education.coreCourses.trim()) errors.push("请填写核心课程");
  if (
    !resumeBuilder.experience.organization.trim() ||
    !resumeBuilder.experience.role.trim() ||
    !resumeBuilder.experience.period.trim() ||
    !resumeBuilder.experience.background.trim() ||
    !resumeBuilder.experience.techStack.trim() ||
    !resumeBuilder.experience.responsibilities.trim() ||
    !resumeBuilder.experience.achievements.trim()
  ) {
    errors.push("请完整填写项目/实习经历");
  }
  if (!resumeBuilder.skills.trim()) errors.push("请填写专业技能");
  if (!resumeBuilder.certificates.trim() && !resumeBuilder.awards.trim()) {
    errors.push("请至少填写证书或奖项/竞赛经历");
  }
  return errors;
}

async function loadResumeHistory(): Promise<void> {
  loading.resumeHistory = true;
  try {
    const response = await listResumeHtmlRecords(0, 20);
    resumeHistory.value = response.items;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.resumeHistory = false;
  }
}

async function generateResumeWithAgent(): Promise<void> {
  resetMessage();
  const errors = validateResumeBuilder();
  if (errors.length > 0) {
    uiState.error = errors.join("；");
    return;
  }

  loading.resumeGenerate = true;
  try {
    const response = await createResumeHtml(buildResumeRequestPayload());
    resumePreviewVisible.value = true;
    resumePreviewHtml.value = response.html;
    uiState.success = `简历已生成（ID: ${response.resume_id}），已在右侧预览。`;
    await loadResumeHistory();
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.resumeGenerate = false;
  }
}

async function openResumeHistoryItem(resumeId: number): Promise<void> {
  resetMessage();
  loading.resumePreviewLoad = true;
  try {
    const record = await getResumeHtmlRecord(resumeId);
    resumePreviewVisible.value = true;
    resumePreviewHtml.value = record.html;
    uiState.success = `历史简历 #${record.id} 已载入预览。`;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.resumePreviewLoad = false;
  }
}

onMounted(() => {
  void loadResumeHistory();
});
</script>

<template>
  <section class="resume-builder-page">
    <header class="page-titlebar">
      <div>
        <p class="eyebrow">Resume Builder</p>
        <h2>简历生成</h2>
        <p>录入结构化经历，由 Agent 生成可预览的 HTML 简历；学生画像解析请回到学生画像中心。</p>
      </div>
      <div class="title-actions">
        <RouterLink class="ghost-btn" to="/profile">返回学生画像</RouterLink>
        <button class="ghost-btn" type="button" :disabled="loading.resumeHistory" @click="loadResumeHistory">
          {{ loading.resumeHistory ? "刷新中..." : "刷新历史" }}
        </button>
        <button class="primary-btn" type="button" :disabled="loading.resumeGenerate" @click="generateResumeWithAgent">
          {{ loading.resumeGenerate ? "生成中..." : "生成简历" }}
        </button>
      </div>
    </header>

    <p v-if="uiState.error" class="notice error">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice success">{{ uiState.success }}</p>

    <section class="builder-grid">
      <main class="form-stack">
        <section class="panel">
          <header class="section-head">
            <h3>基础信息</h3>
            <span>用于简历页眉和求职目标</span>
          </header>
          <div class="field-grid four">
            <label>
              姓名
              <input v-model="resumeBuilder.basic.name" type="text" placeholder="例如：张三" />
            </label>
            <label>
              目标职位
              <input v-model="resumeBuilder.basic.targetPosition" type="text" placeholder="Java 开发工程师" />
            </label>
            <label>
              意向城市
              <input v-model="resumeBuilder.basic.targetCity" type="text" placeholder="杭州 / 上海 / 不限" />
            </label>
            <label>
              电话
              <input v-model="resumeBuilder.basic.phone" type="text" placeholder="138xxxx1234" />
            </label>
          </div>
          <div class="field-grid two">
            <label>
              邮箱
              <input v-model="resumeBuilder.basic.email" type="email" placeholder="name@email.com" />
            </label>
            <label>
              个人总结
              <input v-model="resumeBuilder.summary" type="text" placeholder="一句话说明优势和目标" />
            </label>
          </div>
        </section>

        <section class="panel">
          <header class="section-head">
            <h3>教育经历</h3>
            <span>学校、专业、课程和成绩</span>
          </header>
          <div class="field-grid four">
            <label>
              学校
              <input v-model="resumeBuilder.education.school" type="text" placeholder="XX 大学" />
            </label>
            <label>
              专业
              <input v-model="resumeBuilder.education.major" type="text" placeholder="软件工程" />
            </label>
            <label>
              学历
              <input v-model="resumeBuilder.education.degree" type="text" placeholder="本科" />
            </label>
            <label>
              时间
              <input v-model="resumeBuilder.education.period" type="text" placeholder="2020.09 - 2024.06" />
            </label>
          </div>
          <div class="field-grid two">
            <label>
              成绩/排名
              <input v-model="resumeBuilder.education.gpa" type="text" placeholder="GPA 3.6/4.0，专业前 20%" />
            </label>
            <label>
              核心课程
              <input v-model="resumeBuilder.education.coreCourses" type="text" placeholder="数据结构、操作系统、数据库" />
            </label>
          </div>
          <label>
            在校荣誉
            <textarea v-model="resumeBuilder.education.honors" rows="2" placeholder="奖学金、优秀学生干部、竞赛奖项" />
          </label>
        </section>

        <section class="panel">
          <header class="section-head">
            <h3>项目 / 实习经历</h3>
            <span>简历质量主要取决于这一部分</span>
          </header>
          <div class="field-grid four">
            <label>
              经历类型
              <select v-model="resumeBuilder.experience.type">
                <option value="project">项目经历</option>
                <option value="internship">实习经历</option>
                <option value="competition">竞赛经历</option>
                <option value="campus">校园经历</option>
              </select>
            </label>
            <label>
              名称
              <input v-model="resumeBuilder.experience.organization" type="text" placeholder="校园招聘推荐系统" />
            </label>
            <label>
              角色
              <input v-model="resumeBuilder.experience.role" type="text" placeholder="后端开发" />
            </label>
            <label>
              时间
              <input v-model="resumeBuilder.experience.period" type="text" placeholder="2025.03 - 2025.06" />
            </label>
          </div>
          <label>
            背景
            <textarea v-model="resumeBuilder.experience.background" rows="3" placeholder="项目解决什么问题、服务什么对象" />
          </label>
          <label>
            技术栈
            <textarea v-model="resumeBuilder.experience.techStack" rows="2" placeholder="Vue 3、TypeScript、Node.js、PostgreSQL" />
          </label>
          <label>
            主要职责
            <textarea v-model="resumeBuilder.experience.responsibilities" rows="4" placeholder="分行填写你实际做过的事情" />
          </label>
          <div class="field-grid two">
            <label>
              难点与解决方式
              <textarea v-model="resumeBuilder.experience.difficulties" rows="4" placeholder="遇到什么问题，如何拆解和解决" />
            </label>
            <label>
              成果/数据/产出
              <textarea v-model="resumeBuilder.experience.achievements" rows="4" placeholder="可验证结果、上线功能、文档产出" />
            </label>
          </div>
        </section>

        <section class="panel">
          <header class="section-head">
            <h3>技能与证明材料</h3>
            <span>用于生成技能概览和补充证明</span>
          </header>
          <label>
            专业技能
            <textarea v-model="resumeBuilder.skills" rows="4" placeholder="后端：Node.js、Express；数据库：PostgreSQL；前端：Vue 3、TypeScript" />
          </label>
          <div class="field-grid two">
            <label>
              证书
              <textarea v-model="resumeBuilder.certificates" rows="3" placeholder="CET-4、计算机二级、软考初级" />
            </label>
            <label>
              奖项/竞赛
              <textarea v-model="resumeBuilder.awards" rows="3" placeholder="互联网+ 校赛三等奖、蓝桥杯省赛二等奖" />
            </label>
          </div>
          <label>
            作品链接
            <input v-model="resumeBuilder.portfolioLinks" type="text" placeholder="GitHub / 演示地址 / 作品集链接" />
          </label>
        </section>
      </main>

      <aside class="preview-stack">
        <section class="panel preview-panel">
          <header class="section-head">
            <h3>简历预览</h3>
            <span>{{ resumePreviewVisible ? "已生成" : "等待生成" }}</span>
          </header>
          <iframe
            v-if="resumePreviewVisible"
            class="resume-preview-frame"
            :srcdoc="resumePreviewHtml"
            title="简历预览"
          />
          <div v-else class="preview-empty">
            <span class="material-symbols-outlined">article</span>
            <p>填写左侧内容后点击“生成简历”，这里会展示 HTML 预览。</p>
          </div>
        </section>

        <section class="panel history-panel">
          <header class="section-head">
            <h3>历史简历</h3>
            <span>{{ resumeHistory.length }} 条</span>
          </header>
          <div class="history-list">
            <button
              v-for="item in resumeHistory"
              :key="item.id"
              type="button"
              :disabled="loading.resumePreviewLoad"
              @click="openResumeHistoryItem(item.id)"
            >
              <strong>#{{ item.id }} {{ item.basic_name }}</strong>
              <span>{{ item.target_position }} · {{ formatDate(item.created_at) }}</span>
              <small>{{ item.model || "未知模型" }}</small>
            </button>
            <p v-if="resumeHistory.length === 0" class="empty-note">暂无历史简历记录。</p>
          </div>
        </section>
      </aside>
    </section>
  </section>
</template>

<style scoped>
.resume-builder-page {
  min-width: 1120px;
  display: grid;
  gap: 14px;
}

.page-titlebar,
.panel {
  border: 1px solid var(--glass-border);
  background: var(--glass-panel);
  backdrop-filter: blur(22px) saturate(165%);
  -webkit-backdrop-filter: blur(22px) saturate(165%);
  box-shadow:
    inset 0 1px 0 var(--glass-stroke),
    0 14px 30px rgba(49, 79, 136, 0.09);
}

.page-titlebar {
  min-height: 82px;
  padding: 16px 18px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.eyebrow {
  margin: 0;
  color: rgba(37, 55, 88, 0.62);
  font-size: 12px;
  font-weight: 800;
}

.page-titlebar h2 {
  margin: 4px 0;
  color: var(--glass-title);
  font-size: 26px;
}

.page-titlebar p {
  margin: 0;
  color: var(--glass-muted);
}

.title-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.builder-grid {
  display: grid;
  grid-template-columns: minmax(680px, 1fr) 400px;
  gap: 14px;
  align-items: start;
}

.form-stack,
.preview-stack {
  display: grid;
  gap: 14px;
}

.panel {
  border-radius: 16px;
  padding: 16px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-head h3 {
  margin: 0;
  color: var(--glass-title);
  font-size: 16px;
}

.section-head span,
.empty-note {
  color: var(--glass-muted);
  font-size: 12px;
}

.field-grid {
  display: grid;
  gap: 12px;
}

.field-grid.four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.field-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

label {
  display: grid;
  gap: 7px;
  margin-bottom: 12px;
  color: var(--glass-title);
  font-size: 13px;
  font-weight: 800;
}

input,
textarea,
select {
  width: 100%;
  border: 1px solid rgba(31, 58, 97, 0.12);
  border-radius: 10px;
  padding: 10px 11px;
  color: var(--glass-title);
  background: rgba(255, 255, 255, 0.48);
  font-family: inherit;
}

textarea {
  resize: vertical;
}

.primary-btn,
.ghost-btn {
  height: 38px;
  border-radius: 10px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.62);
  cursor: pointer;
  font-weight: 800;
  font-family: inherit;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.primary-btn {
  color: #fff;
  background: linear-gradient(135deg, var(--glass-primary), var(--glass-primary-strong));
  box-shadow: 0 12px 24px rgba(40, 97, 200, 0.16);
}

.ghost-btn {
  color: var(--glass-title);
  background: rgba(255, 255, 255, 0.42);
}

.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}

.notice {
  margin: 0;
  padding: 11px 14px;
  border-radius: 12px;
  font-weight: 700;
}

.notice.error {
  color: #9f1239;
  background: rgba(255, 228, 230, 0.58);
}

.notice.success {
  color: #047857;
  background: rgba(220, 252, 231, 0.58);
}

.preview-panel {
  min-height: 720px;
}

.resume-preview-frame {
  width: 100%;
  min-height: 640px;
  border: 1px solid rgba(31, 58, 97, 0.12);
  border-radius: 12px;
  background: #fff;
}

.preview-empty {
  min-height: 640px;
  border: 1px dashed rgba(23, 135, 199, 0.36);
  border-radius: 12px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: var(--glass-muted);
  text-align: center;
}

.preview-empty .material-symbols-outlined {
  font-size: 46px;
  color: var(--glass-primary-strong);
}

.history-list {
  display: grid;
  gap: 9px;
}

.history-list button {
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 10px;
  padding: 10px;
  color: var(--glass-title);
  background: rgba(255, 255, 255, 0.34);
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 4px;
}

.history-list span,
.history-list small {
  color: var(--glass-muted);
}
</style>
