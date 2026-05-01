<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import type {
  CreateResumeHtmlRequest,
  ResumeHtmlListItem,
  StudentProfileRecord,
} from "@career/contracts/types";

import { createResumeHtml, getResumeHtmlRecord, listResumeHtmlRecords } from "@/shared/api/agent";
import { ApiRequestError } from "@/shared/api/http";
import { fetchJobs } from "@/shared/api/jobs";
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

interface PreviewMetricCard {
  label: string;
  value: number;
  unit: string;
  icon: string;
  color: string;
  note: string;
}

interface AbilityMeter {
  key: string;
  label: string;
  value: number;
  icon: string;
  color: string;
  description: string;
}

interface PreviewTag {
  label: string;
  icon: string;
}

const mode = ref<InputMode>("resume");
const profileRecords = ref<StudentProfileRecord[]>([]);
const resumeHistory = ref<ResumeHtmlListItem[]>([]);
const selectedProfileId = ref<number | null>(null);

const loading = reactive({
  profileBootstrap: false,
  manualSubmit: false,
  resumeSubmit: false,
  resumeGenerate: false,
  resumeHistory: false,
  resumePreviewLoad: false,
  resumeTargetRoleSearch: false,
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

const resumeUpload = reactive({
  targetRole: "",
  targetRoleOptions: [] as string[],
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
const resumeBuilderExpanded = ref(false); // 简历生成器是否展开

const uiState = reactive({
  error: "",
  success: "",
  resumeError: "",
  resumeSuccess: "",
});

const latestProfile = computed(() => {
  if (selectedProfileId.value !== null) {
    return profileRecords.value.find((item) => item.id === selectedProfileId.value) ?? null;
  }
  return profileRecords.value[0] ?? null;
});
const latestProfileMetricCards = computed(() =>
  latestProfile.value ? buildProfileMetricCards(latestProfile.value) : [],
);
const latestProfileAbilityMeters = computed(() =>
  latestProfile.value ? buildProfileAbilityMeters(latestProfile.value) : [],
);
const latestProfileStrengthTags = computed(() =>
  latestProfile.value ? buildProfileStrengthTags(latestProfile.value) : [],
);
const latestProfileWeaknessTags = computed(() =>
  latestProfile.value ? buildProfileWeaknessTags(latestProfile.value) : [],
);
const latestProfileRecommendations = computed(() =>
  latestProfile.value ? buildProfileRecommendations(latestProfile.value) : [],
);
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

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function selfAssessmentToPercent(score: number): number {
  return clampPercent(score * 20);
}

function averagePercent(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return clampPercent(values.reduce((total, value) => total + value, 0) / values.length);
}

function normalizeCapabilityLevel(value: number | "", fallback = 3): number {
  return typeof value === "number" ? value : fallback;
}

function selectProfile(profileId: number): void {
  selectedProfileId.value = profileId;
}

function getProfileInitial(name: string): string {
  return name.trim().slice(0, 1) || "候";
}

function getScoreGrade(score: number): string {
  if (score >= 85) {
    return "高潜";
  }
  if (score >= 70) {
    return "稳健";
  }
  if (score >= 55) {
    return "可培养";
  }
  return "待补强";
}

/**
 * 作用：按用户输入的关键字拉取岗位建议。
 * 注意：建议列表只是辅助输入，不应阻塞简历上传主流程，因此失败时静默回退为空列表。
 */
async function loadResumeTargetRoleOptions(keyword: string): Promise<void> {
  const normalizedKeyword = keyword.trim();
  if (normalizedKeyword.length < 2) {
    resumeUpload.targetRoleOptions = [];
    return;
  }

  loading.resumeTargetRoleSearch = true;
  try {
    const response = await fetchJobs({
      keyword: normalizedKeyword,
      limit: 8,
    });
    resumeUpload.targetRoleOptions = Array.from(
      new Set(response.items.map((item) => item.title.trim()).filter(Boolean)),
    );
  } catch {
    resumeUpload.targetRoleOptions = [];
  } finally {
    loading.resumeTargetRoleSearch = false;
  }
}

/**
 * 统一构建“画像预览核心指标”。
 * 说明：预览区只消费稳定契约字段，避免把后端原始评分结构直接散落在模板里。
 */
function buildProfileMetricCards(profile: StudentProfileRecord): PreviewMetricCard[] {
  return [
    {
      label: "完整度",
      value: clampPercent(profile.completeness_score),
      unit: "%",
      icon: "fact_check",
      color: "#0f8f9d",
      note: "字段覆盖",
    },
    {
      label: "竞争力",
      value: clampPercent(profile.competitiveness_score),
      unit: "%",
      icon: "workspace_premium",
      color: "#e26d3d",
      note: getScoreGrade(profile.competitiveness_score),
    },
  ];
}

/**
 * 将后端四维画像与自评量表合并成参考稿中的五项能力条。
 * 注意：自评字段是 1-5 等级，展示前统一映射到 0-100，避免用户误读不同量纲。
 */
function buildProfileAbilityMeters(profile: StudentProfileRecord): AbilityMeter[] {
  const communication = selfAssessmentToPercent(profile.self_assessment.communication);
  const learning = selfAssessmentToPercent(profile.self_assessment.learning);
  const stressTolerance = selfAssessmentToPercent(profile.self_assessment.stress_tolerance);
  const innovation = selfAssessmentToPercent(profile.self_assessment.innovation);

  return [
    {
      key: "professional_skills",
      label: "专业/技术能力",
      value: clampPercent(profile.dimension_scores.professional_skills),
      icon: "code_blocks",
      color: "#2563eb",
      description: "技能关键词、项目与岗位要求的匹配强度",
    },
    {
      key: "learning",
      label: "学习与适应能力",
      value: averagePercent([learning, profile.dimension_scores.development_potential]),
      icon: "psychology",
      color: "#14a46c",
      description: `自评 ${mapSelfAssessmentLevel(profile.self_assessment.learning)}，结合发展潜力评分`,
    },
    {
      key: "execution",
      label: "执行与抗压能力",
      value: stressTolerance,
      icon: "bolt",
      color: "#d97706",
      description: `抗压自评 ${profile.self_assessment.stress_tolerance}/5`,
    },
    {
      key: "communication",
      label: "沟通表达能力",
      value: averagePercent([communication, profile.dimension_scores.professional_quality]),
      icon: "forum",
      color: "#a855f7",
      description: `沟通自评 ${profile.self_assessment.communication}/5，结合职业素养评分`,
    },
    {
      key: "leadership",
      label: "领导与协同能力",
      value: averagePercent([innovation, profile.dimension_scores.professional_quality]),
      icon: "groups",
      color: "#6366f1",
      description: "由创新表现、协作素养与竞赛经历综合推断",
    },
  ];
}

/**
 * 提炼预览区的优势标签。
 * 说明：这里优先展示可被简历或表单支撑的证据，不凭空生成不存在的能力结论。
 */
function buildProfileStrengthTags(profile: StudentProfileRecord): PreviewTag[] {
  const tags: PreviewTag[] = profile.skills.slice(0, 4).map((skill) => ({
    label: skill,
    icon: "check_circle",
  }));

  if (profile.certificates.length > 0) {
    tags.push({ label: `${profile.certificates.length} 项证书`, icon: "verified" });
  }
  if (profile.experience.project_count > 0) {
    tags.push({ label: `${profile.experience.project_count} 段项目`, icon: "dashboard_customize" });
  }
  if (profile.experience.internship_count > 0) {
    tags.push({ label: `${profile.experience.internship_count} 段实习`, icon: "business_center" });
  }

  return tags.slice(0, 7);
}

function buildProfileWeaknessTags(profile: StudentProfileRecord): PreviewTag[] {
  const fieldMap: Record<string, string> = {
    major: "专业信息待完善",
    graduation_year: "毕业年份待补全",
    skills: "技能关键词待提取",
    education_level: "学历背景待补充",
    experience: "项目/实习经历较少",
  };

  if (profile.missing_items.length > 0) {
    return profile.missing_items.slice(0, 4).map((item) => ({
      label: fieldMap[item] || item,
      icon: "error",
    }));
  }

  return [{ label: "关键字段已覆盖", icon: "task_alt" }];
}

function buildProfileRecommendations(profile: StudentProfileRecord): PreviewTag[] {
  const recommendations: PreviewTag[] = [
    {
      label: `围绕「${profile.target_role}」补充岗位关键词`,
      icon: "ads_click",
    },
  ];

  if (profile.experience.project_count > 0) {
    recommendations.push({
      label: "将项目经历改写为任务-行动-结果结构",
      icon: "format_list_bulleted",
    });
  } else {
    recommendations.push({
      label: "补充 1 个可量化项目案例",
      icon: "add_task",
    });
  }

  if (profile.certificates.length === 0) {
    recommendations.push({
      label: "补充证书、竞赛或作品集证明材料",
      icon: "assignment_add",
    });
  } else {
    recommendations.push({
      label: "把证书与目标岗位要求建立对应关系",
      icon: "hub",
    });
  }

  return recommendations;
}

async function loadProfileHistory(): Promise<void> {
  loading.profileBootstrap = true;
  try {
    const response = await fetchStudentProfiles();
    profileRecords.value = response.items;
    if (!response.items.some((item) => item.id === selectedProfileId.value)) {
      selectedProfileId.value = response.items[0]?.id ?? null;
    }
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
    selectedProfileId.value = created.id;
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
      // 优先提交用户选定的数据库岗位；未填写时交给后端自动解析和归一。
      targetRole: resumeUpload.targetRole.trim() || "待定岗位",
      name: undefined,
      parseMode: "tolerant",
    });

    profileRecords.value.unshift(created);
    selectedProfileId.value = created.id;
    uiState.success = `简历解析完成，画像已写入数据库（ID: ${created.id}）。`;

    resumeFile.value = null;
    resumeUpload.targetRole = "";
    resumeUpload.targetRoleOptions = [];
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

watch(
  () => resumeUpload.targetRole,
  (value) => {
    void loadResumeTargetRoleOptions(value);
  },
);
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
      <div class="section-head">
        <h3>简历生成（用于学生画像构建）</h3>
        <button
          class="ghost-btn"
          type="button"
          @click="resumeBuilderExpanded = !resumeBuilderExpanded"
        >
          {{ resumeBuilderExpanded ? "收起简历生成" : "展开简历生成" }}
        </button>
      </div>
      <p class="section-desc">先生成标准化简历文本，后续可用于上传解析或人工补录画像。</p>

      <p v-if="!resumeBuilderExpanded" class="mode-subtitle">
        默认收起，点击“展开简历生成”后可填写并生成。
      </p>

      <div v-if="resumeBuilderExpanded">
        <p v-if="uiState.resumeError" class="notice notice-error">{{ uiState.resumeError }}</p>
        <p v-if="uiState.resumeSuccess" class="notice notice-success">
          {{ uiState.resumeSuccess }}
        </p>

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
            <input
              v-model="resumeBuilder.basic.phone"
              type="text"
              placeholder="例如：138xxxx1234"
            />
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
              placeholder="例如：XXXXX大学"
            />
          </label>
          <label>
            专业
            <input
              v-model="resumeBuilder.education.major"
              type="text"
              placeholder="例如：软件工程"
            />
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
      </div>

      <p v-if="!resumeBuilderExpanded && uiState.resumeError" class="notice notice-error">
        {{ uiState.resumeError }}
      </p>
      <p v-if="!resumeBuilderExpanded && uiState.resumeSuccess" class="notice notice-success">
        {{ uiState.resumeSuccess }}
      </p>

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
          <div class="resume-upload-row">
            <label>
              简历文件
              <input type="file" accept=".pdf,.doc,.docx,.txt,.md" @change="onResumeChange" />
            </label>

            <label>
              目标岗位
              <input
                v-model="resumeUpload.targetRole"
                type="text"
                list="resume-target-role-options"
                placeholder="例如：前端开发工程师"
              />
              <datalist id="resume-target-role-options">
                <option v-for="item in resumeUpload.targetRoleOptions" :key="item" :value="item" />
              </datalist>
            </label>

            <div class="resume-upload-action">
              <p class="mode-hint">
                系统会优先使用你选择的数据库岗位；留空时尝试从简历自动解析。
                <span v-if="loading.resumeTargetRoleSearch">岗位建议加载中...</span>
              </p>
              <button
                class="primary-btn"
                :disabled="loading.resumeSubmit"
                @click="submitResumeProfile"
              >
                {{ loading.resumeSubmit ? "解析中..." : "上传并生成画像" }}
              </button>
            </div>
          </div>
        </template>
      </article>

      <aside class="panel preview-panel profile-preview">
        <article v-if="latestProfile" class="profile-result-card">
          <header class="result-header">
            <div>
              <h3>{{ latestProfile.name }}</h3>
              <div class="result-meta">
                <span>
                  <span class="material-symbols-outlined">school</span>
                  {{ latestProfile.education_level || "学历待补充" }}
                </span>
                <span>
                  <span class="material-symbols-outlined">business_center</span>
                  意向：{{ latestProfile.target_role }}
                </span>
              </div>
            </div>
            <span class="success-badge">
              <span class="material-symbols-outlined">check_circle</span>
              {{ latestProfile.source_type === "resume" ? "AI 提取成功" : "画像生成成功" }}
            </span>
          </header>

          <section class="result-main-grid">
            <div class="result-ability-panel">
              <div class="result-section-title">
                <span class="material-symbols-outlined">trending_up</span>
                <h4>核心能力模型推演</h4>
              </div>
              <div class="result-ability-list">
                <div
                  v-for="item in latestProfileAbilityMeters"
                  :key="item.key"
                  class="result-ability-row"
                  :style="{ '--ability-color': item.color }"
                >
                  <div class="result-ability-copy">
                    <span>{{ item.label }}</span>
                    <strong>{{ item.value }}%</strong>
                  </div>
                  <div class="result-ability-track">
                    <span :style="{ width: `${item.value}%` }"></span>
                  </div>
                </div>
              </div>
            </div>

            <div class="result-insight-panel">
              <section class="result-block strengths">
                <h4>核心优势 <span>(STRENGTHS)</span></h4>
                <div class="result-tags">
                  <span v-for="item in latestProfileStrengthTags" :key="item.label">
                    <span class="material-symbols-outlined">{{ item.icon }}</span>
                    {{ item.label }}
                  </span>
                </div>
              </section>

              <section class="result-block risks">
                <h4>待提升项 <span>(WEAKNESSES)</span></h4>
                <div class="result-tags">
                  <span v-for="item in latestProfileWeaknessTags" :key="item.label">
                    <span class="material-symbols-outlined">{{ item.icon }}</span>
                    {{ item.label }}
                  </span>
                </div>
              </section>

              <section class="result-block recommendations">
                <h4>推荐岗位方向</h4>
                <div class="recommend-tags">
                  <span v-for="item in latestProfileRecommendations" :key="item.label">
                    {{ item.label }}
                  </span>
                </div>
              </section>
            </div>
          </section>

          <section class="result-summary-card">
            <div class="result-summary-title">
              <span class="material-symbols-outlined">workspace_premium</span>
              <h4>AI 综合评价（基于简历结构分析）</h4>
            </div>
            <p>{{ latestProfile.summary }}</p>
          </section>

          <footer class="result-footnote">
            来源：{{ formatSourceType(latestProfile.source_type) }} ｜ 完整度
            {{ latestProfile.completeness_score }} ｜ 竞争力
            {{ latestProfile.competitiveness_score }} ｜ 生成时间：{{
              formatDate(latestProfile.created_at)
            }}
          </footer>
        </article>

        <div v-else class="preview-empty-state">
          <span class="material-symbols-outlined">description</span>
          <h4>等待生成画像</h4>
          <p>完成一次表单录入或简历上传后，这里会展示结构化能力画像。</p>
        </div>
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
        <li
          v-for="item in profileRecords"
          :key="item.id"
          :class="{ active: latestProfile?.id === item.id }"
        >
          <div>
            <p class="history-title">#{{ item.id }} {{ item.name }} · {{ item.target_role }}</p>
            <p class="history-meta">
              {{ formatSourceType(item.source_type) }} ｜ 完整度 {{ item.completeness_score }} ｜
              竞争力 {{ item.competitiveness_score }} ｜ {{ formatDate(item.created_at) }}
            </p>
          </div>
          <div class="history-actions">
            <button class="ghost-btn" @click="selectProfile(item.id)">查看预览</button>
            <button
              class="ghost-btn"
              @click="
                selectProfile(item.id);
                mode = item.source_type === 'manual' ? 'manual' : 'resume';
              "
            >
              切换到对应入口
            </button>
          </div>
        </li>
        <li v-if="profileRecords.length === 0" class="empty">暂无记录</li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.profile-page {
  --profile-bg:
    radial-gradient(circle at 12% 18%, rgba(255, 255, 255, 0.88), transparent 28%),
    radial-gradient(circle at 88% 14%, rgba(164, 243, 255, 0.46), transparent 26%),
    radial-gradient(circle at 72% 86%, rgba(255, 206, 236, 0.42), transparent 24%),
    linear-gradient(145deg, #dff4ff 0%, #edf4ff 34%, #f8f6ff 70%, #fff4ef 100%);
  --profile-card: linear-gradient(135deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.22));
  --profile-card-strong: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.78),
    rgba(255, 255, 255, 0.32)
  );
  --profile-border: rgba(255, 255, 255, 0.56);
  --profile-title: #11233f;
  --profile-subtitle: rgba(37, 55, 88, 0.74);
  --profile-primary: #1587a5;
  --profile-primary-strong: #2357d8;
  --profile-shadow: 0 28px 64px rgba(34, 62, 110, 0.16);
  max-width: 1180px;
  margin: 24px auto;
  padding: 28px;
  border-radius: 34px;
  background: var(--profile-bg);
  display: grid;
  gap: 18px;
  position: relative;
  overflow: hidden;
  box-shadow: var(--profile-shadow);
  isolation: isolate;
  animation: page-enter 420ms ease-out;
}

.profile-page::before,
.profile-page::after {
  content: "";
  position: absolute;
  border-radius: 999px;
  filter: blur(12px);
  z-index: -1;
  pointer-events: none;
}

.profile-page::before {
  width: 320px;
  height: 320px;
  top: -72px;
  right: -56px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0) 72%);
}

