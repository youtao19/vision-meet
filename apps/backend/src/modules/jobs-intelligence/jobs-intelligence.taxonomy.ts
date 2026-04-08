/**
 * 文件作用：提供岗位族（10+）分类与等级归一规则。
 * 设计说明：先以可解释的规则映射保证稳定输出，后续可替换为模型分类器。
 */

export type JobFamilyDefinition = {
  key: string;
  label: string;
  titleKeywords: string[];
  baselineSkills: string[];
};

export const JOB_FAMILY_DEFINITIONS: JobFamilyDefinition[] = [
  {
    key: "frontend",
    label: "前端研发",
    titleKeywords: ["前端", "web", "vue", "react", "h5"],
    baselineSkills: ["JavaScript", "TypeScript", "Vue", "React", "CSS"],
  },
  {
    key: "backend",
    label: "后端研发",
    titleKeywords: ["后端", "java", "golang", "python", "服务端"],
    baselineSkills: ["Java", "Python", "SQL", "Redis", "微服务"],
  },
  {
    key: "fullstack",
    label: "全栈研发",
    titleKeywords: ["全栈", "fullstack"],
    baselineSkills: ["TypeScript", "Node.js", "数据库设计", "前后端协同"],
  },
  {
    key: "data",
    label: "数据工程",
    titleKeywords: ["数据", "etl", "数仓", "大数据", "bi"],
    baselineSkills: ["SQL", "ETL", "Python", "数据建模"],
  },
  {
    key: "algorithm",
    label: "算法与AI",
    titleKeywords: ["算法", "ai", "机器学习", "深度学习", "nlp", "推荐"],
    baselineSkills: ["Python", "机器学习", "特征工程", "模型评估"],
  },
  {
    key: "devops",
    label: "运维与平台",
    titleKeywords: ["运维", "devops", "sre", "云原生", "平台"],
    baselineSkills: ["Linux", "Docker", "Kubernetes", "CI/CD"],
  },
  {
    key: "qa",
    label: "测试质量",
    titleKeywords: ["测试", "qa", "质量", "自动化测试"],
    baselineSkills: ["测试设计", "自动化测试", "缺陷分析"],
  },
  {
    key: "product",
    label: "产品与运营",
    titleKeywords: ["产品", "运营", "增长", "用户研究"],
    baselineSkills: ["需求分析", "数据分析", "跨团队沟通"],
  },
  {
    key: "project",
    label: "项目与交付",
    titleKeywords: ["项目经理", "实施", "交付", "客户成功", "技术支持"],
    baselineSkills: ["项目管理", "风险控制", "客户沟通"],
  },
  {
    key: "security",
    label: "安全",
    titleKeywords: ["安全", "攻防", "渗透", "风控"],
    baselineSkills: ["网络安全", "漏洞分析", "安全审计"],
  },
  {
    key: "design",
    label: "设计体验",
    titleKeywords: ["设计", "交互", "ui", "ux"],
    baselineSkills: ["交互设计", "视觉设计", "用户研究"],
  },
  {
    key: "business",
    label: "商务与职能",
    titleKeywords: ["商务", "销售", "人力", "财务", "行政"],
    baselineSkills: ["沟通谈判", "流程管理", "业务分析"],
  },
];

export function normalizeJobTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, "");
}

function extractMaxYears(text: string): number | null {
  const matches = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*年/g));
  if (matches.length === 0) {
    return null;
  }

  const values = matches.map((item) => Number(item[1])).filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }

  return Math.max(...values);
}

function parseMonthlyMaxBySalaryRange(salaryRange: string): number | null {
  const normalized = salaryRange.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const values = Array.from(normalized.matchAll(/(\d+(?:\.\d+)?)/g))
    .map((item) => Number(item[1]))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  const max = Math.max(...values);
  if (normalized.includes("万")) {
    return Math.round(max * 10000);
  }
  if (normalized.includes("k") || normalized.includes("千")) {
    return Math.round(max * 1000);
  }
  if (normalized.includes("元")) {
    return Math.round(max);
  }
  return max >= 1000 ? Math.round(max) : Math.round(max * 1000);
}

function inferLevelByYears(years: number | null): number | null {
  if (years == null) {
    return null;
  }
  if (years >= 8) {
    return 4;
  }
  if (years >= 5) {
    return 3;
  }
  if (years >= 3) {
    return 2;
  }
  return 1;
}

function inferLevelBySalary(monthlyMax: number | null): number | null {
  if (monthlyMax == null) {
    return null;
  }
  if (monthlyMax >= 28000) {
    return 4;
  }
  if (monthlyMax >= 17000) {
    return 3;
  }
  if (monthlyMax >= 9000) {
    return 2;
  }
  return 1;
}

/**
 * 根据岗位标题归一岗位族。
 * 注意：命中失败时返回 "business" 兜底，确保流水线不会因单条异常中断。
 */
export function resolveJobFamilyByTitle(title: string): JobFamilyDefinition {
  const normalized = normalizeJobTitle(title);

  let best: { item: JobFamilyDefinition; score: number } | null = null;
  for (const item of JOB_FAMILY_DEFINITIONS) {
    for (const keyword of item.titleKeywords) {
      const keywordNormalized = normalizeJobTitle(keyword);
      if (!keywordNormalized) {
        continue;
      }
      if (!normalized.includes(keywordNormalized) && !keywordNormalized.includes(normalized)) {
        continue;
      }

      const score = keywordNormalized.length;
      if (!best || score > best.score) {
        best = { item, score };
      }
    }
  }

  return best?.item ?? JOB_FAMILY_DEFINITIONS.find((item) => item.key === "business")!;
}

/**
 * 从岗位标题中估算岗位层级，用于垂直晋升边构建。
 * 1=初级、2=中级、3=高级、4=专家/负责人。
 */
export function inferJobLevel(title: string): number {
  return inferJobLevelWithSignals(title);
}

/**
 * 结合标题、经验要求与薪资范围估算岗位层级。
 * 1=初级、2=中级、3=高级、4=专家/负责人。
 */
export function inferJobLevelWithSignals(
  title: string,
  signals?: {
    experienceRequirement?: string | null;
    salaryRange?: string | null;
  },
): number {
  const experienceRequirement = signals?.experienceRequirement?.trim() || "";
  const normalized = normalizeJobTitle(`${title} ${experienceRequirement}`);

  if (/chief|principal|专家|架构师|负责人|leader|总监/.test(normalized)) {
    return 4;
  }
  if (/senior|高级|资深/.test(normalized)) {
    return 3;
  }
  if (/mid|中级/.test(normalized)) {
    return 2;
  }

  if (/应届|实习|校招|毕业生/.test(normalized)) {
    return 1;
  }

  const yearsLevel = inferLevelByYears(extractMaxYears(experienceRequirement));
  const salaryLevel = inferLevelBySalary(parseMonthlyMaxBySalaryRange(signals?.salaryRange || ""));

  if (yearsLevel != null && salaryLevel != null) {
    return Math.max(yearsLevel, salaryLevel);
  }
  if (yearsLevel != null) {
    return yearsLevel;
  }
  if (salaryLevel != null) {
    return salaryLevel;
  }

  return 1;
}
