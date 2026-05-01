<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import type { JobPortraitComicContext, ManualJobPortraitRecord } from "@career/contracts/types";

import { apiBaseUrl, ApiRequestError } from "@/shared/api/http";
import {
  fetchJobPortraitComic,
  fetchManualJobPortraits,
  generateJobPortraitComic,
} from "@/shared/api/job-profiles";

/**
 * 扩展类型定义以适配参考代码的高保真数据结构
 */
interface EnhancedJobProfile extends Omit<ManualJobPortraitRecord, "created_at" | "updated_at"> {
  created_at?: string;
  updated_at?: string;
  jobLevel?: string;
  jobStage?: string;
  jobFamily?: string;
  summary?: string;
  techStack?: string[];
  industryContext?: string;
  coreResponsibilities?: string[];
  suitableFor?: string[];
  notSuitableFor?: string[];
  generatedMeta?: {
    confidence: number;
    sourceCount: number;
  };
  enhancedDimensions?: any[];
}

const DEFAULT_DIMENSIONS = (name: string) => [
  {
    dimensionKey: "professional_skills",
    dimensionName: "专业技能",
    icon: "⚡️",
    groupKey: "professional_skill",
    level: 4,
    weight: 0.35,
    definition: `掌握${name}领域的核心开发技能、工具链与工程实践。`,
    importance: "高",
    subAbilities: [
      {
        name: "技术深度",
        description: "理解底层原理与核心架构。",
        requiredLevel: "熟练",
        evidenceExamples: ["能够独立解决复杂技术问题"],
        verificationMethods: ["技术面试", "代码评审"],
      },
    ],
    learningPath: [{ stage: "短期", goal: "打牢技术基础", actions: ["系统学习官方文档"] }],
    commonGaps: ["基础知识不扎实"],
    improvementAdvice: ["多看源码，理解原理"],
    recommendedProjects: [
      { name: `${name}核心组件实现`, difficulty: "中", value: "体现工程化能力" },
    ],
  },
  {
    dimensionKey: "practical_experience",
    dimensionName: "实践/实习",
    icon: "💼",
    groupKey: "basic_requirement",
    level: 3,
    weight: 0.2,
    definition: "具备真实的项目开发经历或企业实习经验。",
    importance: "中",
  },
  {
    dimensionKey: "innovation",
    dimensionName: "创新能力",
    icon: "💡",
    groupKey: "growth_potential",
    level: 3,
    weight: 0.1,
    definition: "持续优化，追求卓越。",
    importance: "中",
  },
  {
    dimensionKey: "learning_ability",
    dimensionName: "学习能力",
    icon: "📚",
    groupKey: "growth_potential",
    level: 4,
    weight: 0.15,
    definition: "快速学习，技能迁移。",
    importance: "高",
  },
  {
    dimensionKey: "stress_tolerance",
    dimensionName: "抗压能力",
    icon: "🛡️",
    groupKey: "professional_quality",
    level: 3,
    weight: 0.1,
    definition: "冷静应对，稳定输出。",
    importance: "中",
  },
  {
    dimensionKey: "communication",
    dimensionName: "沟通能力",
    icon: "💬",
    groupKey: "professional_quality",
    level: 3,
    weight: 0.05,
    definition: "清晰表达，高效协作。",
    importance: "中",
  },
  {
    dimensionKey: "qualification",
    dimensionName: "资历要求",
    icon: "🎓",
    groupKey: "basic_requirement",
    level: 2,
    weight: 0.05,
    definition: "学历背景与专业基础。",
    importance: "低",
  },
];

