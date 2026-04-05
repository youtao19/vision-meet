/**
 * 文件作用：将约定的 10 条岗位画像写入 PostgreSQL，供前端岗位画像中心直接展示。
 * 使用方式：npm run job-portraits:seed -w career-backend
 */

import type { ManualJobPortraitRecord } from "@career/contracts/types";

import { createPgJobsIntelligenceRepository } from "../modules/jobs-intelligence/jobs-intelligence.repository.pg.js";
import { appEnv } from "../shared/config/env.js";
import { createAppPgPool } from "../shared/db/postgres.js";

const MANUAL_JOB_PORTRAITS: Array<Omit<ManualJobPortraitRecord, "created_at" | "updated_at">> = [
  {
    job_name: "前端开发工程师",
    category: "software",
    skills: {
      level: 4,
      weight: 0.3,
      description:
        "掌握HTML/CSS/JavaScript，熟悉Vue或React框架，具备组件化开发、工程化能力及接口联调经验",
    },
    certification: {
      level: 3,
      weight: 0.1,
      description: "计算机相关专业本科及以上学历",
    },
    innovation: {
      level: 4,
      weight: 0.15,
      description: "能够优化用户交互体验，提升页面性能与可用性",
    },
    learning: {
      level: 4,
      weight: 0.15,
      description: "持续学习前端新技术与工程化方案",
    },
    stress: {
      level: 4,
      weight: 0.1,
      description: "适应多需求并行与紧张交付周期",
    },
    communication: {
      level: 4,
      weight: 0.1,
      description: "与产品、设计、后端协同开发",
    },
    experience: {
      level: 3,
      weight: 0.1,
      description: "至少1个完整项目经验",
    },
  },
  {
    job_name: "实施工程师",
    category: "implementation",
    skills: {
      level: 4,
      weight: 0.3,
      description: "熟练GIS软件与数据库，具备系统部署、数据处理与实施能力",
    },
    certification: {
      level: 3,
      weight: 0.1,
      description: "相关专业本科及以上学历",
    },
    innovation: {
      level: 3,
      weight: 0.15,
      description: "能针对客户场景优化实施方案",
    },
    learning: {
      level: 4,
      weight: 0.15,
      description: "快速掌握业务系统与行业知识",
    },
    stress: {
      level: 5,
      weight: 0.1,
      description: "适应长期出差与驻场工作",
    },
    communication: {
      level: 4,
      weight: 0.1,
      description: "客户培训与技术沟通能力强",
    },
    experience: {
      level: 3,
      weight: 0.1,
      description: "具备实施或数据处理经验优先",
    },
  },
  {
    job_name: "科研人员（建筑材料）",
    category: "research",
    skills: {
      level: 5,
      weight: 0.3,
      description: "掌握混凝土材料与耐久性设计，具备实验与数据分析能力",
    },
    certification: {
      level: 5,
      weight: 0.1,
      description: "博士学历优先",
    },
    innovation: {
      level: 5,
      weight: 0.2,
      description: "独立开展科研课题并推动成果转化",
    },
    learning: {
      level: 5,
      weight: 0.1,
      description: "持续跟踪前沿技术",
    },
    stress: {
      level: 4,
      weight: 0.1,
      description: "科研周期长、任务复杂",
    },
    communication: {
      level: 4,
      weight: 0.1,
      description: "科研协作与项目申报能力",
    },
    experience: {
      level: 5,
      weight: 0.1,
      description: "具备科研项目经验",
    },
  },
  {
    job_name: "Java开发工程师",
    category: "software",
    skills: {
      level: 4,
      weight: 0.3,
      description: "掌握Java及至少一门语言，熟悉数据库及系统开发",
    },
    certification: {
      level: 3,
      weight: 0.1,
      description: "专科及以上学历，日语N3优先",
    },
    innovation: {
      level: 4,
      weight: 0.15,
      description: "具备系统设计与逻辑优化能力",
    },
    learning: {
      level: 4,
      weight: 0.15,
      description: "适应跨语言与海外开发模式",
    },
    stress: {
      level: 5,
      weight: 0.1,
      description: "海外工作压力与高强度任务",
    },
    communication: {
      level: 4,
      weight: 0.1,
      description: "中日团队沟通能力",
    },
    experience: {
      level: 4,
      weight: 0.1,
      description: "3年以上开发经验",
    },
  },
  {
    job_name: "软件测试工程师",
    category: "software",
    skills: {
      level: 4,
      weight: 0.3,
      description: "掌握功能测试、接口测试与测试流程",
    },
    certification: {
      level: 3,
      weight: 0.1,
      description: "本科及以上学历",
    },
    innovation: {
      level: 4,
      weight: 0.15,
      description: "具备测试用例设计与缺陷挖掘能力",
    },
    learning: {
      level: 4,
      weight: 0.15,
      description: "学习业务逻辑与测试方法",
    },
    stress: {
      level: 5,
      weight: 0.1,
      description: "驻场测试与版本压力",
    },
    communication: {
      level: 4,
      weight: 0.1,
      description: "开发与客户沟通",
    },
    experience: {
      level: 3,
      weight: 0.1,
      description: "支持应届生或有经验优先",
    },
  },
  {
    job_name: "后端开发工程师",
    category: "software",
    skills: {
      level: 4,
      weight: 0.3,
      description: "掌握Java/Python/Go，熟悉Web框架与数据库设计",
    },
    certification: {
      level: 2,
      weight: 0.1,
      description: "无强制要求",
    },
    innovation: {
      level: 4,
      weight: 0.15,
      description: "系统架构设计与性能优化能力",
    },
    learning: {
      level: 4,
      weight: 0.15,
      description: "快速学习新框架与技术",
    },
    stress: {
      level: 4,
      weight: 0.1,
      description: "需求频繁变更与上线压力",
    },
    communication: {
      level: 4,
      weight: 0.1,
      description: "与前端及产品协作",
    },
    experience: {
      level: 3,
      weight: 0.1,
      description: "至少一个完整后端项目",
    },
  },
  {
    job_name: "数据分析师",
    category: "data",
    skills: {
      level: 4,
      weight: 0.3,
      description: "熟练SQL、Python及数据可视化工具",
    },
    certification: {
      level: 2,
      weight: 0.1,
      description: "数据分析证书加分",
    },
    innovation: {
      level: 4,
      weight: 0.2,
      description: "通过数据发现业务问题",
    },
    learning: {
      level: 4,
      weight: 0.1,
      description: "快速理解业务逻辑",
    },
    stress: {
      level: 3,
      weight: 0.1,
      description: "处理大规模数据",
    },
    communication: {
      level: 4,
      weight: 0.1,
      description: "清晰表达数据结论",
    },
    experience: {
      level: 3,
      weight: 0.1,
      description: "具备数据分析项目经验",
    },
  },
  {
    job_name: "算法工程师",
    category: "ai",
    skills: {
      level: 5,
      weight: 0.3,
      description: "掌握机器学习与深度学习框架",
    },
    certification: {
      level: 2,
      weight: 0.1,
      description: "论文或竞赛更重要",
    },
    innovation: {
      level: 5,
      weight: 0.2,
      description: "模型优化与算法创新能力",
    },
    learning: {
      level: 5,
      weight: 0.1,
      description: "持续跟进前沿论文",
    },
    stress: {
      level: 4,
      weight: 0.1,
      description: "实验迭代频繁",
    },
    communication: {
      level: 3,
      weight: 0.1,
      description: "解释模型效果",
    },
    experience: {
      level: 4,
      weight: 0.1,
      description: "有模型项目或竞赛经验",
    },
  },
  {
    job_name: "DevOps工程师",
    category: "ops",
    skills: {
      level: 4,
      weight: 0.3,
      description: "掌握Linux、Docker、CI/CD",
    },
    certification: {
      level: 3,
      weight: 0.1,
      description: "云厂商认证加分",
    },
    innovation: {
      level: 4,
      weight: 0.15,
      description: "自动化运维与部署方案",
    },
    learning: {
      level: 4,
      weight: 0.15,
      description: "持续学习新工具",
    },
    stress: {
      level: 5,
      weight: 0.1,
      description: "线上故障处理压力",
    },
    communication: {
      level: 4,
      weight: 0.1,
      description: "与开发协作排障",
    },
    experience: {
      level: 3,
      weight: 0.1,
      description: "有部署项目经验",
    },
  },
  {
    job_name: "产品经理",
    category: "product",
    skills: {
      level: 4,
      weight: 0.25,
      description: "需求分析与原型设计能力",
    },
    certification: {
      level: 2,
      weight: 0.1,
      description: "无强制要求",
    },
    innovation: {
      level: 5,
      weight: 0.2,
      description: "用户洞察与产品设计能力",
    },
    learning: {
      level: 4,
      weight: 0.1,
      description: "快速理解业务",
    },
    stress: {
      level: 4,
      weight: 0.1,
      description: "多需求并行",
    },
    communication: {
      level: 5,
      weight: 0.15,
      description: "跨团队沟通核心角色",
    },
    experience: {
      level: 3,
      weight: 0.1,
      description: "产品项目或实习经验",
    },
  },
];

async function main(): Promise<void> {
  const pool = createAppPgPool({
    host: appEnv.PGHOST,
    port: appEnv.PGPORT,
    database: appEnv.PGDATABASE,
    user: appEnv.PGUSER,
    password: appEnv.PGPASSWORD,
  });
  const repository = createPgJobsIntelligenceRepository(pool);

  try {
    if (typeof repository.replaceManualJobPortraits !== "function") {
      throw new Error("当前仓储未实现 replaceManualJobPortraits");
    }
    await repository.replaceManualJobPortraits(MANUAL_JOB_PORTRAITS);
    // eslint-disable-next-line no-console
    console.log(`[job-portraits:seed] seeded=${MANUAL_JOB_PORTRAITS.length}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[job-portraits:seed] failed", error);
  process.exitCode = 1;
});
