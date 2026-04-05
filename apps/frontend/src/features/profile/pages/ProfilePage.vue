<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";

import type {
  CreateResumeHtmlRequest,
  ResumeHtmlListItem,
  StudentProfileRecord,
} from "@career/contracts/types";

import { createResumeHtml, getResumeHtmlRecord, listResumeHtmlRecords } from "@/shared/api/agent";
import { ApiRequestError } from "@/shared/api/http";
import {
  createStudentProfile,
  createStudentProfileFromResume,
  fetchStudentProfiles,
} from "@/shared/api/profile";

/**
 * 文件作用：学生画像中心。
 * 职责说明：统一承载“简历生成（用于画像构建）”“学生画像生成”“画像历史回看”三个流程。
 * 依赖边界：画像数据与历史来自 profile API，简历生成与历史来自 ai resume API。
 */

type InputMode = "manual" | "resume";

interface CapabilityFormState {
  certificates: string;
  innovationAbility: number | "";
  learningAbility: number | "";
  pressureResistance: number | "";
  communicationAbility: number | "";
  internshipAbility: number | "";
}

interface CapabilityEntry {
  label: string;
  value: string;
}

const mode = ref<InputMode>("manual");
const profileRecords = ref<StudentProfileRecord[]>([]);
const resumeHistory = ref<ResumeHtmlListItem[]>([]);

const loading = reactive({
  profileBootstrap: false,
  manualSubmit: false,
  resumeSubmit: false,
  resumeGenerate: false,
  resumeHistory: false,
  resumePreviewLoad: false,
});

const manualForm = reactive({
  name: "",
  targetRole: "",
  education: "",
  skills: "",
  projects: "",
  summary: "",
});

const resumeBuilder = reactive({
  basic: {
    name: "",
    phone: "",
    email: "",
    targetPosition: "",
  },
  summary: "",
  education: {
    school: "",
    major: "",
    degree: "",
    period: "",
  },
  experience: {
    organization: "",
    role: "",
    period: "",
    responsibilities: "",
    achievements: "",
  },
  skills: "",
});

const manualCapability = reactive<CapabilityFormState>({
  certificates: "",
  innovationAbility: "",
  learningAbility: "",
  pressureResistance: "",
  communicationAbility: "",
  internshipAbility: "",
});

const resumeFile = ref<File | null>(null);
const resumePreviewVisible = ref(false);
const resumePreviewHtml = ref("");

const uiState = reactive({
  error: "",
  success: "",
  resumeError: "",
  resumeSuccess: "",
});

const latestProfile = computed(() => profileRecords.value[0] ?? null);
const capabilityLevelOptions = [
  { value: 1, label: "1 - 待提升" },
  { value: 2, label: "2 - 一般" },
  { value: 3, label: "3 - 良好" },
  { value: 4, label: "4 - 较强" },
  { value: 5, label: "5 - 优秀" },
];

