/**
 * 文件作用：将岗位画像转换为四格漫画生成任务。
 * 职责边界：只负责 prompt 组织、本地文件路径规划和调用 baoyu-imagine，不参与岗位画像读写。
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import type {
  JobPictureBook as ComicBook,
  PictureBookPage as ComicBookPage,
  JobPortraitPictureBookContext as JobPortraitComicContext,
  ManualJobPortraitRecord,
} from "@career/contracts/types";

import type { AppEnv } from "../../shared/config/env.js";
import type { TtsEngine } from "../pi-tools/tts/tts-engine.js";

const BAOYU_IMAGINE_TIMEOUT_MS = 180000;

type JobComicScenario = {
  label: string;
  keywords: string[];
  taskExamples: string[];
  coreActions: string[];
  collaborators: string[];
  resultExamples: string[];
  visualHints: string[];
  summary: string;
};

export type JobPortraitComicGenerationResult = {
  imageUrl: string;
  imagePath: string;
};

export type JobPortraitComicAsset = JobPortraitComicGenerationResult & {
  exists: boolean;
};

/**
 * 作用：根据岗位名生成稳定文件名。
 * 参数：jobName 为岗位画像名称。
 * 返回：可用于本地图片文件的短名称。
 */
export function toJobPortraitComicFileStem(jobName: string): string {
  const normalized = jobName
    .toLowerCase()
    .replaceAll(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 40);
  const hash = createHash("sha1").update(jobName).digest("hex").slice(0, 10);
  return `${normalized || "job"}-${hash}`;
}

/**
 * 作用：计算岗位绘本静态资源路径。
 * 参数：jobName 为岗位名；env 提供绘本输出目录。
 * 返回：图片绝对路径、前端可访问 URL 和文件是否存在。
 */
export function resolveJobPortraitComicAsset(params: {
  jobName: string;
  env: AppEnv;
}): JobPortraitComicAsset {
  const fileStem = toJobPortraitComicFileStem(params.jobName);
  const imagePath = path.join(params.env.JOB_PICTURE_BOOK_OUTPUT_DIR, `${fileStem}.png`);
  return {
    imagePath,
    imageUrl: `/assets/job-picture-books/${fileStem}.png`,
    exists: existsSync(imagePath),
  };
}