.profile-page::after {
  width: 280px;
  height: 280px;
  left: -80px;
  bottom: 36px;
  background: radial-gradient(circle, rgba(129, 212, 250, 0.34) 0%, rgba(129, 212, 250, 0) 76%);
}

.hero {
  border: 1px solid var(--profile-border);
  border-radius: 28px;
  padding: 28px;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.18));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    inset 0 -1px 0 rgba(255, 255, 255, 0.22),
    0 22px 46px rgba(36, 64, 118, 0.12);
}

.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.48), transparent 42%),
    radial-gradient(circle at 85% 20%, rgba(255, 255, 255, 0.4), transparent 28%);
  pointer-events: none;
}

.hero-tag {
  margin: 0;
  color: rgba(17, 35, 63, 0.58);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-size: 11px;
  font-weight: 800;
}

.hero h2 {
  margin: 8px 0 0;
  color: var(--profile-title);
  font-size: 34px;
  line-height: 1.2;
  letter-spacing: -0.03em;
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
}

.hero-desc {
  margin: 12px 0 0;
  color: var(--profile-subtitle);
  max-width: 760px;
  line-height: 1.8;
}

.panel {
  border: 1px solid var(--profile-border);
  border-radius: 24px;
  padding: 18px;
  position: relative;
  overflow: hidden;
  background: var(--profile-card);
  backdrop-filter: blur(24px) saturate(170%);
  -webkit-backdrop-filter: blur(24px) saturate(170%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.64),
    inset 0 -1px 0 rgba(255, 255, 255, 0.18),
    0 18px 38px rgba(42, 71, 120, 0.1);
}