function parseTagText(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[，,\n\s/|]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
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

function resetProfileMessage(): void {
  uiState.error = "";
  uiState.success = "";
}

function resetResumeMessage(): void {
  uiState.resumeError = "";
  uiState.resumeSuccess = "";
}

function hasEmptyCapability(input: CapabilityFormState): boolean {
  return (
    [input.certificates].some((item) => !item.trim()) ||
    [
      input.innovationAbility,
      input.learningAbility,
      input.pressureResistance,
      input.communicationAbility,
      input.internshipAbility,
    ].some((item) => item === "")
  );
}

function formatSourceType(sourceType: StudentProfileRecord["source_type"]): string {
  return sourceType === "manual" ? "表单录入" : "简历上传";
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString("zh-CN", { hour12: false });
}

function mapSelfAssessmentLevel(score: number): string {
  if (score >= 5) {
    return "很强";
  }
  if (score >= 4) {
    return "较强";
  }
  if (score >= 3) {
    return "中等";
  }
  return "需提升";
}

function normalizeCapabilityLevel(value: number | "", fallback = 3): number {
  return typeof value === "number" ? value : fallback;
}

/**
 * 统一构建“画像维度展示”数据。
 * 说明：页面展示不直接暴露原始 JSON 结构，减少前端模板与后端字段耦合。
 */
function buildProfileCapabilityEntries(profile: StudentProfileRecord): CapabilityEntry[] {
  return [
    {
      label: "证书",
      value: profile.certificates.length > 0 ? profile.certificates.join("、") : "未填写",
    },
    {
      label: "沟通能力",
      value: `${mapSelfAssessmentLevel(profile.self_assessment.communication)}（${profile.self_assessment.communication}/5）`,
    },
    {
      label: "学习能力",
      value: `${mapSelfAssessmentLevel(profile.self_assessment.learning)}（${profile.self_assessment.learning}/5）`,
    },
    {
      label: "抗压能力",
      value: `${mapSelfAssessmentLevel(profile.self_assessment.stress_tolerance)}（${profile.self_assessment.stress_tolerance}/5）`,
    },
    {
      label: "创新能力",
      value: `${mapSelfAssessmentLevel(profile.self_assessment.innovation)}（${profile.self_assessment.innovation}/5）`,
    },
    {
      label: "项目经历",
      value: `${profile.experience.project_count} 段`,
    },
    {
      label: "实习经历",
      value: `${profile.experience.internship_count} 段`,
    },
  ];
}

async function loadProfileHistory(): Promise<void> {
  loading.profileBootstrap = true;
  try {
    const response = await fetchStudentProfiles();
    profileRecords.value = response.items;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.profileBootstrap = false;
  }
}

async function loadResumeHistory(): Promise<void> {
  loading.resumeHistory = true;
  try {
    const response = await listResumeHtmlRecords(0, 20);
    resumeHistory.value = response.items;
  } catch (error) {
    uiState.resumeError = formatApiError(error);
  } finally {
    loading.resumeHistory = false;
  }
}

/**
 * 提交“表单录入”并写入数据库画像。
 * 说明：能力文本会作为补充摘要拼接保存，同时将可量化字段映射为后端评分输入。
 */
async function submitManualProfile(): Promise<void> {
  resetProfileMessage();

  const name = manualForm.name.trim();
  const targetRole = manualForm.targetRole.trim();
  const skills = parseTagText(manualForm.skills);
  if (!name || !targetRole || skills.length === 0 || hasEmptyCapability(manualCapability)) {
    uiState.error =
      "请完整填写姓名、目标岗位、专业技能，以及证书/创新/学习/抗压/沟通/实习能力信息。";
    return;
  }

  loading.manualSubmit = true;
  try {
    const created = await createStudentProfile({
      name,
      target_role: targetRole,
      education_level: manualForm.education.trim() || undefined,
      skills,
      certificates: parseTagText(manualCapability.certificates),
      experience: {
        internship_count: normalizeCapabilityLevel(manualCapability.internshipAbility),
        project_count: manualForm.projects.trim() ? 1 : 0,
        competition_count:
          normalizeCapabilityLevel(manualCapability.innovationAbility) >= 4 ? 1 : 0,
      },
      self_assessment: {
        communication: normalizeCapabilityLevel(manualCapability.communicationAbility),
        learning: normalizeCapabilityLevel(manualCapability.learningAbility),
        stress_tolerance: normalizeCapabilityLevel(manualCapability.pressureResistance),
        innovation: normalizeCapabilityLevel(manualCapability.innovationAbility),
      },
      personal_summary: [
        manualForm.summary.trim(),
        `创新能力等级：${normalizeCapabilityLevel(manualCapability.innovationAbility)}`,
        `学习能力等级：${normalizeCapabilityLevel(manualCapability.learningAbility)}`,
        `抗压能力等级：${normalizeCapabilityLevel(manualCapability.pressureResistance)}`,
        `沟通能力等级：${normalizeCapabilityLevel(manualCapability.communicationAbility)}`,
        `实习能力等级：${normalizeCapabilityLevel(manualCapability.internshipAbility)}`,
      ]
        .filter(Boolean)
        .join("；"),
    });

    profileRecords.value.unshift(created);
    uiState.success = `画像已生成并写入数据库（ID: ${created.id}）。`;

    manualForm.name = "";
    manualForm.targetRole = "";
    manualForm.education = "";
    manualForm.skills = "";
    manualForm.projects = "";
    manualForm.summary = "";
    manualCapability.certificates = "";
    manualCapability.innovationAbility = "";
    manualCapability.learningAbility = "";
    manualCapability.pressureResistance = "";
    manualCapability.communicationAbility = "";
    manualCapability.internshipAbility = "";
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.manualSubmit = false;
  }
}

/**
 * 上传简历并调用后端解析生成画像。
 * 注意：该接口会直接落库，提交成功后可在“历史画像”看到完整记录。
 */
async function submitResumeProfile(): Promise<void> {
  resetProfileMessage();

  if (!resumeFile.value) {
    uiState.error = "请先选择简历文件。";
    return;
  }

  loading.resumeSubmit = true;
  try {
    const created = await createStudentProfileFromResume({
      file: resumeFile.value,
      // 简历模式强调“零手填”，目标岗位使用兜底值。
      targetRole: "待定岗位",
      name: undefined,
      parseMode: "tolerant",
    });

    profileRecords.value.unshift(created);
    uiState.success = `简历解析完成，画像已写入数据库（ID: ${created.id}）。`;

    resumeFile.value = null;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.resumeSubmit = false;
  }
}

function buildResumeRequestPayload(): CreateResumeHtmlRequest {
  return {
    basic: {
      name: resumeBuilder.basic.name.trim(),
      phone: resumeBuilder.basic.phone.trim(),
      email: resumeBuilder.basic.email.trim(),
      target_position: resumeBuilder.basic.targetPosition.trim(),
    },
    summary: resumeBuilder.summary.trim() || undefined,
    educations: [
      {
        school: resumeBuilder.education.school.trim(),
        major: resumeBuilder.education.major.trim(),
        degree: resumeBuilder.education.degree.trim(),
        period: resumeBuilder.education.period.trim(),
      },
    ],
    experiences: [
      {
        organization: resumeBuilder.experience.organization.trim(),
        role: resumeBuilder.experience.role.trim(),
        period: resumeBuilder.experience.period.trim(),
        responsibilities: resumeBuilder.experience.responsibilities.trim(),
        achievements: resumeBuilder.experience.achievements.trim(),
      },
    ],
    skills: resumeBuilder.skills.trim(),
  };
}

function validateResumeBuilder(): string[] {
  const errors: string[] = [];
  if (!resumeBuilder.basic.name.trim()) {
    errors.push("请填写姓名");
  }
  if (!resumeBuilder.basic.phone.trim()) {
    errors.push("请填写电话");
  }
  if (!resumeBuilder.basic.email.trim()) {
    errors.push("请填写邮箱");
  }
  if (!resumeBuilder.basic.targetPosition.trim()) {
    errors.push("请填写目标职位");
  }
  if (
    !resumeBuilder.education.school.trim() ||
    !resumeBuilder.education.major.trim() ||
    !resumeBuilder.education.degree.trim() ||
    !resumeBuilder.education.period.trim()
  ) {
    errors.push("请完整填写教育背景");
  }
  if (
    !resumeBuilder.experience.organization.trim() ||
    !resumeBuilder.experience.role.trim() ||
    !resumeBuilder.experience.period.trim() ||
    !resumeBuilder.experience.responsibilities.trim() ||
    !resumeBuilder.experience.achievements.trim()
  ) {
    errors.push("请完整填写工作/项目经历");
  }
  if (!resumeBuilder.skills.trim()) {
    errors.push("请填写专业技能");
  }
  return errors;
}

async function generateResumeWithAgent(): Promise<void> {
  resetResumeMessage();
  const errors = validateResumeBuilder();
  if (errors.length > 0) {
    uiState.resumeError = errors.join("；");
    return;
  }

  loading.resumeGenerate = true;
  try {
    const response = await createResumeHtml(buildResumeRequestPayload());
    resumePreviewVisible.value = true;
    resumePreviewHtml.value = response.html;
    uiState.resumeSuccess = `简历已生成（ID: ${response.resume_id}），已在当前页预览。`;
    await loadResumeHistory();
  } catch (error) {
    uiState.resumeError = formatApiError(error);
  } finally {
    loading.resumeGenerate = false;
  }
}

async function openResumeHistoryItem(resumeId: number): Promise<void> {
  resetResumeMessage();
  loading.resumePreviewLoad = true;
  try {
    const record = await getResumeHtmlRecord(resumeId);
    resumePreviewVisible.value = true;
    resumePreviewHtml.value = record.html;
    uiState.resumeSuccess = `历史简历 #${record.id} 已在当前页预览。`;
  } catch (error) {
    uiState.resumeError = formatApiError(error);
  } finally {
    loading.resumePreviewLoad = false;
  }
}

function onResumeChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  resumeFile.value = input.files && input.files[0] ? input.files[0] : null;
}