function formatContextList(title: string, items: string[] | undefined): string[] {
  const normalized = (items ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  if (normalized.length === 0) {
    return [];
  }
  return [`${title}：${normalized.join("、")}`];
}

function buildFrontendContextLines(context?: JobPortraitComicContext): string[] {
  if (!context) {
    return [];
  }

  return [
    "前端展示上下文（生成漫画时优先参考）：",
    ...(context.summary?.trim() ? [`岗位简介：${context.summary.trim()}`] : []),
    ...(context.industry_context?.trim() ? [`行业上下文：${context.industry_context.trim()}`] : []),
    ...formatContextList("页面技术栈", context.tech_stack),
    ...formatContextList("页面核心职责", context.core_responsibilities),
    ...formatContextList("适合人群", context.suitable_for),
    ...formatContextList("不太适合", context.not_suitable_for),
  ];
}

const JOB_COMIC_SCENARIOS: JobComicScenario[] = [
  {
    label: "前端开发",
    keywords: ["前端", "web", "frontend", "vue", "react", "h5", "小程序"],
    taskExamples: ["活动页要上线", "页面加载太慢", "移动端样式错位", "接口数据没有正确显示"],
    coreActions: ["还原设计稿", "拆分页面组件", "调接口并处理交互", "适配手机和电脑"],
    collaborators: ["产品", "UI/UX设计师", "后端", "测试"],
    resultExamples: ["页面能看到、能点击、能顺畅使用", "首屏加载更快", "手机和电脑显示一致"],
    visualHints: ["浏览器页面预览", "组件积木", "手机与电脑双端画面", "接口箭头"],
    summary: "前端开发 = 把设计稿和业务需求变成用户能操作的界面。",
  },
  {
    label: "后端开发",
    keywords: ["后端", "java", "python", "c/c++", "c++", "golang", "go", "node"],
    taskExamples: ["系统接口变慢", "下单流程需要新增规则", "数据库查询异常", "高峰期服务不稳定"],
    coreActions: ["写接口", "处理业务逻辑", "读写数据库", "看日志并优化性能"],
    collaborators: ["产品", "前端", "测试", "运维", "DBA"],
    resultExamples: ["接口更快了", "系统功能稳定上线", "前端和用户可以正常使用"],
    visualHints: ["接口流程图", "数据库图标", "日志窗口", "性能曲线"],
    summary: "后端开发 = 把业务需求变成稳定运行的服务和接口。",
  },
  {
    label: "测试工程师",
    keywords: ["测试", "qa", "质量"],
    taskExamples: ["新功能上线前要确认有没有 bug", "支付流程测试失败", "接口返回结果不符合需求"],
    coreActions: ["写测试用例", "执行功能和接口测试", "记录缺陷", "回归验证修复结果"],
    collaborators: ["产品", "前端", "后端", "运维"],
    resultExamples: ["bug 提前暴露", "上线风险降低", "功能更可靠"],
    visualHints: ["测试清单", "Postman 接口检查", "缺陷单", "绿色通过标记"],
    summary: "测试工程师 = 用系统化测试发现问题，保障软件质量。",
  },
  {
    label: "运维工程师",
    keywords: ["运维", "devops", "sre", "基础设施", "kubernetes", "prometheus"],
    taskExamples: ["服务报警了", "系统发布失败", "服务器资源异常", "线上访问变慢"],
    coreActions: ["看监控", "查日志", "处理告警", "部署服务和配置环境"],
    collaborators: ["后端", "测试", "DBA", "项目经理"],
    resultExamples: ["系统恢复正常", "发布顺利完成", "服务持续稳定运行"],
    visualHints: ["监控大屏", "告警铃", "服务器机柜", "发布流水线"],
    summary: "运维工程师 = 保障系统稳定、安全、持续运行。",
  },
  {
    label: "数据开发",
    keywords: ["数据开发", "etl", "数仓", "大数据", "spark", "flink", "hive"],
    taskExamples: ["业务报表数据不准", "需要新增每日数据看板", "实时数据链路延迟过高"],
    coreActions: ["接入数据源", "清洗转换数据", "编写 ETL 任务", "检查数据质量"],
    collaborators: ["数据分析", "产品", "后端", "业务方"],
    resultExamples: ["报表数据更准确", "数据链路稳定产出", "团队能用数据做决策"],
    visualHints: ["数据管道", "表格校验", "仪表盘", "数据仓库图标"],
    summary: "数据开发 = 把分散的数据整理成稳定、可用、可信的数据资产。",
  },
  {
    label: "算法工程师",
    keywords: ["算法", "机器学习", "ai", "人工智能", "模型", "llm", "pytorch", "tensorflow"],
    taskExamples: ["推荐结果不够准", "识别效果不稳定", "预测指标需要提升"],
    coreActions: ["整理训练样本", "训练模型", "评估指标", "调参并上线验证"],
    collaborators: ["数据", "后端", "产品", "业务方"],
    resultExamples: ["模型效果提升", "推荐或识别更准确", "算法能在真实业务中使用"],
    visualHints: ["样本数据", "模型训练曲线", "评估指标面板", "上线验证箭头"],
    summary: "算法工程师 = 用数据和模型解决识别、预测、推荐等问题。",
  },
  {
    label: "UI/UX设计",
    keywords: ["ui", "ux", "设计", "figma", "sketch", "交互"],
    taskExamples: ["用户不会用新功能", "页面体验差", "新流程需要设计"],
    coreActions: ["画原型", "设计界面", "梳理用户流程", "输出交互说明"],
    collaborators: ["产品", "前端", "用户", "测试"],
    resultExamples: ["页面更清楚", "操作更顺", "研发能按设计落地"],
    visualHints: ["Figma 画板", "用户流程图", "按钮和表单组件", "可用性反馈"],
    summary: "UI/UX设计师 = 设计用户看得懂、用得顺的产品体验。",
  },
  {
    label: "技术支持",
    keywords: ["技术支持", "support", "客服技术", "售后技术"],
    taskExamples: ["客户反馈系统不能用", "远程配置失败", "用户操作报错"],
    coreActions: ["远程排查", "复现问题", "查看日志", "整理解决方案"],
    collaborators: ["客户", "研发", "实施", "产品"],
    resultExamples: ["客户问题被解决", "系统恢复正常使用", "知识库新增解决方案"],
    visualHints: ["工单列表", "远程协助窗口", "日志放大镜", "知识库文档"],
    summary: "技术支持 = 帮客户定位并解决产品使用中的技术问题。",
  },
  {
    label: "实施工程师",
    keywords: ["实施", "交付", "部署", "项目实施"],
    taskExamples: ["客户系统要部署上线", "现场环境配置不通", "客户需要培训和验收"],
    coreActions: ["安装部署", "配置环境", "导入数据", "培训客户并推进验收"],
    collaborators: ["客户", "项目经理", "研发", "运维"],
    resultExamples: ["系统在客户现场跑起来", "客户完成验收", "用户开始正式使用"],
    visualHints: ["客户现场会议", "部署清单", "验收勾选", "培训投影屏"],
    summary: "实施工程师 = 把公司的系统交付到客户现场并跑通用起来。",
  },
  {
    label: "硬件测试",
    keywords: ["硬件测试", "硬件验证", "可靠性测试", "电子测试"],
    taskExamples: ["新硬件要验证稳定性", "测试设备发现异常信号", "量产前需要可靠性报告"],
    coreActions: ["连接测试设备", "执行测试项", "记录异常", "复测并输出报告"],
    collaborators: ["硬件工程师", "嵌入式工程师", "生产", "质量团队"],
    resultExamples: ["硬件问题提前发现", "产品稳定性更高", "量产风险降低"],
    visualHints: ["测试台", "示波器", "硬件板卡", "测试报告"],
    summary: "硬件测试 = 用实验和数据验证硬件产品是否可靠。",
  },
  {
    label: "产品专员/助理",
    keywords: ["产品", "产品专员", "产品助理", "pm"],
    taskExamples: ["新功能要不要做", "用户反馈流程太复杂", "需求规则需要确认"],
    coreActions: ["收集需求", "画原型", "写产品文档", "跟进开发和反馈"],
    collaborators: ["用户", "设计", "研发", "测试", "运营"],
    resultExamples: ["需求被清楚定义", "团队知道怎么开发", "功能按目标落地"],
    visualHints: ["需求文档", "原型草图", "用户反馈便签", "迭代看板"],
    summary: "产品专员 = 把用户问题整理成团队能开发的产品方案。",
  },
  {
    label: "网络销售",
    keywords: ["网络销售", "销售", "电销", "商务"],
    taskExamples: ["需要找到潜在客户", "客户想了解产品方案", "报价后需要持续跟进"],
    coreActions: ["筛选客户", "沟通需求", "介绍方案", "跟进报价和合作"],
    collaborators: ["客户", "售前", "技术支持", "运营", "主管"],
    resultExamples: ["客户理解产品", "合作机会推进", "成交或复购增加"],
    visualHints: ["客户聊天窗口", "销售漏斗", "产品方案页", "成交勾选"],
    summary: "网络销售 = 通过线上沟通把产品推荐给合适客户并促成合作。",
  },
];

const DEFAULT_JOB_COMIC_SCENARIO: JobComicScenario = {
  label: "通用岗位",
  keywords: [],
  taskExamples: ["收到一个真实业务问题", "需要完成一项明确交付", "用户或团队反馈当前流程有卡点"],
  coreActions: ["理解需求", "拆解任务", "完成关键产出", "检查结果"],
  collaborators: ["产品", "业务方", "研发", "客户"],
  resultExamples: ["问题被解决", "成果可被真实使用", "团队可以继续迭代"],
  visualHints: ["任务看板", "协作白板", "交付清单", "绿色勾选"],
  summary: "这个岗位 = 把具体问题拆解成可执行任务，并交付真实可用的成果。",
};

/**
 * 作用：根据岗位名称、分类和前端上下文选择漫画场景。
 * 参数：portrait 提供后端画像主数据；context 提供页面展示中的技术栈和职责补充。
 * 返回：最贴近当前岗位的漫画场景规则。
 * 注意：匹配只用于 prompt 约束，不改变岗位画像数据本身。
 */
function resolveJobComicScenario(
  portrait: ManualJobPortraitRecord,
  context?: JobPortraitComicContext,
): JobComicScenario {
  const searchableText = [
    portrait.job_name,
    portrait.category,
    context?.category,
    context?.summary,
    context?.industry_context,
    ...(context?.tech_stack ?? []),
    ...(context?.core_responsibilities ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // 同一个岗位可能命中多个关键词，例如“硬件测试”同时命中“硬件测试”和“测试”。
  // 使用最长关键词优先，避免更具体的岗位被泛化场景抢先匹配。
  let matchedScenario: JobComicScenario | null = null;
  let matchedKeywordLength = 0;
  for (const scenario of JOB_COMIC_SCENARIOS) {
    const longestMatchedKeywordLength = scenario.keywords.reduce((maxLength, keyword) => {
      const normalizedKeyword = keyword.toLowerCase();
      return searchableText.includes(normalizedKeyword)
        ? Math.max(maxLength, normalizedKeyword.length)
        : maxLength;
    }, 0);
    if (longestMatchedKeywordLength > matchedKeywordLength) {
      matchedScenario = scenario;
      matchedKeywordLength = longestMatchedKeywordLength;
    }
  }

  return matchedScenario ?? DEFAULT_JOB_COMIC_SCENARIO;
}

function formatScenarioList(title: string, items: string[]): string {
  return `${title}：${items.join("、")}`;
}

function buildScenarioLines(scenario: JobComicScenario): string[] {
  return [
    "岗位类型差异化规则（必须优先遵守）：",
    `识别到的岗位类型：${scenario.label}`,
    formatScenarioList("真实任务示例", scenario.taskExamples),
    formatScenarioList("核心动作示例", scenario.coreActions),
    formatScenarioList("协作对象建议", scenario.collaborators),
    formatScenarioList("交付结果示例", scenario.resultExamples),
    formatScenarioList("画面元素建议", scenario.visualHints),
    `底部总结条建议：${scenario.summary}`,
    "如果岗位名称、岗位简介或核心职责与示例冲突，优先贴合输入岗位本身，但仍保持“大学生能看懂”的表达。",
  ];
}

/**
 * 作用：把结构化岗位画像压缩成稳定的四格漫画 prompt。
 * 参数：portrait 为人工岗位画像记录；context 为前端当前 mock 展示内容。
 * 返回：可直接交给 baoyu-imagine 的中文图片生成提示词。
 * 注意：MVP 固定单张 2x2，不生成角色设定表和多页分镜。
 */
export function buildJobPortraitComicPrompt(
  portrait: ManualJobPortraitRecord,
  context?: JobPortraitComicContext,
): string {
  const scenario = resolveJobComicScenario(portrait, context);
  const detail = portrait.profile_detail;
  const abilityLines = [
    `核心技能：${detail.skills.join("、")}`,
    `软技能：${detail.softSkills.join("、")}`,
    `证书：${detail.certificates.join("、") || "无强制证书"}`,
    `学习能力：${detail.learningAbility}`,
    `创新能力：${detail.innovationAbility}`,
    `抗压强度：${detail.stressResistance}`,
    `沟通要求：${detail.communicationAbility}`,
    `实习建议：${detail.internshipAbility}`,
  ];

  return [
    `请生成一张中文职业科普单页 2×2 四格漫画，主题是“${portrait.job_name}每天在做什么？”。`,
    "目标读者：大学生、转专业学生、准备找实习的同学；读者可能没有真实工作经验，所以必须用具体动作解释岗位。",
    "整体风格：简洁黑白线稿、清晰黑色描边、白色背景，只用少量蓝色作为强调色；不要复杂背景，不要写实照片。",
    "画面要求：严格四个格子，不能多格，不能少格；每格左上角标注 1、2、3、4；每格最多 1-2 句中文，文字必须清晰可读。",
    `岗位名称：${portrait.job_name}`,
    `岗位分类：${portrait.category}`,
    `岗位描述：${detail.description}`,
    `学历/专业要求：${detail.educationRequirements.join("、")}`,
    `职业路径：${detail.careerPath.join(" -> ")}`,
    ...buildFrontendContextLines(context),
    ...buildScenarioLines(scenario),
    "岗位画像信息（只作为岗位难度和能力侧重点参考，不要画成能力雷达图）：",
    ...abilityLines,
    "四格固定剧情：",
    "第 1 格（接到真实任务）：主角看到任务卡、需求文档、客户反馈、数据看板或故障提醒；任务必须贴合该岗位真实场景，不要泛泛写“新任务来了”。小字：先搞懂：谁在用？问题在哪？完成标准是什么？",
    "第 2 格（动手完成核心工作）：展示主角在电脑、白板、测试台、数据平台或设计工具前完成该岗位最典型的 3 个具体动作；不要只写“架构设计、方案优化、业务赋能”。",
    "第 3 格（协作和排错）：展示主角与相关同事一起看白板、电脑、日志、原型、测试报告、客户问题单或数据图；人物标签必须来自协作对象建议。",
    "第 4 格（交付结果）：展示功能上线、报告交付、系统恢复、测试通过、客户验收、页面发布、模型生效或销售推进；结果必须具体可理解。",
    `底部总结条必须使用或贴近这句话：${scenario.summary}`,
    "通用禁止项：不要把所有岗位都画成程序员写代码；不要所有岗位都画代码屏幕；不要出现与岗位无关的技术词；技术词必须绑定具体动作，例如“Postman：测接口”“Figma：画原型”“Prometheus：看监控”。",
    "输出必须是一张完整漫画图片，不要生成说明文字、不要生成封面、不要生成 PDF。",
  ].join("\n");
}

function resolveBaoyuImagineScript(env: AppEnv): string {
  return (
    env.BAOYU_IMAGINE_SCRIPT ||
    path.join(os.homedir(), ".codex", "skills", "baoyu-imagine", "scripts", "main.ts")
  );
}

function resolveBunCommand(): { command: string; argsPrefix: string[] } {
  const bunCheck = spawnSync("bun", ["--version"], { stdio: "ignore" });
  if (bunCheck.status === 0) {
    return { command: "bun", argsPrefix: [] };
  }
  return { command: "npx", argsPrefix: ["-y", "bun"] };
}

function runBaoyuImagine(params: {
  env: AppEnv;
  prompt: string;
  imagePath: string;
  cwd: string;
}): Promise<void> {
  const scriptPath = resolveBaoyuImagineScript(params.env);
  if (!existsSync(scriptPath)) {
    throw new Error(`BAOYU_IMAGINE_SCRIPT_NOT_FOUND:${scriptPath}`);
  }

  const runtime = resolveBunCommand();
  const args = [
    ...runtime.argsPrefix,
    scriptPath,
    "--prompt",
    params.prompt,
    "--image",
    params.imagePath,
    "--ar",
    "4:3",
    "--quality",
    "normal",
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(runtime.command, args, {
      cwd: params.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`BAOYU_IMAGINE_TIMEOUT:${BAOYU_IMAGINE_TIMEOUT_MS}`));
    }, BAOYU_IMAGINE_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n").slice(0, 1000);
      reject(new Error(`BAOYU_IMAGINE_FAILED:${code}:${detail}`));
    });
  });
}

