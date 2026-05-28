<script setup lang="ts">
/**
 * 文件作用：AI 简历生成页。
 * 职责说明：根据用户录入的结构化经历生成 HTML 简历，并提供历史简历回看。
 * 依赖边界：只调用 AI 简历生成 API，不写入学生画像；画像生成仍在学生画像中心完成。
 */
import { onMounted, reactive, ref } from "vue";
import type {
  CreateResumeHtmlRequest,
  ResumeHtmlListItem,
  ResumeQualityWarning,
} from "@career/contracts/types";

import { createResumeHtml, getResumeHtmlRecord, listResumeHtmlRecords } from "@/shared/api/ai";
import { ApiRequestError } from "@/shared/api/http";

const resumeHistory = ref<ResumeHtmlListItem[]>([]);
const resumePreviewVisible = ref(false);
const resumePreviewHtml = ref("");
const resumeQualityWarnings = ref<ResumeQualityWarning[]>([]);

type ResumeExperienceForm = CreateResumeHtmlRequest["experiences"][number] & {
  id: number;
};

type ResumeExperienceType = NonNullable<ResumeExperienceForm["type"]>;

type ResumeExperienceCopy = {
  label: string;
  hint: string;
  organizationLabel: string;
  organizationPlaceholder: string;
  roleLabel: string;
  rolePlaceholder: string;
  periodPlaceholder: string;
  backgroundLabel: string;
  backgroundPlaceholder: string;
  methodLabel?: string;
  methodPlaceholder?: string;
  responsibilitiesLabel: string;
  responsibilitiesPlaceholder: string;
  difficultiesLabel: string;
  difficultiesPlaceholder: string;
  achievementsLabel: string;
  achievementsPlaceholder: string;
};

let nextExperienceId = 1;

const loading = reactive({
  resumeGenerate: false,
  resumeHistory: false,
  resumePreviewLoad: false,
});

const uiState = reactive({
  error: "",
  success: "",
});

function createBlankExperience(type: ResumeExperienceForm["type"] = "project"): ResumeExperienceForm {
  return {
    id: nextExperienceId++,
    organization: "",
    role: "",
    period: "",
    type,
    background: "",
    tech_stack: "",
    responsibilities: "",
    achievements: "",
    difficulties: "",
  };
}

const experienceCopies: Record<ResumeExperienceType, ResumeExperienceCopy> = {
  project: {
    label: "项目经历",
    hint: "适合填写课程项目、个人项目、系统开发或作品项目",
    organizationLabel: "项目名称",
    organizationPlaceholder: "校园招聘推荐系统",
    roleLabel: "担任角色",
    rolePlaceholder: "后端开发 / 全栈开发",
    periodPlaceholder: "2025.03 - 2025.06",
    backgroundLabel: "项目背景",
    backgroundPlaceholder: "项目解决什么问题、服务什么对象",
    methodLabel: "方法/工具/技术栈",
    methodPlaceholder: "Vue 3、TypeScript、Node.js、PostgreSQL",
    responsibilitiesLabel: "主要职责",
    responsibilitiesPlaceholder: "分行填写你实际做过的事情",
    difficultiesLabel: "难点与解决方式",
    difficultiesPlaceholder: "遇到什么问题，如何拆解和解决",
    achievementsLabel: "成果/数据/产出",
    achievementsPlaceholder: "可验证结果、上线功能、文档产出",
  },
  internship: {
    label: "实习经历",
    hint: "适合填写公司、部门、岗位职责和实际工作产出",
    organizationLabel: "公司/部门",
    organizationPlaceholder: "XX 科技有限公司 / 研发部",
    roleLabel: "实习岗位",
    rolePlaceholder: "后端开发实习生",
    periodPlaceholder: "2025.07 - 2025.09",
    backgroundLabel: "工作背景",
    backgroundPlaceholder: "所在团队负责什么业务，你参与了哪部分工作",
    methodLabel: "工具/技术/方法",
    methodPlaceholder: "Java、Spring Boot、MySQL、Git",
    responsibilitiesLabel: "工作内容",
    responsibilitiesPlaceholder: "分行填写你在实习中负责的具体工作",
    difficultiesLabel: "问题与处理",
    difficultiesPlaceholder: "遇到什么业务或协作问题，如何处理",
    achievementsLabel: "工作产出",
    achievementsPlaceholder: "上线功能、交付文档、修复问题、协作结果",
  },
  competition: {
    label: "竞赛经历",
    hint: "适合填写比赛名称、作品方案、个人贡献和获奖结果",
    organizationLabel: "竞赛/作品名称",
    organizationPlaceholder: "蓝桥杯 / 互联网+ / 挑战杯项目",
    roleLabel: "团队角色",
    rolePlaceholder: "队长 / 核心成员 / 后端负责人",
    periodPlaceholder: "2025.03 - 2025.06",
    backgroundLabel: "赛题/作品背景",
    backgroundPlaceholder: "比赛主题、作品解决的问题或服务对象",
    methodLabel: "方案/工具/方法",
    methodPlaceholder: "算法思路、技术路线、调研方法、展示工具",
    responsibilitiesLabel: "个人贡献",
    responsibilitiesPlaceholder: "分行填写你在竞赛中的具体贡献",
    difficultiesLabel: "难点与突破",
    difficultiesPlaceholder: "方案、协作、时间或技术难点，以及解决方式",
    achievementsLabel: "获奖/成果",
    achievementsPlaceholder: "获奖等级、作品产出、路演结果、评审反馈",
  },
  campus: {
    label: "校园经历",
    hint: "适合填写学生会、社团、志愿活动、班委和校园组织经历",
    organizationLabel: "组织/活动名称",
    organizationPlaceholder: "学生会 / 社团 / 志愿服务活动",
    roleLabel: "担任职务",
    rolePlaceholder: "部长 / 班委 / 活动负责人",
    periodPlaceholder: "2024.09 - 2025.06",
    backgroundLabel: "组织/活动背景",
    backgroundPlaceholder: "组织或活动的目标、规模、服务对象",
    responsibilitiesLabel: "组织协调内容",
    responsibilitiesPlaceholder: "分行填写你负责的组织、沟通、执行、协调工作",
    difficultiesLabel: "协调难点与处理",
    difficultiesPlaceholder: "人员协调、资源安排、现场执行等问题和处理方式",
    achievementsLabel: "活动成果",
    achievementsPlaceholder: "活动落地、参与人数、服务时长、反馈或荣誉",
  },
};

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
  experiences: [] as ResumeExperienceForm[],
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