onMounted(async () => {
  await Promise.all([loadProfileHistory(), loadResumeHistory()]);
});
</script>

<template>
  <section class="profile-page">
    <header class="hero">
      <p class="hero-tag">Student Profile Studio</p>
      <h2>学生画像中心</h2>
      <p class="hero-desc">
        本页统一承载简历生成、学生画像构建和历史画像回看，数据均可落库并复用。
      </p>
    </header>

    <section class="panel">
      <h3>简历生成（用于学生画像构建）</h3>
      <p class="section-desc">先生成标准化简历文本，后续可用于上传解析或人工补录画像。</p>

      <p v-if="uiState.resumeError" class="notice notice-error">{{ uiState.resumeError }}</p>
      <p v-if="uiState.resumeSuccess" class="notice notice-success">{{ uiState.resumeSuccess }}</p>

      <div class="grid two-col">
        <label>
          姓名
          <input v-model="resumeBuilder.basic.name" type="text" placeholder="例如：张三" />
        </label>
        <label>
          目标岗位
          <input
            v-model="resumeBuilder.basic.targetPosition"
            type="text"
            placeholder="例如：Java 开发工程师"
          />
        </label>
      </div>

      <div class="grid two-col">
        <label>
          电话
          <input v-model="resumeBuilder.basic.phone" type="text" placeholder="例如：138xxxx1234" />
        </label>
        <label>
          邮箱
          <input
            v-model="resumeBuilder.basic.email"
            type="email"
            placeholder="例如：name@email.com"
          />
        </label>
      </div>

      <div class="grid two-col">
        <label>
          学校
          <input
            v-model="resumeBuilder.education.school"
            type="text"
            placeholder="例如：华中科技大学"
          />
        </label>
        <label>
          专业
          <input v-model="resumeBuilder.education.major" type="text" placeholder="例如：软件工程" />
        </label>
      </div>

      <div class="grid two-col">
        <label>
          学历
          <input v-model="resumeBuilder.education.degree" type="text" placeholder="例如：本科" />
        </label>
        <label>
          教育时间
          <input
            v-model="resumeBuilder.education.period"
            type="text"
            placeholder="例如：2018.09 - 2022.06"
          />
        </label>
      </div>

      <div class="grid two-col">
        <label>
          公司/项目
          <input
            v-model="resumeBuilder.experience.organization"
            type="text"
            placeholder="例如：XX 科技"
          />
        </label>
        <label>
          岗位
          <input
            v-model="resumeBuilder.experience.role"
            type="text"
            placeholder="例如：后端开发工程师"
          />
        </label>
      </div>

      <div class="grid two-col">
        <label>
          经历时间
          <input
            v-model="resumeBuilder.experience.period"
            type="text"
            placeholder="例如：2022.07 - 2025.03"
          />
        </label>
        <label>
          专业技能
          <input
            v-model="resumeBuilder.skills"
            type="text"
            placeholder="例如：Java Spring PostgreSQL"
          />
        </label>
      </div>

      <label>
        主要职责
        <textarea
          v-model="resumeBuilder.experience.responsibilities"
          rows="3"
          placeholder="例如：负责核心服务开发与性能优化"
        />
      </label>

      <label>
        工作成果
        <textarea
          v-model="resumeBuilder.experience.achievements"
          rows="3"
          placeholder="例如：将核心接口响应从 300ms 优化到 90ms"
        />
      </label>

      <label>
        个人总结（可选）
        <textarea
          v-model="resumeBuilder.summary"
          rows="3"
          placeholder="例如：3 年后端经验，具备微服务拆分与高并发治理实践"
        />
      </label>

      <div class="action-row">
        <button
          class="primary-btn"
          :disabled="loading.resumeGenerate"
          @click="generateResumeWithAgent"
        >
          {{ loading.resumeGenerate ? "简历生成中..." : "生成简历" }}
        </button>
        <button class="ghost-btn" :disabled="loading.resumeHistory" @click="loadResumeHistory">
          {{ loading.resumeHistory ? "刷新中..." : "刷新简历历史" }}
        </button>
      </div>

      <div v-if="resumePreviewVisible" class="resume-preview">
        <div class="resume-preview-header">
          <h4>简历预览</h4>
          <button class="ghost-btn" type="button" @click="resumePreviewVisible = false">
            收起预览
          </button>
        </div>
        <iframe class="resume-preview-frame" :srcdoc="resumePreviewHtml" title="简历预览" />
      </div>

      <div class="history-header">
        <h4>历史简历（数据库）</h4>
      </div>
      <ul class="history-list">
        <li v-for="item in resumeHistory" :key="item.id">
          <div>
            <p class="history-title">
              #{{ item.id }} {{ item.basic_name }} · {{ item.target_position }}
            </p>
            <p class="history-meta">
              {{ item.model || "未知模型" }} ｜ {{ formatDate(item.created_at) }} ｜ trace_id:
              {{ item.trace_id }}
            </p>
          </div>
          <button
            class="ghost-btn"
            :disabled="loading.resumePreviewLoad"
            @click="openResumeHistoryItem(item.id)"
          >
            预览
          </button>
        </li>
        <li v-if="resumeHistory.length === 0" class="empty">暂无历史简历记录</li>
      </ul>
    </section>

    <section class="panel capability-intro">
      <h3>能力画像生成说明</h3>
      <p>
        学生就业能力来源通过简历上传或自行录入方式输入，系统会通过大模型能力将录入信息拆解为学生就业能力画像，
        并给出完整度与竞争力评分（画像结果写入数据库，可在下方历史区回看）。
      </p>
      <p class="capability-title">
        请在下方表单中输入这些维度信息：专业技能、证书、创新能力、学习能力、抗压能力、沟通能力、实习能力。
      </p>
    </section>

    <section class="mode-selector panel">
      <button class="mode-card" :class="{ active: mode === 'manual' }" @click="mode = 'manual'">
        <p class="mode-title">表单输入学生画像</p>
        <p class="mode-subtitle">手动填写信息，不上传简历，直接生成数据库画像</p>
      </button>
      <button class="mode-card" :class="{ active: mode === 'resume' }" @click="mode = 'resume'">
        <p class="mode-title">上传简历生成画像</p>
        <p class="mode-subtitle">只上传简历，不再手填信息，自动解析生成画像</p>
      </button>
    </section>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice notice-success">{{ uiState.success }}</p>

    <section class="content-layout">
      <article class="panel form-panel">
        <h3>{{ mode === "manual" ? "表单录入" : "简历上传" }}</h3>

        <template v-if="mode === 'manual'">
          <div class="grid two-col">
            <label>
              姓名
              <input v-model="manualForm.name" type="text" placeholder="例如：张三" />
            </label>
            <label>
              目标岗位
              <input
                v-model="manualForm.targetRole"
                type="text"
                placeholder="例如：前端开发工程师"
              />
            </label>
          </div>

          <div class="grid two-col">
            <label>
              教育背景（可选）
              <input
                v-model="manualForm.education"
                type="text"
                placeholder="例如：计算机科学与技术 本科"
              />
            </label>
            <label>
              专业技能（必填）
              <input v-model="manualForm.skills" type="text" placeholder="Vue TypeScript 测试" />
            </label>
          </div>

          <div class="grid two-col">
            <label>
              证书（必填）
              <input
                v-model="manualCapability.certificates"
                type="text"
                placeholder="例如：英语六级、软考中级"
              />
            </label>
            <label>
              创新能力（必选）
              <select v-model="manualCapability.innovationAbility">
                <option :value="''">请选择等级</option>
                <option
                  v-for="option in capabilityLevelOptions"
                  :key="`innovation-${option.value}`"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>

          <div class="grid two-col">
            <label>
              学习能力（必选）
              <select v-model="manualCapability.learningAbility">
                <option :value="''">请选择等级</option>
                <option
                  v-for="option in capabilityLevelOptions"
                  :key="`learning-${option.value}`"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label>
              抗压能力（必选）
              <select v-model="manualCapability.pressureResistance">
                <option :value="''">请选择等级</option>
                <option
                  v-for="option in capabilityLevelOptions"
                  :key="`stress-${option.value}`"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>

          <div class="grid two-col">
            <label>
              沟通能力（必选）
              <select v-model="manualCapability.communicationAbility">
                <option :value="''">请选择等级</option>
                <option
                  v-for="option in capabilityLevelOptions"
                  :key="`communication-${option.value}`"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label>
              实习能力（必选）
              <select v-model="manualCapability.internshipAbility">
                <option :value="''">请选择等级</option>
                <option
                  v-for="option in capabilityLevelOptions"
                  :key="`internship-${option.value}`"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>

          <label>
            项目经历（可选）
            <textarea
              v-model="manualForm.projects"
              rows="3"
              placeholder="可输入项目名称、职责、成果，提升竞争力评分。"
            />
          </label>

          <label>
            个人摘要（可选）
            <textarea
              v-model="manualForm.summary"
              rows="3"
              placeholder="一句话总结你的优势和求职诉求。"
            />
          </label>

          <button class="primary-btn" :disabled="loading.manualSubmit" @click="submitManualProfile">
            {{ loading.manualSubmit ? "生成中..." : "生成画像并入库" }}
          </button>
        </template>

        <template v-else>
          <label>
            简历文件
            <input type="file" accept=".pdf,.doc,.docx,.txt,.md" @change="onResumeChange" />
          </label>

          <p class="mode-hint">
            简历模式下无需额外填写信息，系统会从简历中自动提取姓名、技能与经历来生成画像。
          </p>

          <button class="primary-btn" :disabled="loading.resumeSubmit" @click="submitResumeProfile">
            {{ loading.resumeSubmit ? "解析中..." : "上传并生成画像" }}
          </button>
        </template>
      </article>

      <aside class="panel preview-panel">
        <h3>实时画像预览</h3>

        <div v-if="latestProfile" class="preview-card">
          <p class="preview-headline">#{{ latestProfile.id }} {{ latestProfile.name }}</p>
          <p class="preview-meta">
            来源：{{ formatSourceType(latestProfile.source_type) }} ｜ 目标岗位：{{
              latestProfile.target_role
            }}
          </p>
          <p class="preview-summary">{{ latestProfile.summary }}</p>

          <div class="score-grid">
            <div>
              <p class="score-label">完整度</p>
              <p class="score-value">{{ latestProfile.completeness_score }}</p>
            </div>
            <div>
              <p class="score-label">竞争力</p>
              <p class="score-value">{{ latestProfile.competitiveness_score }}</p>
            </div>
          </div>

          <div class="skill-tags">
            <span v-for="skill in latestProfile.skills" :key="skill">{{ skill }}</span>
          </div>

          <div class="capability-list">
            <p class="capability-list-title">画像维度结果</p>
            <ul>
              <li v-for="item in buildProfileCapabilityEntries(latestProfile)" :key="item.label">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </li>
            </ul>
          </div>

          <p class="preview-time">生成时间：{{ formatDate(latestProfile.created_at) }}</p>
        </div>

        <p v-else class="empty">请先完成一次提交，右侧会展示最新的数据库画像结果。</p>
      </aside>
    </section>

    <section class="panel history-panel">
      <div class="history-header">
        <h3>历史画像（数据库）</h3>
        <button class="ghost-btn" :disabled="loading.profileBootstrap" @click="loadProfileHistory">
          {{ loading.profileBootstrap ? "刷新中..." : "刷新历史" }}
        </button>
      </div>

      <ul class="history-list">
        <li v-for="item in profileRecords" :key="item.id">
          <div>
            <p class="history-title">#{{ item.id }} {{ item.name }} · {{ item.target_role }}</p>
            <p class="history-meta">
              {{ formatSourceType(item.source_type) }} ｜ 完整度 {{ item.completeness_score }} ｜
              竞争力 {{ item.competitiveness_score }} ｜ {{ formatDate(item.created_at) }}
            </p>
          </div>
          <button
            class="ghost-btn"
            @click="mode = item.source_type === 'manual' ? 'manual' : 'resume'"
          >
            切换到对应入口
          </button>
        </li>
        <li v-if="profileRecords.length === 0" class="empty">暂无记录</li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.profile-page {
  --profile-bg: radial-gradient(circle at 10% 10%, #fff0dc 0%, #f6f8fc 35%, #eef3fb 100%);
  --profile-card: rgba(255, 255, 255, 0.84);
  --profile-border: rgba(15, 23, 42, 0.08);
  --profile-title: #0f172a;
  --profile-subtitle: #475569;
  --profile-primary: #0f766e;
  --profile-primary-strong: #115e59;
  max-width: 1180px;
  margin: 24px auto;
  padding: 24px;
  border-radius: 24px;
  background: var(--profile-bg);
  display: grid;
  gap: 16px;
  animation: page-enter 360ms ease-out;
}

.hero {
  border: 1px solid var(--profile-border);
  border-radius: 20px;
  padding: 24px;
  backdrop-filter: blur(8px);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(255, 248, 231, 0.8));
}