.panel::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.22), transparent 28%);
  pointer-events: none;
}

.capability-intro h3 {
  margin: 0;
  color: var(--profile-title);
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
}

.capability-intro p {
  margin: 10px 0 0;
  color: rgba(31, 52, 86, 0.84);
  line-height: 1.7;
}

.capability-title {
  font-weight: 700;
  color: #122546;
}

.section-desc {
  margin: 10px 0 14px;
  color: var(--profile-subtitle);
  line-height: 1.75;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.section-head h3 {
  margin: 0;
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
  color: var(--profile-title);
}

.mode-selector {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mode-card {
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.64);
  border-radius: 20px;
  padding: 18px;
  background: var(--profile-card-strong);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition:
    transform 220ms ease,
    border-color 180ms ease,
    box-shadow 220ms ease,
    background 220ms ease;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.64);
}

.mode-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(125deg, rgba(255, 255, 255, 0.4), transparent 48%);
  pointer-events: none;
}

.mode-card:hover {
  transform: translateY(-4px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.68),
    0 18px 36px rgba(46, 79, 138, 0.12);
}

.mode-card.active {
  border-color: rgba(113, 197, 255, 0.92);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(222, 241, 255, 0.34));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 0 0 1px rgba(99, 170, 255, 0.16),
    0 20px 38px rgba(74, 118, 197, 0.16);
}