function hasResumeExperienceInput(experience: ResumeExperienceForm): boolean {
  return [
    experience.organization,
    experience.role,
    experience.period,
    experience.background,
    experience.tech_stack,
    experience.responsibilities,
    experience.achievements,
    experience.difficulties,
  ].some((value) => (value || "").trim());
}

function getExperienceTypeLabel(type: ResumeExperienceForm["type"]): string {
  return experienceCopies[type || "project"].label;
}

function getExperienceCopy(type: ResumeExperienceForm["type"]): ResumeExperienceCopy {
  return experienceCopies[type || "project"];
}

function handleExperienceTypeChange(experience: ResumeExperienceForm): void {
  if (!getExperienceCopy(experience.type).methodLabel) {
    experience.tech_stack = "";
  }
}

function addExperience(type: ResumeExperienceForm["type"] = "project"): void {
  resumeBuilder.experiences.push(createBlankExperience(type));
}

function removeExperience(experienceId: number): void {
  const index = resumeBuilder.experiences.findIndex((item) => item.id === experienceId);
  if (index >= 0) {
    resumeBuilder.experiences.splice(index, 1);
  }
}

function buildResumeRequestPayload(): CreateResumeHtmlRequest {
  const experiences: CreateResumeHtmlRequest["experiences"] = resumeBuilder.experiences
    .filter((experience) => hasResumeExperienceInput(experience))
    .map((experience) => ({
      organization: experience.organization.trim(),
      role: experience.role.trim(),
      period: experience.period.trim(),
      type: experience.type,
      background: experience.background?.trim() || undefined,
      tech_stack: experience.tech_stack?.trim() || undefined,
      responsibilities: experience.responsibilities.trim(),
      achievements: experience.achievements.trim(),
      difficulties: experience.difficulties?.trim() || undefined,
    }));

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
    experiences,
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
  if (
    !resumeBuilder.education.school.trim() ||
    !resumeBuilder.education.major.trim() ||
    !resumeBuilder.education.degree.trim() ||
    !resumeBuilder.education.period.trim()
  ) {
    errors.push("请完整填写教育背景");
  }
  resumeBuilder.experiences.forEach((experience, index) => {
    if (!hasResumeExperienceInput(experience)) return;
    if (
      !experience.organization.trim() ||
      !experience.role.trim() ||
      !experience.period.trim() ||
      !experience.responsibilities.trim() ||
      !experience.achievements.trim()
    ) {
      errors.push(`第 ${index + 1} 段${getExperienceTypeLabel(experience.type)}请补全名称、角色、时间、主要职责和成果`);
    }
  });
  if (!resumeBuilder.skills.trim()) errors.push("请填写专业技能");
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
    resumeQualityWarnings.value = response.quality_warnings || [];
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
    resumeQualityWarnings.value = [];
    uiState.success = `历史简历 #${record.id} 已载入预览。`;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.resumePreviewLoad = false;
  }
}