.hero-tag {
  margin: 0;
  color: #9a3412;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
  font-weight: 700;
}

.hero h2 {
  margin: 8px 0 0;
  color: var(--profile-title);
  font-size: 30px;
  line-height: 1.2;
}

.hero-desc {
  margin: 10px 0 0;
  color: var(--profile-subtitle);
}

.panel {
  border: 1px solid var(--profile-border);
  border-radius: 18px;
  padding: 16px;
  background: var(--profile-card);
  backdrop-filter: blur(6px);
}

.capability-intro h3 {
  margin: 0;
  color: var(--profile-title);
}

.capability-intro p {
  margin: 10px 0 0;
  color: #334155;
  line-height: 1.7;
}

.capability-title {
  font-weight: 600;
  color: #0f172a;
}

.section-desc {
  margin: 8px 0 12px;
  color: #475569;
}

.mode-selector {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mode-card {
  text-align: left;
  border: 1px solid #dbe4f0;
  border-radius: 14px;
  padding: 14px;
  background: #ffffff;
  cursor: pointer;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.mode-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.mode-card.active {
  border-color: var(--profile-primary);
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.18);
}

.mode-title {
  margin: 0;
  color: var(--profile-title);
  font-weight: 700;
}

.mode-subtitle {
  margin: 6px 0 0;
  color: var(--profile-subtitle);
  font-size: 13px;
}

.notice {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
}

.notice-error {
  background: #fee2e2;
  color: #991b1b;
}

.notice-success {
  background: #dcfce7;
  color: #166534;
}

.content-layout {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 16px;
}

.form-panel h3,
.preview-panel h3,
.history-panel h3 {
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
  margin-bottom: 12px;
}

input,
textarea,
select {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
}

textarea {
  resize: vertical;
}

.primary-btn,
.ghost-btn {
  border-radius: 10px;
  padding: 9px 12px;
  cursor: pointer;
  border: 1px solid transparent;
}

.primary-btn {
  background: linear-gradient(135deg, var(--profile-primary), var(--profile-primary-strong));
  color: #ffffff;
  font-weight: 600;
}

.ghost-btn {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #0f172a;
}

.preview-card {
  border: 1px solid #dbe4f0;
  border-radius: 14px;
  padding: 12px;
  background: #fffef8;
}

.preview-headline {
  margin: 0;
  color: var(--profile-title);
  font-size: 18px;
  font-weight: 700;
}

.preview-meta,
.preview-time {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 13px;
}

.preview-summary {
  margin: 10px 0 0;
  color: #1f2937;
}

.score-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.score-grid > div {
  border: 1px solid #dbe4f0;
  border-radius: 10px;
  padding: 8px;
  background: #ffffff;
}

.score-label {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.score-value {
  margin: 6px 0 0;
  color: #0f172a;
  font-weight: 700;
  font-size: 20px;
}

.skill-tags {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.skill-tags span {
  padding: 5px 9px;
  border-radius: 999px;
  background: #ecfeff;
  border: 1px solid #99f6e4;
  color: #115e59;
  font-size: 12px;
}

.capability-list {
  margin-top: 12px;
  border: 1px solid #dbe4f0;
  border-radius: 10px;
  padding: 10px;
  background: #ffffff;
}

.capability-list-title {
  margin: 0;
  color: #0f172a;
  font-weight: 600;
}

.capability-list ul {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.capability-list li {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  align-items: flex-start;
}

.capability-list li span {
  color: #64748b;
  font-size: 13px;
}

.capability-list li strong {
  color: #1f2937;
  font-size: 13px;
  text-align: right;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 10px;
}

.history-header p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.history-list {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: grid;
  gap: 8px;
}

.history-list li {
  border: 1px solid #dbe4f0;
  border-radius: 12px;
  padding: 12px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.history-title {
  margin: 0;
  color: #0f172a;
  font-weight: 600;
}

.history-meta {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}

.empty {
  margin: 0;
  color: #64748b;
  text-align: center;
  padding: 12px;
}

.mode-hint {
  margin: 0 0 12px;
  color: #475569;
  line-height: 1.7;
}

.action-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.resume-preview {
  margin-top: 12px;
  border: 1px solid #dbe4f0;
  border-radius: 10px;
  background: #f8fafc;
  padding: 12px;
  display: grid;
  gap: 8px;
}

.resume-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.resume-preview-header h4 {
  margin: 0;
  color: #0f172a;
}

.resume-preview-frame {
  width: 100%;
  min-height: 640px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
}

@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 980px) {
  .profile-page {
    margin: 16px;
    padding: 14px;
  }

  .content-layout {
    grid-template-columns: 1fr;
  }

  .mode-selector,
  .two-col {
    grid-template-columns: 1fr;
  }

  .history-list li {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