.mode-title {
  margin: 0;
  color: var(--profile-title);
  font-weight: 800;
}

.mode-subtitle {
  margin: 6px 0 0;
  color: var(--profile-subtitle);
  font-size: 13px;
  line-height: 1.65;
}

.notice {
  margin: 0;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.52);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.notice-error {
  background: linear-gradient(135deg, rgba(255, 232, 236, 0.82), rgba(255, 244, 245, 0.5));
  color: #8c2343;
}

.notice-success {
  background: linear-gradient(135deg, rgba(227, 255, 244, 0.78), rgba(241, 255, 251, 0.44));
  color: #0b6b54;
}

.content-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}

.form-panel h3,
.preview-panel h3,
.history-panel h3 {
  margin: 0 0 12px;
  color: var(--profile-title);
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
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
  gap: 8px;
  color: rgba(28, 48, 82, 0.84);
  margin-bottom: 12px;
  font-weight: 600;
}

input,
textarea,
select {
  border: 1px solid rgba(255, 255, 255, 0.64);
  border-radius: 16px;
  padding: 12px 14px;
  font-size: 14px;
  color: #16304e;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.34));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 10px 24px rgba(61, 90, 152, 0.06);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  font-family: "Avenir Next", "PingFang SC", "Noto Sans SC", sans-serif;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

input::placeholder,
textarea::placeholder {
  color: rgba(54, 79, 119, 0.5);
}

input:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: rgba(89, 178, 255, 0.92);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.76),
    0 0 0 3px rgba(91, 164, 255, 0.14),
    0 14px 28px rgba(42, 75, 132, 0.1);
  transform: translateY(-1px);
}