/**
 * 作用：调用 baoyu-imagine 为岗位画像生成并保存漫画图片。
 * 参数：portrait 为画像数据；env 提供输出目录和可选脚本路径；force 表示是否覆盖已存在图片。
 * 返回：本地静态资源 URL 与绝对路径。
 * 注意：MVP 采用同步等待，调用失败直接把错误抛给 HTTP 层。
 */
export async function generateJobPortraitComicImage(params: {
  portrait: ManualJobPortraitRecord;
  comicContext?: JobPortraitComicContext;
  env: AppEnv;
  force: boolean;
  cwd: string;
}): Promise<JobPortraitComicGenerationResult> {
  const asset = resolveJobPortraitComicAsset({
    jobName: params.portrait.job_name,
    env: params.env,
  });

  if (!params.force && asset.exists) {
    return { imagePath: asset.imagePath, imageUrl: asset.imageUrl };
  }

  await fs.mkdir(params.env.JOB_PICTURE_BOOK_OUTPUT_DIR, { recursive: true });
  await runBaoyuImagine({
    env: params.env,
    prompt: buildJobPortraitComicPrompt(params.portrait, params.comicContext),
    imagePath: asset.imagePath,
    cwd: params.cwd,
  });

  return { imagePath: asset.imagePath, imageUrl: asset.imageUrl };
}