const MOCK_PROFILES: EnhancedJobProfile[] = [
  {
    job_name: "前端开发工程师",
    category: "研发",
    jobLevel: "标准",
    jobStage: "正式/实习",
    summary: "专注于用户交互体验，精通 Web 前端技术栈与跨端开发。",
    techStack: ["React/Vue", "TypeScript", "Webpack/Vite", "Canvas/SVG"],
    suitableFor: ["热爱视觉表现与交互的学生"],
    notSuitableFor: ["对样式与兼容性毫无耐心的学生"],
    enhancedDimensions: DEFAULT_DIMENSIONS("前端开发"),
    skills: { level: 5, weight: 35, description: "" },
    certification: { level: 3, weight: 5, description: "" },
    innovation: { level: 3, weight: 10, description: "" },
    learning: { level: 4, weight: 15, description: "" },
    stress: { level: 3, weight: 10, description: "" },
    communication: { level: 3, weight: 5, description: "" },
    experience: { level: 3, weight: 20, description: "" },
  },
  {
    job_name: "后端开发工程师",
    category: "研发",
    jobLevel: "中级",
    jobStage: "正式岗",
    summary: "负责海量数据处理与高并发系统架构，强调稳定性与性能。",
    techStack: ["Go/Java/Node", "MySQL", "Redis", "Kafka", "Docker"],
    enhancedDimensions: DEFAULT_DIMENSIONS("后端开发"),
    skills: { level: 5, weight: 35, description: "" },
    certification: { level: 3, weight: 5, description: "" },
    innovation: { level: 3, weight: 10, description: "" },
    learning: { level: 4, weight: 15, description: "" },
    stress: { level: 3, weight: 10, description: "" },
    communication: { level: 3, weight: 5, description: "" },
    experience: { level: 3, weight: 20, description: "" },
  },
  {
    job_name: "Java开发工程师",
    category: "研发",
    jobLevel: "中级",
    jobStage: "正式岗",
    summary: "基于 Java 生态构建企业级应用，深度调优 JVM 与微服务架构。",
    techStack: ["Spring Boot", "Spring Cloud", "JVM", "MyBatis", "ZooKeeper"],
    enhancedDimensions: DEFAULT_DIMENSIONS("Java"),
    skills: { level: 5, weight: 35, description: "" },
    certification: { level: 3, weight: 5, description: "" },
    innovation: { level: 3, weight: 10, description: "" },
    learning: { level: 4, weight: 15, description: "" },
    stress: { level: 3, weight: 10, description: "" },
    communication: { level: 3, weight: 5, description: "" },
    experience: { level: 3, weight: 20, description: "" },
  },
  {
    job_name: "Python开发工程师",
    category: "研发",
    jobLevel: "标准",
    jobStage: "正式/实习",
    summary: "利用 Python 的高效生产力，涉及 Web 开发、自动化与 AI 辅助。",
    techStack: ["Django/FastAPI", "Pandas", "Scrapy", "Asyncio"],
    enhancedDimensions: DEFAULT_DIMENSIONS("Python"),
    skills: { level: 5, weight: 35, description: "" },
    certification: { level: 3, weight: 5, description: "" },
    innovation: { level: 3, weight: 10, description: "" },
    learning: { level: 4, weight: 15, description: "" },
    stress: { level: 3, weight: 10, description: "" },
    communication: { level: 3, weight: 5, description: "" },
    experience: { level: 3, weight: 20, description: "" },
  },
  {
    job_name: "C/C++开发工程师",
    category: "研发",
    jobLevel: "初级",
    jobStage: "校招/实习",
    jobFamily: "后端开发",
    summary: "面向高性能服务端与系统模块开发，强调 C/C++、Linux、多线程与性能优化能力。",
    techStack: ["C/C++ 11/14", "Linux", "STL/Boost", "TCP/IP", "gdb/perf"],
    industryContext: "适用于系统软件、中间件、游戏服务端等方向。",
    coreResponsibilities: ["服务端模块开发", "性能优化与排查"],
    suitableFor: ["喜欢底层原理的学生"],
    notSuitableFor: ["只想做简单业务逻辑的学生"],
    generatedMeta: { confidence: 0.88, sourceCount: 18 },
    enhancedDimensions: [
      {
        dimensionKey: "professional_skills",
        dimensionName: "专业技能",
        icon: "⚡️",
        groupKey: "professional_skill",
        level: 5,
        weight: 0.3,
        definition: "能独立完成 Linux 环境下服务端开发与调试。",
        importance: "高",
        subAbilities: [
          {
            name: "C/C++语言",
            description: "掌握指针与内存管理。",
            requiredLevel: "熟练",
            evidenceExamples: ["代码评审过关"],
            verificationMethods: ["笔试"],
          },
        ],
        learningPath: [{ stage: "短期", goal: "补齐基础", actions: ["学习 STL"] }],
        commonGaps: ["内存泄漏排查慢"],
        improvementAdvice: ["练习 Valgrind 使用"],
        recommendedProjects: [{ name: "高并发 HTTP 服务器", difficulty: "高", value: "核心项目" }],
      },
      {
        dimensionKey: "practical_experience",
        dimensionName: "实践/实习",
        icon: "💼",
        groupKey: "basic_requirement",
        level: 4,
        weight: 0.16,
        definition: "有项目或实习经历。",
        importance: "高",
      },
      {
        dimensionKey: "innovation",
        dimensionName: "创新能力",
        icon: "💡",
        groupKey: "growth_potential",
        level: 4,
        weight: 0.14,
        definition: "提出并落地改进方案。",
        importance: "中",
      },
      {
        dimensionKey: "learning_ability",
        dimensionName: "学习能力",
        icon: "📚",
        groupKey: "growth_potential",
        level: 4,
        weight: 0.14,
        definition: "快速掌握新技术。",
        importance: "中",
      },
      {
        dimensionKey: "stress_tolerance",
        dimensionName: "抗压能力",
        icon: "🛡️",
        groupKey: "professional_quality",
        level: 3,
        weight: 0.12,
        definition: "冷静排查故障。",
        importance: "中",
      },
      {
        dimensionKey: "communication",
        dimensionName: "沟通能力",
        icon: "💬",
        groupKey: "professional_quality",
        level: 3,
        weight: 0.1,
        definition: "表达清晰。",
        importance: "中",
      },
      {
        dimensionKey: "qualification",
        dimensionName: "资历要求",
        icon: "🎓",
        groupKey: "basic_requirement",
        level: 1,
        weight: 0.04,
        definition: "专业背景。",
        importance: "低",
      },
    ],
    skills: { level: 5, weight: 30, description: "" },
    certification: { level: 1, weight: 4, description: "" },
    innovation: { level: 4, weight: 14, description: "" },
    learning: { level: 4, weight: 14, description: "" },
    stress: { level: 3, weight: 12, description: "" },
    communication: { level: 3, weight: 10, description: "" },
    experience: { level: 4, weight: 16, description: "" },
  },
  {
    job_name: "测试工程师",
    category: "质量",
    jobLevel: "标准",
    jobStage: "正式/实习",
    summary: "保障软件全生命周期质量，涵盖自动化、性能与可靠性测试。",
    techStack: ["Selenium/Pytest", "JMeter", "Postman", "Appium"],
    enhancedDimensions: DEFAULT_DIMENSIONS("软件测试"),
    skills: { level: 4, weight: 30, description: "" },
    certification: { level: 4, weight: 15, description: "" },
    innovation: { level: 3, weight: 15, description: "" },
    learning: { level: 4, weight: 15, description: "" },
    stress: { level: 4, weight: 10, description: "" },
    communication: { level: 5, weight: 10, description: "" },
    experience: { level: 4, weight: 5, description: "" },
  },
  {
    job_name: "运维工程师",
    category: "基础设施",
    jobLevel: "标准",
    jobStage: "正式/实习",
    summary: "维护大规模集群稳定性，推动基础设施即代码与 DevOps 文化。",
    techStack: ["Kubernetes", "Prometheus", "Ansible", "Terraform", "Shell"],
    enhancedDimensions: DEFAULT_DIMENSIONS("系统运维"),
    skills: { level: 4, weight: 35, description: "" },
    certification: { level: 4, weight: 15, description: "" },
    innovation: { level: 3, weight: 10, description: "" },
    learning: { level: 4, weight: 15, description: "" },
    stress: { level: 5, weight: 15, description: "" },
    communication: { level: 4, weight: 5, description: "" },
    experience: { level: 4, weight: 5, description: "" },
  },
  {
    job_name: "数据开发工程师",
    category: "数据",
    jobLevel: "标准",
    jobStage: "正式岗",
    summary: "构建高效的数据湖仓体系，负责 ETL 任务与离线/实时计算。",
    techStack: ["Flink/Spark", "Hadoop", "Hive", "Doris", "Airflow"],
    enhancedDimensions: DEFAULT_DIMENSIONS("数据开发"),
    skills: { level: 5, weight: 40, description: "" },
    certification: { level: 3, weight: 10, description: "" },
    innovation: { level: 4, weight: 15, description: "" },
    learning: { level: 4, weight: 15, description: "" },
    stress: { level: 3, weight: 5, description: "" },
    communication: { level: 4, weight: 10, description: "" },
    experience: { level: 4, weight: 5, description: "" },
  },
  {
    job_name: "算法工程师",
    category: "研发",
    jobLevel: "专家级",
    jobStage: "正式岗",
    summary: "针对业务痛点 design 机器学习模型，追求算法在生产环境的最优效果。",
    techStack: ["PyTorch/TF", "CUDA", "LLM Fine-tuning", "Scikit-learn"],
    enhancedDimensions: DEFAULT_DIMENSIONS("人工智能算法"),
    skills: { level: 5, weight: 45, description: "" },
    certification: { level: 5, weight: 15, description: "" },
    innovation: { level: 5, weight: 20, description: "" },
    learning: { level: 5, weight: 10, description: "" },
    stress: { level: 3, weight: 5, description: "" },
    communication: { level: 3, weight: 5, description: "" },
    experience: { level: 4, weight: 5, description: "" },
  },
  {
    job_name: "UI/UX设计师",
    category: "设计",
    jobLevel: "标准",
    jobStage: "正式岗",
    summary: "结合美学与心理学，打造极致的用户交互体验与视觉语言。",
    techStack: ["Figma", "Sketch", "Protopie", "Design System"],
    enhancedDimensions: DEFAULT_DIMENSIONS("设计交互"),
    skills: { level: 5, weight: 40, description: "" },
    certification: { level: 3, weight: 15, description: "" },
    innovation: { level: 5, weight: 15, description: "" },
    learning: { level: 4, weight: 10, description: "" },
    stress: { level: 3, weight: 5, description: "" },
    communication: { level: 5, weight: 15, description: "" },
    experience: { level: 4, weight: 5, description: "" },
  },
];