textarea {
  resize: vertical;
  min-height: 104px;
}

.primary-btn,
.ghost-btn {
  border-radius: 16px;
  padding: 10px 14px;
  cursor: pointer;
  border: 1px solid transparent;
  font-weight: 700;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
}

.primary-btn {
  background: linear-gradient(135deg, rgba(73, 182, 223, 0.92), rgba(64, 105, 236, 0.92));
  color: #ffffff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    0 16px 30px rgba(45, 99, 203, 0.24);
}

.ghost-btn {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.34));
  border-color: rgba(255, 255, 255, 0.62);
  color: #16304e;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 10px 20px rgba(46, 74, 118, 0.08);
}

.primary-btn:hover,
.ghost-btn:hover {
  transform: translateY(-1px);
}

.primary-btn:disabled,
.ghost-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
  box-shadow: none;
}

.profile-preview {
  padding: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(255, 255, 255, 0.42));
}

.profile-result-card {
  padding: 26px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.74);
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 20px 44px rgba(46, 76, 124, 0.1);
}

.result-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 20px;
  border-bottom: 1px solid #f1f5f9;
}

.result-header h3 {
  margin: 0;
  color: #0f172a;
  font-size: 28px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.result-meta {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  color: #64748b;
  font-weight: 500;
  font-size: 14px;
}

.result-meta span,
.success-badge,
.result-section-title,
.result-summary-title {
  display: inline-flex;
  align-items: center;
}

.result-meta .material-symbols-outlined {
  margin-right: 4px;
  font-size: 18px;
}

.success-badge {
  flex: 0 0 auto;
  gap: 6px;
  height: 32px;
  padding: 0 16px;
  border-radius: 999px;
  color: #16a34a;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  font-weight: 600;
  font-size: 14px;
}

.success-badge .material-symbols-outlined {
  font-size: 18px;
}

.result-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 48px;
  padding: 24px 0 32px;
}