type ComicBookPageScene = {
  label: string;
  promptBuilder: (portrait: ManualJobPortraitRecord, scenario: JobComicScenario) => string;
  narrationBuilder: (portrait: ManualJobPortraitRecord, scenario: JobComicScenario) => string;
};

const COMIC_BOOK_PAGES: ComicBookPageScene[] = [
  {
    label: "岗位概览",
    promptBuilder: (portrait, scenario) =>
      [
        `请生成一张中文职业科普插图，主题是"${portrait.job_name}是做什么的？"。`,
        "目标读者：大学生、转专业学生、准备找实习的同学。",
        "整体风格：简洁黑白线稿、清晰黑色描边、白色背景，只用少量蓝色作为强调色。",
        "画面内容：一位主角站在工作场景入口处，周围漂浮着该岗位最典型的 2-3 个工具或符号。",
        `岗位名称：${portrait.job_name}`,
        `岗位分类：${portrait.category}`,
        `核心技能：${portrait.profile_detail.skills.slice(0, 4).join("、")}`,
        "底部文字标注岗位名称和一句话简介。",
        `简介建议：${scenario.summary}`,
        "禁止：不要画成程序员写代码的通用画面；不要出现复杂背景。",
        "输出必须是一张完整插图，不要生成说明文字。",
      ].join("\n"),
    narrationBuilder: (portrait, scenario) =>
      [
        `${portrait.job_name}，${scenario.summary}`,
        `这个岗位主要需要掌握${portrait.profile_detail.skills.slice(0, 3).join("、")}等技能。`,
        portrait.profile_detail.educationRequirements.length > 0
          ? `学历方面，通常要求${portrait.profile_detail.educationRequirements.join("、")}。`
          : "",
        `接下来，让我们一起看看${portrait.job_name}每天的工作是什么样的吧。`,
      ]
        .filter(Boolean)
        .join(""),
  },
  {
    label: "日常核心工作",
    promptBuilder: (portrait, scenario) =>
      [
        `请生成一张中文职业科普插图，主题是"${portrait.job_name}的日常核心工作"。`,
        "整体风格：简洁黑白线稿、清晰黑色描边、白色背景，只用少量蓝色作为强调色。",
        "画面内容：主角正在专注完成该岗位最典型的 3 个具体动作，每个动作配一个小标签。",
        `典型任务：${scenario.taskExamples.join("、")}`,
        `核心动作：${scenario.coreActions.join("、")}`,
        `使用的技能：${portrait.profile_detail.skills.slice(0, 5).join("、")}`,
        "禁止：不要只写'架构设计、方案优化、业务赋能'这类空泛词汇；每个动作必须具体。",
        "输出必须是一张完整插图，不要生成说明文字。",
      ].join("\n"),
    narrationBuilder: (portrait, scenario) =>
      [
        `${portrait.job_name}的日常工作包括${scenario.coreActions.join("、")}等。`,
        `比如，${scenario.taskExamples[0]}的时候，就需要用到${portrait.profile_detail.skills.slice(0, 2).join("和")}。`,
        scenario.taskExamples.length > 1 ? `还可能遇到${scenario.taskExamples[1]}这样的任务。` : "",
      ]
        .filter(Boolean)
        .join(""),
  },
  {
    label: "协作与排错",
    promptBuilder: (portrait, scenario) =>
      [
        `请生成一张中文职业科普插图，主题是"${portrait.job_name}的协作与排错"。`,
        "整体风格：简洁黑白线稿、清晰黑色描边、白色背景，只用少量蓝色作为强调色。",
        "画面内容：主角和 2-3 位同事围在一起讨论问题，桌上有白板、日志或原型图。",
        `协作对象：${scenario.collaborators.join("、")}`,
        `使用的技能：${portrait.profile_detail.skills.slice(0, 3).join("、")}`,
        `软技能：${portrait.profile_detail.softSkills.slice(0, 3).join("、")}`,
        "每个协作对象旁边标注角色名。",
        "禁止：不要所有人都看着电脑屏幕；要体现沟通和讨论的场景。",
        "输出必须是一张完整插图，不要生成说明文字。",
      ].join("\n"),
    narrationBuilder: (portrait, scenario) =>
      [
        `在工作中，${portrait.job_name}不是一个人在战斗。`,
        `通常需要和${scenario.collaborators.slice(0, 3).join("、")}紧密配合。`,
        `遇到问题时，${portrait.profile_detail.softSkills[0] ?? "良好的沟通能力"}和${portrait.profile_detail.softSkills[1] ?? "学习能力"}就特别重要了。`,
        `大家一起排查问题、对齐方案，最终把事情搞定。`,
      ].join(""),
  },
  {
    label: "交付与成长",
    promptBuilder: (portrait, scenario) =>
      [
        `请生成一张中文职业科普插图，主题是"${portrait.job_name}的交付与成长"。`,
        "整体风格：简洁黑白线稿、清晰黑色描边、白色背景，只用少量蓝色作为强调色。",
        "画面内容：左半边展示该岗位的典型交付成果，右半边用台阶或上升箭头展示成长路径。",
        `交付成果：${scenario.resultExamples.join("、")}`,
        `职业路径：${portrait.profile_detail.careerPath.join(" → ")}`,
        `学习能力要求：${portrait.profile_detail.learningAbility}，创新能力：${portrait.profile_detail.innovationAbility}`,
        "台阶上标注每个阶段对应的岗位级别。",
        "禁止：不要画成考试或证书场景；要体现实际工作中的成长。",
        "输出必须是一张完整插图，不要生成说明文字。",
      ].join("\n"),
    narrationBuilder: (portrait, scenario) =>
      [
        `当${portrait.job_name}把任务完成后，最终能看到${scenario.resultExamples[0] ?? "具体的交付成果"}。`,
        `随着经验积累，可以从${portrait.profile_detail.careerPath[0] ?? portrait.job_name}成长为${portrait.profile_detail.careerPath[portrait.profile_detail.careerPath.length - 1] ?? "更高级的专家"}。`,
        `这个岗位的学习能力要求是${portrait.profile_detail.learningAbility}，抗压能力${portrait.profile_detail.stressResistance}。`,
        `只要持续学习和实践，${portrait.job_name}是一个非常有发展空间的职业方向！`,
      ].join(""),
  },
];