const profiles = ref<EnhancedJobProfile[]>([]);
const selected = ref<EnhancedJobProfile | null>(null);
const activeCategory = ref("all");
const selectedJobName = ref("");

const isDrawerOpen = ref(false);
const activeDim = ref<any>(null);

const loading = reactive({ list: false, comicJobName: "" });
const uiState = reactive({ error: "" });

const categoryOptions = computed(() => {
  const categories = Array.from(new Set(profiles.value.map((item) => item.category))).sort();
  return ["all", ...categories];
});

const visibleProfiles = computed(() => {
  if (activeCategory.value === "all") return profiles.value;
  return profiles.value.filter((item) => item.category === activeCategory.value);
});

function openDrawer(dim: any) {
  activeDim.value = dim;
  isDrawerOpen.value = true;
  document.body.style.overflow = "hidden";
}
function closeDrawer() {
  isDrawerOpen.value = false;
  document.body.style.overflow = "auto";
}

watch(activeCategory, () => {
  if (visibleProfiles.value.length > 0) {
    const firstJob = visibleProfiles.value[0];
    if (!firstJob) return;
    selected.value = firstJob;
    selectedJobName.value = firstJob.job_name;
  }
});

watch(selectedJobName, (newVal) => {
  const target = visibleProfiles.value.find((p) => p.job_name === newVal);
  if (target) selected.value = target;
});

