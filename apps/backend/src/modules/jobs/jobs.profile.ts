import type { JobRecord } from "@career/contracts/types";

const HARD_SKILL_KEYWORDS = [
  "python",
  "java",
  "golang",
  "c++",
  "sql",
  "mysql",
  "postgresql",
  "redis",
  "linux",
  "docker",
  "kubernetes",
  "git",
  "fastapi",
  "django",
  "spring",
  "vue",
  "react",
  "typescript",
  "数据分析",
  "机器学习",
  "深度学习",
  "etl",
  "爬虫",
  "测试",
  "自动化",
  "算法",
  "系统设计",
  "网络安全",
  "运维",
  "云原生",
];

const CERT_KEYWORDS = [
  "cet-6",
  "英语六级",
  "英语四级",
  "pmp",
  "软考",
  "教师资格证",
  "计算机二级",
  "aws",
  "azure",
  "oracle",
  "hcia",
];

const SOFT_SKILL_KEYWORDS = [
  "沟通",
  "协作",
  "团队",
  "抗压",
  "责任心",
  "学习能力",
  "自驱",
  "执行力",
  "逻辑思维",
  "创新",
  "表达",
  "owner",
];

const TITLE_FALLBACK_SKILLS: Record<string, string[]> = {
  前端: ["javascript", "typescript", "vue", "react", "css"],
  后端: ["python", "java", "sql", "redis", "linux"],
  算法: ["python", "机器学习", "深度学习", "算法", "数据分析"],
  测试: ["测试", "自动化", "python", "sql"],
  运维: ["linux", "docker", "kubernetes", "网络", "监控"],
  产品: ["需求分析", "沟通", "文档", "数据分析"],
};

function extractKeywords(text: string, keywords: string[]): string[] {
  const lowered = text.toLowerCase();
  const hits = keywords.filter((kw) => lowered.includes(kw.toLowerCase()));
  return Array.from(new Set(hits.map((item) => item.toLowerCase()))).map(
    (token) => hits.find((item) => item.toLowerCase() === token)!,
  );
}

function fallbackSkillsFromTitle(title: string): string[] {
  const result: string[] = [];
  Object.entries(TITLE_FALLBACK_SKILLS).forEach(([marker, skills]) => {
    if (title.includes(marker)) {
      result.push(...skills);
    }
  });

  return Array.from(new Set(result.map((item) => item.toLowerCase()))).map(
    (token) => result.find((item) => item.toLowerCase() === token)!,
  );
}

export function generateJobProfile(job: JobRecord): {
  hard_skills: string[];
  certificates: string[];
  soft_skills: string[];
  skill_weights: Record<string, number>;
  summary: string;
  confidence: number;
} {
  const sourceText = [job.title, job.job_description, job.company_intro, job.industry]
    .filter(Boolean)
    .join("\n");

  let hardSkills = extractKeywords(sourceText, HARD_SKILL_KEYWORDS);
  if (hardSkills.length === 0) {
    hardSkills = fallbackSkillsFromTitle(job.title);
  }

  const certificates = extractKeywords(sourceText, CERT_KEYWORDS);
  let softSkills = extractKeywords(sourceText, SOFT_SKILL_KEYWORDS);

  if (softSkills.length === 0) {
    softSkills = ["沟通", "学习能力", "团队协作"];
  }

  const skillWeights: Record<string, number> = {
    基础要求: 0.2,
    职业技能: 0.45,
    职业素养: 0.2,
    发展潜力: 0.15,
  };

  const signalCount = hardSkills.length + certificates.length + softSkills.length;
  let confidence = 0.55;
  if (signalCount >= 10) {
    confidence = 0.9;
  } else if (signalCount >= 6) {
    confidence = 0.78;
  } else if (signalCount >= 3) {
    confidence = 0.66;
  }

  const summary = `岗位【${job.title}】画像已生成：识别到 ${hardSkills.length} 项专业技能、${certificates.length} 项证书要求、${softSkills.length} 项通用素养要求。`;

  return {
    hard_skills: hardSkills,
    certificates,
    soft_skills: softSkills,
    skill_weights: skillWeights,
    summary,
    confidence,
  };
}