function printResumePreview(): void {
  const frame = document.querySelector<HTMLIFrameElement>(".resume-preview-frame");
  frame?.contentWindow?.print();
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
              <span class="field-label">意向城市 <span class="optional-tag">选填</span></span>
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
              <span class="field-label">个人总结 <span class="optional-tag">选填</span></span>
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
              <span class="field-label">成绩/排名 <span class="optional-tag">选填</span></span>
              <input v-model="resumeBuilder.education.gpa" type="text" placeholder="GPA 3.6/4.0，专业前 20%" />
            </label>
            <label>
              <span class="field-label">核心课程 <span class="optional-tag">选填</span></span>
              <input v-model="resumeBuilder.education.coreCourses" type="text" placeholder="数据结构、操作系统、数据库" />
            </label>
          </div>
          <label>
            <span class="field-label">在校荣誉 <span class="optional-tag">选填</span></span>
            <textarea v-model="resumeBuilder.education.honors" rows="2" placeholder="奖学金、优秀学生干部、竞赛奖项" />
          </label>
        </section>

        <section class="panel">
          <header class="section-head">
            <div>
              <h3>项目 / 实习经历</h3>
              <span>可不填；需要时手动添加，多段经历会一起用于生成简历</span>
            </div>
            <div class="experience-actions">
              <button class="mini-btn" type="button" @click="addExperience('project')">+ 项目</button>
              <button class="mini-btn" type="button" @click="addExperience('internship')">+ 实习</button>
              <button class="mini-btn" type="button" @click="addExperience('competition')">+ 竞赛</button>
              <button class="mini-btn" type="button" @click="addExperience('campus')">+ 校园</button>
            </div>
          </header>

          <div v-if="resumeBuilder.experiences.length === 0" class="experience-empty">
            <span class="material-symbols-outlined">add_task</span>
            <div>
              <strong>暂未添加经历</strong>
              <p>没有项目或实习也可以生成简历；如果需要补充经历，点击右上角按钮添加。</p>
            </div>
          </div>

          <div v-else class="experience-list">
            <article
              v-for="(experience, index) in resumeBuilder.experiences"
              :key="experience.id"
              class="experience-card"
            >
              <header class="experience-card-head">
                <div>
                  <strong>{{ getExperienceTypeLabel(experience.type) }} {{ index + 1 }}</strong>
                  <span>{{ getExperienceCopy(experience.type).hint }}</span>
                </div>
                <button class="danger-text-btn" type="button" @click="removeExperience(experience.id)">删除</button>
              </header>

              <div class="field-grid four">
                <label>
                  经历类型
                  <select v-model="experience.type" @change="handleExperienceTypeChange(experience)">
                    <option value="project">项目经历</option>
                    <option value="internship">实习经历</option>
                    <option value="competition">竞赛经历</option>
                    <option value="campus">校园经历</option>
                  </select>
                </label>
                <label>
                  {{ getExperienceCopy(experience.type).organizationLabel }}
                  <input
                    v-model="experience.organization"
                    type="text"
                    :placeholder="getExperienceCopy(experience.type).organizationPlaceholder"
                  />
                </label>
                <label>
                  {{ getExperienceCopy(experience.type).roleLabel }}
                  <input
                    v-model="experience.role"
                    type="text"
                    :placeholder="getExperienceCopy(experience.type).rolePlaceholder"
                  />
                </label>
                <label>
                  时间
                  <input
                    v-model="experience.period"
                    type="text"
                    :placeholder="getExperienceCopy(experience.type).periodPlaceholder"
                  />
                </label>
              </div>
              <label>
                <span class="field-label">
                  {{ getExperienceCopy(experience.type).backgroundLabel }}
                  <span class="optional-tag">选填</span>
                </span>
                <textarea
                  v-model="experience.background"
                  rows="3"
                  :placeholder="getExperienceCopy(experience.type).backgroundPlaceholder"
                />
              </label>
              <label v-if="getExperienceCopy(experience.type).methodLabel">
                <span class="field-label">
                  {{ getExperienceCopy(experience.type).methodLabel }}
                  <span class="optional-tag">选填</span>
                </span>
                <textarea
                  v-model="experience.tech_stack"
                  rows="2"
                  :placeholder="getExperienceCopy(experience.type).methodPlaceholder"
                />
              </label>
              <label>
                {{ getExperienceCopy(experience.type).responsibilitiesLabel }}
                <textarea
                  v-model="experience.responsibilities"
                  rows="4"
                  :placeholder="getExperienceCopy(experience.type).responsibilitiesPlaceholder"
                />
              </label>
              <div class="field-grid two">
                <label>
                  <span class="field-label">
                    {{ getExperienceCopy(experience.type).difficultiesLabel }}
                    <span class="optional-tag">选填</span>
                  </span>
                  <textarea
                    v-model="experience.difficulties"
                    rows="4"
                    :placeholder="getExperienceCopy(experience.type).difficultiesPlaceholder"
                  />
                </label>
                <label>
                  {{ getExperienceCopy(experience.type).achievementsLabel }}
                  <textarea
                    v-model="experience.achievements"
                    rows="4"
                    :placeholder="getExperienceCopy(experience.type).achievementsPlaceholder"
                  />
                </label>
              </div>
            </article>
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
              <span class="field-label">证书 <span class="optional-tag">选填</span></span>
              <textarea v-model="resumeBuilder.certificates" rows="3" placeholder="CET-4、计算机二级、软考初级" />
            </label>
            <label>
              <span class="field-label">奖项/竞赛 <span class="optional-tag">选填</span></span>
              <textarea v-model="resumeBuilder.awards" rows="3" placeholder="互联网+ 校赛三等奖、蓝桥杯省赛二等奖" />
            </label>
          </div>
          <label>
            <span class="field-label">作品链接 <span class="optional-tag">选填</span></span>
            <input v-model="resumeBuilder.portfolioLinks" type="text" placeholder="GitHub / 演示地址 / 作品集链接" />
          </label>
        </section>
      </main>

      <aside class="preview-stack">
        <section class="panel preview-panel">
          <header class="section-head">
            <div>
              <h3>简历预览</h3>
              <span>{{ resumePreviewVisible ? "已生成" : "等待生成" }}</span>
            </div>
            <button
              v-if="resumePreviewVisible"
              class="mini-btn"
              type="button"
              @click="printResumePreview"
            >
              打印 / 导出 PDF
            </button>
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

        <section v-if="resumeQualityWarnings.length > 0" class="panel quality-panel">
          <header class="section-head">
            <h3>简历优化建议</h3>
            <span>{{ resumeQualityWarnings.length }} 条</span>
          </header>
          <ul class="quality-list">
            <li v-for="warning in resumeQualityWarnings" :key="warning.code">
              {{ warning.message }}
            </li>
          </ul>
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
  width: 100%;
  min-width: 0;
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
  grid-template-columns: minmax(0, 1fr) minmax(320px, 360px);
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

.section-head > div {
  display: grid;
  gap: 4px;
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

.experience-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.mini-btn,
.danger-text-btn {
  height: 32px;
  border-radius: 9px;
  padding: 0 10px;
  border: 1px solid rgba(31, 58, 97, 0.14);
  background: rgba(255, 255, 255, 0.48);
  color: var(--glass-title);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 800;
}

.mini-btn:hover,
.danger-text-btn:hover {
  background: rgba(255, 255, 255, 0.72);
}

.danger-text-btn {
  color: #be123c;
}

.experience-empty {
  min-height: 118px;
  border: 1px dashed rgba(23, 135, 199, 0.32);
  border-radius: 14px;
  padding: 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--glass-muted);
  background: rgba(255, 255, 255, 0.22);
}

.experience-empty .material-symbols-outlined {
  color: var(--glass-primary-strong);
  font-size: 34px;
}

.experience-empty strong {
  display: block;
  margin-bottom: 4px;
  color: var(--glass-title);
}

.experience-empty p {
  margin: 0;
}

.experience-list {
  display: grid;
  gap: 12px;
}

.experience-card {
  border: 1px solid rgba(31, 58, 97, 0.1);
  border-radius: 14px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.26);
}

.experience-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.experience-card-head div {
  display: grid;
  gap: 3px;
}

.experience-card-head strong {
  color: var(--glass-title);
}

.experience-card-head span {
  color: var(--glass-muted);
  font-size: 12px;
}

label {
  display: grid;
  gap: 7px;
  margin-bottom: 12px;
  color: var(--glass-title);
  font-size: 13px;
  font-weight: 800;
}

.field-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.optional-tag {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 2px 6px;
  color: rgba(37, 55, 88, 0.68);
  background: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  font-weight: 700;
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

.quality-list {
  margin: 0;
  padding-left: 18px;
  color: var(--glass-title);
  display: grid;
  gap: 8px;
  font-size: 13px;
  line-height: 1.6;
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

@media (max-width: 1080px) {
  .page-titlebar {
    align-items: flex-start;
    flex-direction: column;
  }

  .builder-grid,
  .field-grid.four,
  .field-grid.two {
    grid-template-columns: 1fr;
  }
}
</style>