.result-section-title {
  gap: 10px;
  color: #1e293b;
  margin-bottom: 24px;
}

.result-section-title .material-symbols-outlined {
  color: #3b82f6;
  font-size: 22px;
}

.result-section-title h4,
.result-block h4,
.result-summary-title h4 {
  margin: 0;
  color: #1e293b;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.result-ability-list {
  display: grid;
  gap: 20px;
}

.result-ability-row {
  --ability-color: #3b82f6;
  display: grid;
  gap: 8px;
}

.result-ability-copy {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #475569;
  font-size: 15px;
  font-weight: 600;
}

.result-ability-copy strong {
  color: #1e293b;
  font-size: 16px;
  font-weight: 700;
}

.result-ability-track {
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: #f1f5f9;
}

.result-ability-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ability-color);
  transition: width 800ms cubic-bezier(0.4, 0, 0.2, 1);
}

.result-insight-panel {
  display: grid;
  align-content: start;
  gap: 32px;
}

.result-block h4 {
  color: #64748b;
  font-size: 15px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.result-block h4 span {
  color: #94a3b8;
  font-weight: 500;
  font-size: 13px;
  margin-left: 4px;
}

.result-tags,
.recommend-tags {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.result-tags span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 14px;
  transition: all 0.2s ease;
}

.result-tags .material-symbols-outlined {
  font-size: 18px;
  background: none !important;
  border: none !important;
  padding: 0 !important;
  margin: 0 !important;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

.result-tags .material-symbols-outlined::before,
.result-tags .material-symbols-outlined::after {
  display: none !important;
}

.strengths .result-tags span {
  color: #16a34a;
  background: #f0fdf4;
  border: 1px solid #dcfce7;
}

.risks .result-tags span {
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fee2e2;
}

.recommend-tags span {
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  color: #334155;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  font-weight: 600;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
}

.result-summary-card {
  padding: 24px 28px;
  border-radius: 16px;
  background: #f0f7ff;
  border: 1px solid #e0e7ff;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.result-summary-title {
  gap: 10px;
  color: #1e3a8a;
}

.result-summary-title .material-symbols-outlined {
  font-size: 22px;
  color: #2563eb;
}

.result-summary-title h4 {
  color: #1e3a8a;
  font-size: 17px;
}

.result-summary-card p {
  margin: 12px 0 0;
  color: #334155;
  font-size: 15px;
  line-height: 1.75;
  font-weight: 500;
}

.result-footnote {
  margin-top: 20px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 500;
}

.preview-empty-state {
  min-height: 520px;
  padding: 44px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: rgba(56, 80, 116, 0.74);
}

.preview-empty-state > .material-symbols-outlined {
  width: 76px;
  height: 76px;
  border-radius: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #0f8f9d;
  font-size: 38px;
  background: rgba(220, 252, 255, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.66);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 18px 34px rgba(47, 83, 129, 0.12);
}

.preview-empty-state h4 {
  margin: 14px 0 6px;
  color: #10284a;
  font-size: 20px;
}

.preview-empty-state p {
  margin: 0;
  max-width: 320px;
  line-height: 1.7;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 10px;
}

.history-header p {
  margin: 0;
  color: rgba(56, 80, 116, 0.68);
  font-size: 13px;
}

.history-list {
  list-style: none;
  padding: 0;
  margin: 14px 0 0;
  display: grid;
  gap: 10px;
}

.history-list li {
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 18px;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.28));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease;
}

