/**
 * 文件作用：定义岗位清洗阶段的“计算机相关岗位”过滤规则。
 * 职责边界：这里只做纯文本判定，不访问数据库，也不生成岗位画像。
 */

type ComputerRelatedJobInput = {
  title: string;
  normalized_title: string;
  job_family: string;
  industry: string | null;
  cleaned_text: string;
  keywords: string[];
};

const COMPUTER_FAMILY_PATTERNS = [
  /software/i,
  /frontend/i,
  /backend/i,
  /data/i,
  /algorithm/i,
  /testing/i,
  /qa/i,
  /devops/i,
  /security/i,
  /cloud/i,
  /hardware/i,
  /embedded/i,
  /engineering/i,
  /软件/,
  /前端/,
  /后端/,
  /数据/,
  /算法/,
  /测试/,
  /运维/,
  /安全/,
  /云计算/,
  /嵌入式/,
  /硬件/,
];

const TITLE_TECH_KEYWORDS = [
  "前端",
  "后端",
  "全栈",
  "开发工程师",
  "研发工程师",
  "程序员",
  "架构",
  "软件",
  "测试开发",
  "软件测试",
  "自动化测试",
  "性能测试",
  "接口测试",
  "运维",
  "sre",
  "devops",
  "算法",
  "机器学习",
  "深度学习",
  "人工智能",
  "数据开发",
  "数据分析",
  "数据挖掘",
  "大数据",
  "数据库",
  "网络安全",
  "信息安全",
  "云计算",
  "嵌入式",
  "硬件测试",
  "芯片",
  "fpga",
  "单片机",
  "android",
  "ios",
  "java",
  "python",
  "c++",
  "golang",
  "go开发",
  "php",
  "node",
  "web",
  "ui/ux",
];

const BODY_TECH_KEYWORDS = [
  "计算机",
  "软件工程",
  "信息技术",
  "互联网",
  "it技术",
  "系统开发",
  "系统架构",
  "后端服务",
  "前端页面",
  "接口设计",
  "接口测试",
  "代码",
  "编程",
  "数据库",
  "sql",
  "mysql",
  "postgresql",
  "redis",
  "linux",
  "docker",
  "kubernetes",
  "k8s",
  "spring",
  "vue",
  "react",
  "typescript",
  "javascript",
  "python",
  "java",
  "c++",
  "golang",
  "android",
  "ios",
  "机器学习",
  "深度学习",
  "大模型",
  "nlp",
  "cv",
  "数据仓库",
  "etl",
  "spark",
  "flink",
  "hadoop",
  "网络安全",
  "信息安全",
  "渗透测试",
  "云平台",
  "嵌入式",
  "单片机",
  "fpga",
  "芯片",
  "硬件测试",
  "通信协议",
];

const COMPUTER_INDUSTRY_KEYWORDS = [
  "计算机",
  "软件",
  "互联网",
  "信息技术",
  "it服务",
  "人工智能",
  "大数据",
  "云计算",
  "通信",
  "电子",
  "半导体",
];

const NON_COMPUTER_TITLE_KEYWORDS = [
  "销售",
  "客服",
  "人事",
  "行政",
  "财务",
  "会计",
  "出纳",
  "采购",
  "市场",
  "商务",
  "新媒体运营",
  "内容运营",
  "直播运营",
  "电商运营",
  "教师",
  "讲师",
  "文员",
];

function normalizeSearchText(input: string | null | undefined): string {
  return (input || "").toLowerCase().replaceAll(/\s+/g, " ").trim();
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function countMatches(text: string, keywords: string[]): number {
  return keywords.reduce((count, keyword) => {
    return text.includes(keyword.toLowerCase()) ? count + 1 : count;
  }, 0);
}

/**
 * 作用：判断清洗后的岗位是否应该进入计算机岗位画像流水线。
 * 参数：job 为清洗后的岗位文本、标准化提示与关键词。
 * 返回：true 表示保留，false 表示在清洗阶段丢弃。
 * 注意：行业字段只能作为辅助信号，避免把“互联网销售/运营”误保留下来。
 */
export function isComputerRelatedCleanedJob(job: ComputerRelatedJobInput): boolean {
  const titleText = normalizeSearchText(`${job.title} ${job.normalized_title}`);
  const familyText = normalizeSearchText(job.job_family);
  const industryText = normalizeSearchText(job.industry);
  const bodyText = normalizeSearchText(`${job.cleaned_text} ${job.keywords.join(" ")}`);
  const fullText = `${titleText} ${familyText} ${industryText} ${bodyText}`;

  const familyMatched = COMPUTER_FAMILY_PATTERNS.some((pattern) => pattern.test(job.job_family));
  const titleMatched = includesAny(titleText, TITLE_TECH_KEYWORDS);
  const bodyMatchCount = countMatches(bodyText, BODY_TECH_KEYWORDS);
  const industryMatched = includesAny(industryText, COMPUTER_INDUSTRY_KEYWORDS);
  const nonComputerTitleMatched = includesAny(titleText, NON_COMPUTER_TITLE_KEYWORDS);

  if (familyMatched || titleMatched) {
    return true;
  }

  // “互联网/IT 公司”里的非技术岗位很多，必须再看到至少两个技术证据才保留。
  if (industryMatched && bodyMatchCount >= 2) {
    return !nonComputerTitleMatched || includesAny(fullText, TITLE_TECH_KEYWORDS);
  }

  return bodyMatchCount >= 3;
}