const DIMENSION_META = {
  skills: {
    dimensionKey: "professional_skills",
    dimensionName: "专业技能",
    icon: "⚡️",
    groupKey: "professional_skill",
  },
  certification: {
    dimensionKey: "qualification",
    dimensionName: "资历要求",
    icon: "🎓",
    groupKey: "basic_requirement",
  },
  innovation: {
    dimensionKey: "innovation",
    dimensionName: "创新能力",
    icon: "💡",
    groupKey: "growth_potential",
  },
  learning: {
    dimensionKey: "learning_ability",
    dimensionName: "学习能力",
    icon: "📚",
    groupKey: "growth_potential",
  },
  stress: {
    dimensionKey: "stress_tolerance",
    dimensionName: "抗压能力",
    icon: "🛡️",
    groupKey: "professional_quality",
  },
  communication: {
    dimensionKey: "communication",
    dimensionName: "沟通能力",
    icon: "💬",
    groupKey: "professional_quality",
  },
  experience: {
    dimensionKey: "practical_experience",
    dimensionName: "实践/实习",
    icon: "💼",
    groupKey: "basic_requirement",
  },
} as const;

function normalizeWeight(weight: number): number {
  return weight > 1 ? weight / 100 : weight;
}

function toEnhancedDimension(
  key: keyof typeof DIMENSION_META,
  source: ManualJobPortraitRecord[keyof Pick<
    ManualJobPortraitRecord,
    | "skills"
    | "certification"
    | "innovation"
    | "learning"
    | "stress"
    | "communication"
    | "experience"
  >],
) {
  const meta = DIMENSION_META[key];
  return {
    ...meta,
    level: source.level,
    weight: normalizeWeight(source.weight),
    definition: source.description || `${meta.dimensionName}要求待补充。`,
    importance: normalizeWeight(source.weight) >= 0.2 ? "高" : "中",
    subAbilities: [
      {
        name: meta.dimensionName,
        description: source.description || `${meta.dimensionName}要求待补充。`,
        requiredLevel: `Lv.${source.level}`,
        evidenceExamples: ["项目经历", "实习经历", "作品或证书"],
        verificationMethods: ["简历材料", "面试追问", "项目说明"],
      },
    ],
    learningPath: [
      {
        stage: "短期",
        goal: `补齐${meta.dimensionName}相关证据`,
        actions: [source.description || "围绕岗位要求补充可展示材料"],
      },
    ],
    commonGaps: ["缺少可验证的项目或实践证据"],
    improvementAdvice: [source.description || "结合岗位要求补齐能力证明"],
  };
}

function toEnhancedProfile(item: ManualJobPortraitRecord): EnhancedJobProfile {
  const enhancedDimensions = [
    toEnhancedDimension("skills", item.skills),
    toEnhancedDimension("certification", item.certification),
    toEnhancedDimension("innovation", item.innovation),
    toEnhancedDimension("learning", item.learning),
    toEnhancedDimension("stress", item.stress),
    toEnhancedDimension("communication", item.communication),
    toEnhancedDimension("experience", item.experience),
  ];
  const techStack = item.skills.description
    .split(/[、，,；;。\s]+/g)
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 6);

  return {
    ...item,
    jobLevel: `Lv.${item.skills.level}`,
    jobStage: "流水线生成",
    jobFamily: item.category,
    summary: item.skills.description || `${item.job_name}岗位画像由流水线生成。`,
    techStack,
    industryContext: "来自岗位画像流水线的真实生成结果。",
    coreResponsibilities: [item.skills.description, item.experience.description].filter(Boolean),
    suitableFor: [item.learning.description].filter(Boolean),
    notSuitableFor: [],
    generatedMeta: {
      confidence: 1,
      sourceCount: 1,
    },
    enhancedDimensions,
  };
}

async function loadProfiles(): Promise<void> {
  loading.list = true;
  uiState.error = "";
  try {
    const response = await fetchManualJobPortraits();
    const nextProfiles =
      response.items.length > 0
        ? response.items.map(toEnhancedProfile)
        : await mergeSavedComicState(MOCK_PROFILES);
    profiles.value = nextProfiles;
    if (!categoryOptions.value.includes(activeCategory.value)) {
      activeCategory.value = "all";
    }
    if (profiles.value.length > 0) {
      const defaultProfile = profiles.value[0];
      if (!defaultProfile) return;
      selected.value = defaultProfile;
      selectedJobName.value = defaultProfile.job_name;
    }
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.list = false;
  }
}

function resolveAssetUrl(path: string): string {
  return new URL(path, apiBaseUrl).toString();
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.traceId ? `${error.message}（trace_id: ${error.traceId}）` : error.message;
  }
  if (error instanceof Error) return error.message;
  return "请求失败，请稍后重试";
}