.history-list li:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 14px 28px rgba(46, 76, 124, 0.1);
}

.history-list li.active {
  border-color: rgba(111, 196, 255, 0.9);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(220, 241, 255, 0.44));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 0 0 1px rgba(101, 178, 255, 0.14),
    0 18px 34px rgba(60, 100, 176, 0.14);
}

.history-title {
  margin: 0;
  color: #10284a;
  font-weight: 800;
}

.history-meta {
  margin: 6px 0 0;
  color: rgba(57, 82, 119, 0.68);
  font-size: 13px;
}

.history-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.empty {
  margin: 0;
  color: rgba(56, 80, 116, 0.74);
  text-align: center;
  padding: 16px;
}

.mode-hint {
  margin: 0 0 12px;
  color: var(--profile-subtitle);
  line-height: 1.7;
}

.resume-upload-row {
  display: grid;
  grid-template-columns: minmax(220px, 0.85fr) minmax(220px, 0.85fr) minmax(260px, 1fr);
  gap: 14px;
  align-items: end;
}

.resume-upload-row label,
.resume-upload-row .mode-hint {
  margin-bottom: 0;
}

.resume-upload-action {
  display: grid;
  gap: 10px;
}

.resume-upload-action .primary-btn {
  min-height: 46px;
}

.action-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.resume-preview {
  margin-top: 14px;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.22));
  padding: 14px;
  display: grid;
  gap: 10px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
}

.resume-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.resume-preview-header h4 {
  margin: 0;
  color: var(--profile-title);
}

.resume-preview-frame {
  width: 100%;
  min-height: 640px;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 18px;
  background: #ffffff;
}

@keyframes float-glass {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(0, -4px, 0);
  }
}

@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero {
  animation: float-glass 8s ease-in-out infinite;
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
  .resume-upload-row,
  .two-col {
    grid-template-columns: 1fr;
  }

  .history-list li {
    flex-direction: column;
    align-items: flex-start;
  }

  .history-actions {
    width: 100%;
    justify-content: stretch;
  }

  .history-actions .ghost-btn {
    flex: 1 1 0;
  }
}

@media (max-width: 720px) {
  .profile-page {
    margin: 0;
    border-radius: 0;
    padding: 16px;
  }

  .hero {
    padding: 22px;
  }

  .hero h2 {
    font-size: 28px;
  }

  .profile-result-card {
    padding: 18px;
  }

  .result-header,
  .result-main-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .result-header {
    display: grid;
  }

  .success-badge {
    justify-self: start;
  }

  .result-header h3 {
    font-size: 24px;
  }

  .resume-preview-header,
  .history-header,
  .section-head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