export function buildComicBookPagePrompts(
  portrait: ManualJobPortraitRecord,
  context?: JobPortraitComicContext,
): string[] {
  const scenario = resolveJobComicScenario(portrait, context);
  return COMIC_BOOK_PAGES.map((page) => page.promptBuilder(portrait, scenario));
}

export function buildComicBookNarrations(
  portrait: ManualJobPortraitRecord,
  context?: JobPortraitComicContext,
): string[] {
  const scenario = resolveJobComicScenario(portrait, context);
  return COMIC_BOOK_PAGES.map((page) => page.narrationBuilder(portrait, scenario));
}

export type ComicBookAssetDir = {
  dirPath: string;
  baseUrl: string;
  fileStem: string;
};

export function resolveComicBookAssetDir(params: {
  jobName: string;
  env: AppEnv;
}): ComicBookAssetDir {
  const fileStem = toJobPortraitComicFileStem(params.jobName);
  const dirPath = path.join(params.env.JOB_PICTURE_BOOK_OUTPUT_DIR, fileStem);
  return {
    dirPath,
    baseUrl: `/assets/job-comics/${fileStem}`,
    fileStem,
  };
}

export async function generateComicBook(params: {
  portrait: ManualJobPortraitRecord;
  comicContext?: JobPortraitComicContext;
  env: AppEnv;
  force: boolean;
  cwd: string;
  ttsEngine: TtsEngine;
}): Promise<ComicBook> {
  const { portrait, env, force, ttsEngine } = params;
  const assetDir = resolveComicBookAssetDir({ jobName: portrait.job_name, env });
  const prompts = buildComicBookPagePrompts(portrait, params.comicContext);
  const narrations = buildComicBookNarrations(portrait, params.comicContext);
  const pages: ComicBookPage[] = [];

  await fs.mkdir(assetDir.dirPath, { recursive: true });

  for (let i = 0; i < prompts.length; i++) {
    const imageFileName = `page-${i}.png`;
    const audioFileName = `page-${i}.${ttsEngine.audioFileExtension}`;
    const imagePath = path.join(assetDir.dirPath, imageFileName);
    const audioPath = path.join(assetDir.dirPath, audioFileName);

    if (!force && existsSync(imagePath) && existsSync(audioPath)) {
      const audioStat = await fs.stat(audioPath);
      const durationMs = Math.round((audioStat.size * 8 * 1000) / 48000);
      pages.push({
        page_index: i,
        image_url: `${assetDir.baseUrl}/${imageFileName}`,
        narration_text: narrations[i]!,
        audio_url: `${assetDir.baseUrl}/${audioFileName}`,
        audio_duration_ms: durationMs,
      });
      continue;
    }

    if (!existsSync(imagePath)) {
      await runBaoyuImagine({
        env,
        prompt: prompts[i]!,
        imagePath,
        cwd: params.cwd,
      });
    }

    let ttsResult;
    try {
      ttsResult = await ttsEngine.synthesize({
        text: narrations[i]!,
        outputPath: audioPath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`TTS_SYNTHESIS_FAILED:page=${i}:${message}`);
    }

    pages.push({
      page_index: i,
      image_url: `${assetDir.baseUrl}/${imageFileName}`,
      narration_text: narrations[i]!,
      audio_url: `${assetDir.baseUrl}/${audioFileName}`,
      audio_duration_ms: ttsResult.durationMs,
    });
  }

  const bookData: ComicBook = {
    job_name: portrait.job_name,
    title: `${portrait.job_name}每天在做什么？`,
    pages,
    total_pages: pages.length,
  };

  await fs.writeFile(path.join(assetDir.dirPath, "book.json"), JSON.stringify(bookData, null, 2));

  return bookData;
}