async function mergeSavedComicState(
  sourceProfiles: EnhancedJobProfile[],
): Promise<EnhancedJobProfile[]> {
  const mergedProfiles = sourceProfiles.map((profile) => ({ ...profile }));
  try {
    const response = await fetchManualJobPortraits();
    const comicByJobName = new Map(
      response.items.map((item) => [
        item.job_name,
        {
          comic_image_url: item.comic_image_url ?? null,
          comic_generated_at: item.comic_generated_at ?? null,
        },
      ]),
    );

    for (const profile of mergedProfiles) {
      Object.assign(profile, comicByJobName.get(profile.job_name) ?? {});
    }
  } catch {
    // 演示页仍以本地岗位数据为主；后端暂不可用时只是不展示已保存漫画。
  }

  await Promise.all(
    mergedProfiles
      .filter((profile) => !profile.comic_image_url)
      .map(async (profile) => {
        try {
          const asset = await fetchJobPortraitComic(profile.job_name);
          profile.comic_image_url = asset.comic_image_url;
        } catch {
          profile.comic_image_url = null;
        }
      }),
  );

  return mergedProfiles;
}

function patchProfileComic(jobName: string, comicImageUrl: string): void {
  const target = profiles.value.find((item) => item.job_name === jobName);
  if (target) {
    target.comic_image_url = comicImageUrl;
    target.comic_generated_at = new Date().toISOString();
  }
  if (selected.value?.job_name === jobName) {
    selected.value = target ?? {
      ...selected.value,
      comic_image_url: comicImageUrl,
      comic_generated_at: new Date().toISOString(),
    };
  }
}

function buildComicContext(profile: EnhancedJobProfile): JobPortraitComicContext {
  return {
    category: profile.category,
    summary: profile.summary,
    tech_stack: profile.techStack ?? [],
    industry_context: profile.industryContext,
    core_responsibilities: profile.coreResponsibilities ?? [],
    suitable_for: profile.suitableFor ?? [],
    not_suitable_for: profile.notSuitableFor ?? [],
  };
}

async function submitGenerateComic(force = false): Promise<void> {
  if (!selected.value || loading.comicJobName) return;
  const jobName = selected.value.job_name;
  loading.comicJobName = jobName;
  uiState.error = "";
  try {
    const response = await generateJobPortraitComic(jobName, {
      force,
      comic_context: buildComicContext(selected.value),
    });
    patchProfileComic(response.job_name, response.comic_image_url);
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.comicJobName = "";
  }
}

onMounted(loadProfiles);
</script>

<template>
  <div class="job-profiles-container">
    <header class="page-header-minimal">
      <div class="header-content">
        <div class="brand">
          <div class="brand-logo">AI</div>
          <span class="brand-name">岗位能力建模中心</span>
        </div>
        <div v-if="selected?.generatedMeta" class="agent-badge">
          <span class="dot green"></span>
          Agent 置信度: {{ (selected.generatedMeta.confidence * 100).toFixed(0) }}% | 数据源:
          {{ selected.generatedMeta.sourceCount }}
        </div>
      </div>
    </header>

    <!-- 顶部控制面板 -->
    <section class="controls-panel card">
      <div class="selectors-group">
        <div class="control-item">
          <label class="item-label">岗位分类</label>
          <div class="select-wrapper">
            <select v-model="activeCategory">
              <option value="all">全部岗位</option>
              <option
                v-for="item in categoryOptions.filter((i) => i !== 'all')"
                :key="item"
                :value="item"
              >
                {{ item }}
              </option>
            </select>
          </div>
        </div>
        <div class="control-item">
          <label class="item-label">岗位名称</label>
          <div class="select-wrapper">
            <select v-model="selectedJobName">
              <option v-for="item in visibleProfiles" :key="item.job_name" :value="item.job_name">
                {{ item.job_name }}
              </option>
            </select>
          </div>
        </div>
      </div>
      <button class="btn-refresh" :disabled="loading.list" @click="loadProfiles">
        <span class="icon">↻</span> 刷新数据
      </button>
    </section>

    <div v-if="uiState.error" class="notice-error">{{ uiState.error }}</div>

    <!-- 主体区域 -->
    <main v-if="selected" class="main-layout">
      <!-- A. 岗位概览卡片 -->
      <section class="job-overview-card">
        <div class="decor-circle"></div>
        <div class="overview-left">
          <div class="title-row">
            <h1 class="job-name-huge">{{ selected.job_name }}</h1>
            <span class="job-level-tag">{{ selected.jobLevel || "初级" }}</span>
          </div>
          <div class="job-meta-row">
            <span class="meta-tag"
              ><i class="icon">💼</i> {{ selected.category }} /
              {{ selected.jobFamily || "研发" }}</span
            >
            <span class="meta-tag"
              ><i class="icon">🎓</i> {{ selected.jobStage || "校招/实习" }}</span
            >
          </div>
          <p class="job-summary">{{ selected.summary }}</p>

          <div class="tech-stack-section">
            <h3 class="sub-h3">必备核心技术栈</h3>
            <div class="tech-chips">
              <span v-for="tech in selected.techStack" :key="tech" class="tech-chip">{{
                tech
              }}</span>
            </div>
          </div>

          <div class="industry-box">
            <h4 class="box-title">行业上下文</h4>
            <p>{{ selected.industryContext || "专注于互联网基础平台与高性能服务方向。" }}</p>
          </div>
        </div>

        <div class="overview-right">
          <div class="job-comic-panel">
            <div class="comic-panel-head">
              <h3 class="sub-h3">岗位职责漫画</h3>
              <button
                class="comic-generate-btn"
                :disabled="Boolean(loading.comicJobName)"
                @click="submitGenerateComic(Boolean(selected.comic_image_url))"
              >
                {{
                  loading.comicJobName === selected.job_name
                    ? "生成中..."
                    : selected.comic_image_url
                      ? "重新生成"
                      : "生成漫画"
                }}
              </button>
            </div>
            <div v-if="selected.comic_image_url" class="comic-image-shell">
              <img
                :src="resolveAssetUrl(selected.comic_image_url)"
                :alt="`${selected.job_name}需要做什么的漫画说明`"
              />
            </div>
            <div v-else class="comic-empty-shell">
              <span>暂无漫画</span>
            </div>
          </div>
        </div>
      </section>

      <!-- B. 七维能力画像区 -->
      <section class="dimensions-area">
        <div class="area-header">
          <h2>七维能力画像</h2>
          <span class="area-hint">点击卡片查看详细标准与建议</span>
        </div>
        <div class="dimensions-grid-high">
          <div
            v-for="dim in selected.enhancedDimensions"
            :key="dim.dimensionKey"
            class="dim-card-high"
            @click="openDrawer(dim)"
          >
            <div class="dim-card-top">
              <div class="dim-icon-bg">{{ dim.icon }}</div>
              <div class="dim-info">
                <span class="dim-title-text">{{ dim.dimensionName }}</span>
                <span class="dim-group-text">{{ dim.groupKey.replace("_", " ") }}</span>
              </div>
              <div class="dim-weight">
                <span class="weight-num">{{ (dim.weight * 100).toFixed(0) }}%</span>
                <span class="weight-lbl">权重</span>
              </div>
            </div>
            <p class="dim-definition-text">{{ dim.definition }}</p>
            <div class="dim-levels">
              <div class="lvl-header">
                <span>要求等级 (Lv.{{ dim.level }})</span>
                <span :class="['imp-tag', dim.importance === '高' ? 'high' : 'mid']"
                  >{{ dim.importance }}重要性</span
                >
              </div>
              <div class="lvl-bar">
                <div
                  v-for="i in 5"
                  :key="i"
                  class="bar-seg"
                  :class="{ active: i <= dim.level }"
                ></div>
              </div>
            </div>
            <div class="dim-hover-tip">查看能力详情 →</div>
          </div>
        </div>
      </section>
    </main>

    <!-- 抽屉 -->
    <div v-if="isDrawerOpen" class="drawer-mask" @click="closeDrawer"></div>
    <transition name="drawer">
      <div v-if="isDrawerOpen && activeDim" class="drawer-content">
        <div class="drawer-header-main">
          <div class="header-left">
            <div class="header-icon">{{ activeDim.icon }}</div>
            <div class="header-txt">
              <h2>{{ activeDim.dimensionName }}</h2>
              <p>
                要求等级: Lv.{{ activeDim.level }} | 权重:
                {{ (activeDim.weight * 100).toFixed(0) }}%
              </p>
            </div>
          </div>
          <button class="drawer-close" @click="closeDrawer">×</button>
        </div>
        <div class="drawer-scroller">
          <div class="quote-box"><strong>评估定义：</strong>{{ activeDim.definition }}</div>
          <div class="sub-abilities-section" v-if="activeDim.subAbilities">
            <h3 class="sec-title">子能力拆解</h3>
            <div v-for="sub in activeDim.subAbilities" :key="sub.name" class="sub-ability-card">
              <div class="sub-head">
                <strong>{{ sub.name }}</strong>
                <span class="sub-req-tag">要求: {{ sub.requiredLevel }}</span>
              </div>
              <p class="sub-desc-text">{{ sub.description }}</p>
              <div class="sub-details-grid">
                <div class="detail-part">
                  <label>举证示例</label>
                  <ul>
                    <li v-for="ev in sub.evidenceExamples" :key="ev">{{ ev }}</li>
                  </ul>
                </div>
                <div class="detail-part">
                  <label>考察方式</label>
                  <ul>
                    <li v-for="vm in sub.verificationMethods" :key="vm">{{ vm }}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div class="learning-section" v-if="activeDim.learningPath">
            <h3 class="sec-title">推荐学习路径</h3>
            <div class="learning-path-nodes">
              <div v-for="path in activeDim.learningPath" :key="path.stage" class="path-node">
                <div class="path-dot"></div>
                <div class="path-txt">
                  <div class="path-goal">{{ path.stage }}目标: {{ path.goal }}</div>
                  <ul class="path-actions">
                    <li v-for="act in path.actions" :key="act">{{ act }}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div class="drawer-footer-row" v-if="activeDim.commonGaps || activeDim.improvementAdvice">
            <div class="footer-block orange">
              <h4>常见差距</h4>
              <ul>
                <li v-for="g in activeDim.commonGaps" :key="g">{{ g }}</li>
              </ul>
            </div>
            <div class="footer-block blue">
              <h4>核心建议</h4>
              <ul>
                <li v-for="a in activeDim.improvementAdvice" :key="a">{{ a }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.job-profiles-container {
  --primary: #2563eb;
  --bg: #f8fafc;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --border: #e2e8f0;
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px;
  background: var(--bg);
  min-height: 100vh;
  font-family: system-ui, sans-serif;
  overflow-x: hidden;
}

/* 顶部导航 */
.page-header-minimal {
  background: white;
  border-bottom: 1px solid var(--border);
  margin: -24px -24px 32px -24px;
  padding: 0 32px;
  height: 64px;
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 100;
}
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.brand-logo {
  width: 32px;
  height: 32px;
  background: var(--primary);
  color: white;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
}
.brand-name {
  font-weight: 700;
  font-size: 18px;
  color: #334155;
}
.agent-badge {
  font-size: 13px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.green {
  background: #10b981;
}

.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

/* 控制面板 Bug 修复 */
.controls-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  margin-bottom: 32px;
}
.selectors-group {
  display: flex;
  gap: 32px;
  flex: 1;
}
.control-item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.item-label {
  font-size: 13px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  white-space: nowrap;
}
.select-wrapper {
  position: relative;
  flex: 1;
  min-width: 180px;
}
.select-wrapper select {
  width: 100%;
  height: 42px;
  padding: 0 40px 0 16px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  appearance: none;
  background: white
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")
    no-repeat right 12px center/16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  cursor: pointer;
  outline: none;
  transition: 0.2s;
}
.select-wrapper select:hover {
  border-color: var(--primary);
}
.btn-refresh {
  background: #f1f5f9;
  border: 1px solid var(--border);
  padding: 0 20px;
  height: 42px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.notice-error {
  margin-bottom: 20px;
  padding: 12px 16px;
  border: 1px solid #fecaca;
  border-radius: 12px;
  background: #fef2f2;
  color: #991b1b;
  font-size: 14px;
  font-weight: 600;
}

/* 岗位概览 */
.job-overview-card {
  background: white;
  border-radius: 24px;
  border: 1px solid #f1f5f9;
  padding: 48px;
  position: relative;
  overflow: hidden;
  display: flex;
  gap: 48px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.02);
  margin-bottom: 40px;
}
.decor-circle {
  position: absolute;
  top: -64px;
  right: -64px;
  width: 256px;
  height: 256px;
  background: linear-gradient(to bottom right, #eff6ff, #e0e7ff);
  border-radius: 50%;
  opacity: 0.5;
  pointer-events: none;
}
.overview-left {
  flex: 1.2;
  position: relative;
  z-index: 1;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}
.job-name-huge {
  font-size: 32px;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}
.job-level-tag {
  background: #dbeafe;
  color: #1e40af;
  padding: 4px 12px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 700;
}
.job-meta-row {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}
.meta-tag {
  background: #f8fafc;
  color: #64748b;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.job-summary {
  font-size: 16px;
  line-height: 1.7;
  color: #475569;
  margin-bottom: 32px;
}
.sub-h3 {
  font-size: 14px;
  font-weight: 800;
  color: #1e293b;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.tech-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 32px;
}
.tech-chip {
  background: #eef2ff;
  color: #4338ca;
  border: 1px solid #e0e7ff;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
}
.industry-box {
  background: #f0f9ff;
  border: 1px solid #e0f2fe;
  padding: 16px;
  border-radius: 12px;
}
.box-title {
  font-size: 13px;
  font-weight: 700;
  color: #0369a1;
  margin-bottom: 4px;
}

.overview-right {
  flex: 1;
  border-left: 1px solid #f1f5f9;
  padding-left: 48px;
  position: relative;
  z-index: 1;
}
.job-comic-panel {
  height: 100%;
}
.comic-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.comic-panel-head .sub-h3 {
  margin-bottom: 0;
}
.comic-generate-btn {
  height: 34px;
  padding: 0 14px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
}
.comic-generate-btn:hover:not(:disabled) {
  background: #dbeafe;
  border-color: #93c5fd;
}
.comic-generate-btn:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.comic-image-shell {
  width: 100%;
  min-height: 420px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  overflow: hidden;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
}
.comic-image-shell img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 540px;
  object-fit: contain;
}
.comic-empty-shell {
  min-height: 420px;
  border: 1px dashed #bfdbfe;
  border-radius: 18px;
  background: #f8fbff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  color: #64748b;
}
.comic-empty-shell span {
  margin-bottom: 8px;
  color: #1e293b;
  font-weight: 800;
}
.comic-empty-shell p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
}
/* 能力画像网格 4个一排 */
.dimensions-area {
  margin-bottom: 48px;
}
.area-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
}
.area-header h2 {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}
.area-hint {
  font-size: 13px;
  color: #94a3b8;
}
.dimensions-grid-high {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
.dim-card-high {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 24px;
  cursor: pointer;
  transition: 0.3s;
  position: relative;
}
.dim-card-high:hover {
  border-color: #3b82f6;
  transform: translateY(-4px);
  box-shadow: 0 10px 25px rgba(59, 130, 246, 0.1);
}
.dim-card-top {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}
.dim-icon-bg {
  width: 44px;
  height: 44px;
  background: #f8fafc;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
.dim-info {
  flex: 1;
  padding: 0 12px;
}
.dim-title-text {
  display: block;
  font-weight: 700;
  color: #1e293b;
  font-size: 16px;
}
.dim-group-text {
  font-size: 10px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.dim-weight {
  text-align: right;
}
.weight-num {
  display: block;
  font-size: 18px;
  font-weight: 900;
  color: var(--primary);
}
.weight-lbl {
  font-size: 10px;
  color: #94a3b8;
}
.dim-definition-text {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 20px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  height: 40px;
}
.lvl-header {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 8px;
}
.imp-tag.high {
  color: #ef4444;
}
.imp-tag.mid {
  color: #f59e0b;
}
.lvl-bar {
  display: flex;
  gap: 4px;
}
.bar-seg {
  height: 6px;
  flex: 1;
  background: #f1f5f9;
  border-radius: 4px;
}
.bar-seg.active {
  background: var(--primary);
}
.dim-hover-tip {
  margin-top: 16px;
  font-size: 12px;
  color: var(--primary);
  font-weight: 700;
  opacity: 0;
  transition: 0.3s;
}
.dim-card-high:hover .dim-hover-tip {
  opacity: 1;
}

/* 抽屉 */
.drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  z-index: 200;
}
.drawer-content {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-width: 680px;
  background: white;
  z-index: 201;
  box-shadow: -10px 0 50px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
}
.drawer-header-main {
  padding: 32px;
  background: #f8fafc;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}
.header-icon {
  width: 64px;
  height: 64px;
  background: white;
  border-radius: 16px;
  font-size: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
}
.header-txt h2 {
  font-size: 24px;
  font-weight: 800;
  margin: 0;
}
.header-txt p {
  color: var(--primary);
  font-weight: 700;
  font-size: 14px;
  margin-top: 4px;
}
.drawer-close {
  background: none;
  border: none;
  font-size: 32px;
  color: #94a3b8;
  cursor: pointer;
  line-height: 1;
}
.drawer-scroller {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
}
.quote-box {
  background: #f0f9ff;
  border-left: 4px solid var(--primary);
  padding: 16px;
  border-radius: 0 12px 12px 0;
  font-size: 14px;
  color: #1e40af;
  margin-bottom: 32px;
}
.sec-title {
  font-size: 16px;
  font-weight: 800;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.sec-title::before {
  content: "";
  width: 4px;
  height: 16px;
  background: var(--primary);
  border-radius: 2px;
}
.sub-ability-card {
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 20px;
}
.sub-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}
.sub-req-tag {
  font-size: 11px;
  background: #f1f5f9;
  padding: 3px 10px;
  border-radius: 6px;
  font-weight: 700;
  color: #475569;
}
.sub-desc-text {
  font-size: 14px;
  color: #475569;
  margin-bottom: 20px;
}
.sub-details-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  border-top: 1px solid #f8fafc;
  padding-top: 20px;
}
.detail-part label {
  font-size: 11px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  margin-bottom: 10px;
  display: block;
}
.detail-part ul {
  padding-left: 16px;
  font-size: 12px;
  color: #475569;
}

.learning-path-nodes {
  border-left: 2px solid #f1f5f9;
  margin-left: 10px;
  padding-left: 32px;
}
.path-node {
  position: relative;
  margin-bottom: 32px;
}
.path-dot {
  position: absolute;
  left: -39px;
  top: 4px;
  width: 14px;
  height: 14px;
  background: white;
  border: 3px solid #10b981;
  border-radius: 50%;
}
.path-goal {
  font-weight: 800;
  font-size: 14px;
  margin-bottom: 10px;
}
.path-actions {
  background: #f8fafc;
  padding: 16px;
  border-radius: 12px;
  font-size: 13px;
  color: #64748b;
  list-style: none;
}
.path-actions li {
  margin-bottom: 6px;
  position: relative;
  padding-left: 18px;
}
.path-actions li::before {
  content: "→";
  position: absolute;
  left: 0;
  color: #cbd5e1;
}
.drawer-footer-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 40px;
}
.footer-block {
  padding: 20px;
  border-radius: 16px;
}
.footer-block.orange {
  background: #fff7ed;
  color: #9a3412;
}
.footer-block.blue {
  background: #f0f9ff;
  color: #075985;
}
.footer-block h4 {
  font-size: 14px;
  font-weight: 800;
  margin-bottom: 12px;
}
.footer-block ul {
  padding-left: 16px;
  font-size: 13px;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}

@media (max-width: 1200px) {
  .dimensions-grid-high {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 900px) {
  .dimensions-grid-high {
    grid-template-columns: repeat(2, 1fr);
  }
  .job-overview-card {
    flex-direction: column;
    padding: 32px;
  }
  .overview-right {
    border-left: none;
    padding-left: 0;
    border-top: 1px solid #f1f5f9;
    padding-top: 32px;
  }
}
@media (max-width: 600px) {
  .dimensions-grid-high {
    grid-template-columns: 1fr;
  }
}
</style>
