/**
 * 文件作用：沉淀首批“规范岗位图谱”的种子数据与标题归一规则。
 * 设计原因：首轮图谱以稳定可演示为目标，优先使用人工维护的岗位族和关系边，
 * 避免直接从原始岗位标题自动建图导致结构抖动或解释不一致。
 */

import type { CareerPathRelationType, CareerPathTransitionCost } from "@career/contracts/types";

export type CanonicalCareerRole = {
  key: string;
  title: string;
  description: string;
  family: string;
  level: number;
  aliases: string[];
  typical_skills: string[];
};

export type CanonicalCareerEdge = {
  route_key: string;
  source: string;
  target: string;
  relation_type: CareerPathRelationType;
  reason: string;
  required_skills: string[];
  transition_cost: CareerPathTransitionCost;
  direction_label: string;
};

export const CANONICAL_CAREER_ROLES: CanonicalCareerRole[] = [
  {
    key: "frontend-engineer",
    title: "前端工程师",
    description: "负责 Web 与交互界面开发，强调组件化、可用性和接口协同能力。",
    family: "engineering",
    level: 1,
    aliases: ["前端开发", "前端开发工程师", "web前端", "vue开发", "react开发", "前端工程师"],
    typical_skills: ["Vue", "React", "TypeScript", "CSS", "接口联调"],
  },
  {
    key: "backend-engineer",
    title: "后端工程师",
    description: "负责服务端业务逻辑、接口设计、存储和稳定性建设。",
    family: "engineering",
    level: 1,
    aliases: [
      "后端开发",
      "后端开发工程师",
      "java",
      "java开发",
      "golang开发",
      "python开发",
      "c/c++",
      "后端工程师",
    ],
    typical_skills: ["Java", "Python", "SQL", "Redis", "系统设计"],
  },
  {
    key: "fullstack-engineer",
    title: "全栈工程师",
    description: "同时承担前后端设计与交付，适合作为应用研发路线的进阶岗位。",
    family: "engineering",
    level: 2,
    aliases: ["全栈工程师", "全栈开发", "fullstack"],
    typical_skills: ["TypeScript", "Node.js", "数据库设计", "前后端协作", "系统建模"],
  },
  {
    key: "qa-engineer",
    title: "测试工程师",
    description: "负责质量保障、测试设计、自动化验证和发布风险控制。",
    family: "quality",
    level: 1,
    aliases: ["测试工程师", "软件测试", "测试开发", "qa", "硬件测试"],
    typical_skills: ["测试设计", "自动化测试", "缺陷分析", "接口测试", "质量度量"],
  },
  {
    key: "algorithm-engineer",
    title: "算法工程师",
    description: "负责模型训练、算法优化和智能能力落地，是 AI/数据方向的核心岗位。",
    family: "data-ai",
    level: 1,
    aliases: ["算法工程师", "科研人员", "机器学习工程师", "ai工程师", "算法研究员"],
    typical_skills: ["Python", "机器学习", "深度学习", "特征工程", "模型评估"],
  },
  {
    key: "data-engineer",
    title: "数据工程师",
    description: "负责数据链路建设、ETL、数据建模和分析基础设施搭建。",
    family: "data-ai",
    level: 1,
    aliases: ["数据工程师", "数据开发", "etl工程师", "大数据工程师", "数据平台工程师"],
    typical_skills: ["SQL", "ETL", "数据仓库", "Python", "调度编排"],
  },
  {
    key: "devops-engineer",
    title: "DevOps工程师",
    description: "负责部署流水线、云原生平台、稳定性和研发效率体系建设。",
    family: "platform",
    level: 1,
    aliases: ["运维工程师", "devops", "sre", "云平台工程师", "运维开发"],
    typical_skills: ["Linux", "Docker", "Kubernetes", "CI/CD", "监控告警"],
  },
  {
    key: "technical-support-engineer",
    title: "技术支持工程师",
    description: "负责售前/售后技术支持、问题定位和客户成功协同。",
    family: "delivery",
    level: 1,
    aliases: ["技术支持工程师", "售前技术支持", "售后技术支持", "客户支持工程师"],
    typical_skills: ["问题定位", "沟通表达", "文档输出", "产品理解", "现场支持"],
  },
  {
    key: "implementation-engineer",
    title: "实施工程师",
    description: "负责项目交付、系统实施、上线联调和客户培训，是交付路线核心岗位。",
    family: "delivery",
    level: 1,
    aliases: ["实施工程师", "交付工程师", "实施顾问"],
    typical_skills: ["项目实施", "客户沟通", "需求梳理", "系统配置", "上线支持"],
  },
  {
    key: "product-manager",
    title: "产品经理",
    description: "负责业务分析、需求定义、跨团队协同和产品迭代规划。",
    family: "product",
    level: 2,
    aliases: ["产品经理", "产品专员", "需求分析师"],
    typical_skills: ["需求分析", "原型设计", "业务抽象", "沟通协同", "数据分析"],
  },
  {
    key: "project-manager",
    title: "项目经理",
    description: "负责交付节奏、资源协调、风险管理和阶段性里程碑推进。",
    family: "management",
    level: 2,
    aliases: ["项目经理", "交付经理", "pm"],
    typical_skills: ["项目管理", "风险控制", "跨团队协同", "进度管理", "需求推进"],
  },
  {
    key: "solution-architect",
    title: "解决方案架构师",
    description: "负责复杂系统方案设计、跨域能力整合和高阶技术路线制定。",
    family: "architecture",
    level: 3,
    aliases: ["解决方案架构师", "架构师", "技术架构师", "方案架构师"],
    typical_skills: ["系统设计", "跨域架构", "技术选型", "业务抽象", "方案沟通"],
  },
];

export const CANONICAL_CAREER_EDGES: CanonicalCareerEdge[] = [
  {
    route_key: "promotion-frontend-fullstack",
    source: "frontend-engineer",
    target: "fullstack-engineer",
    relation_type: "promotion",
    reason: "前端工程师向全栈发展时，通常会补齐服务端和数据建模能力。",
    required_skills: ["Node.js", "数据库设计", "接口设计"],
    transition_cost: "medium",
    direction_label: "晋升",
  },
  {
    route_key: "promotion-backend-fullstack",
    source: "backend-engineer",
    target: "fullstack-engineer",
    relation_type: "promotion",
    reason: "后端工程师补齐交互和应用编排能力后，可承担全链路研发职责。",
    required_skills: ["TypeScript", "前端工程化", "交互设计理解"],
    transition_cost: "medium",
    direction_label: "晋升",
  },
  {
    route_key: "promotion-fullstack-architect",
    source: "fullstack-engineer",
    target: "solution-architect",
    relation_type: "promotion",
    reason: "具备全链路研发视角后，更容易沉淀为解决方案和架构设计能力。",
    required_skills: ["系统设计", "技术选型", "业务抽象"],
    transition_cost: "medium",
    direction_label: "晋升",
  },
  {
    route_key: "promotion-algorithm-architect",
    source: "algorithm-engineer",
    target: "solution-architect",
    relation_type: "promotion",
    reason: "算法岗位向方案设计演进时，需要把模型能力扩展到完整业务闭环。",
    required_skills: ["系统设计", "业务理解", "模型工程化"],
    transition_cost: "high",
    direction_label: "晋升",
  },
  {
    route_key: "promotion-data-architect",
    source: "data-engineer",
    target: "solution-architect",
    relation_type: "promotion",
    reason: "数据工程积累到一定阶段后，可向企业级数据与平台架构扩展。",
    required_skills: ["架构设计", "平台治理", "跨团队协同"],
    transition_cost: "medium",
    direction_label: "晋升",
  },
  {
    route_key: "promotion-devops-architect",
    source: "devops-engineer",
    target: "solution-architect",
    relation_type: "promotion",
    reason: "DevOps 工程师具备平台视角后，可继续承担整体交付架构设计职责。",
    required_skills: ["系统设计", "可靠性治理", "平台规划"],
    transition_cost: "medium",
    direction_label: "晋升",
  },
  {
    route_key: "promotion-implementation-project",
    source: "implementation-engineer",
    target: "project-manager",
    relation_type: "promotion",
    reason: "实施工程师长期贴近客户交付，适合向项目推进和资源协调升级。",
    required_skills: ["项目管理", "风险识别", "里程碑管理"],
    transition_cost: "medium",
    direction_label: "晋升",
  },
  {
    route_key: "promotion-support-project",
    source: "technical-support-engineer",
    target: "project-manager",
    relation_type: "promotion",
    reason: "技术支持积累了大量客户问题处理经验，适合进一步承担交付协调职责。",
    required_skills: ["项目推进", "跨团队沟通", "风险协调"],
    transition_cost: "medium",
    direction_label: "晋升",
  },
  {
    route_key: "promotion-product-project",
    source: "product-manager",
    target: "project-manager",
    relation_type: "promotion",
    reason: "产品岗位在需求与资源统筹能力成熟后，可承担更广的项目管理责任。",
    required_skills: ["资源协调", "项目计划", "风险控制"],
    transition_cost: "medium",
    direction_label: "晋升",
  },
  {
    route_key: "transition-frontend-qa",
    source: "frontend-engineer",
    target: "qa-engineer",
    relation_type: "transition",
    reason: "熟悉界面和交互实现的研发同学，转测时更容易定位缺陷和设计用例。",
    required_skills: ["测试设计", "自动化测试"],
    transition_cost: "low",
    direction_label: "转岗",
  },
  {
    route_key: "transition-frontend-product",
    source: "frontend-engineer",
    target: "product-manager",
    relation_type: "transition",
    reason: "长期参与交互落地的前端同学，对用户体验和需求拆解有天然优势。",
    required_skills: ["需求分析", "原型设计", "业务表达"],
    transition_cost: "medium",
    direction_label: "转岗",
  },
  {
    route_key: "transition-backend-data",
    source: "backend-engineer",
    target: "data-engineer",
    relation_type: "transition",
    reason: "后端工程师通常具备数据库和数据链路基础，可扩展到数据平台建设。",
    required_skills: ["ETL", "数据建模", "调度编排"],
    transition_cost: "medium",
    direction_label: "转岗",
  },
  {
    route_key: "transition-backend-devops",
    source: "backend-engineer",
    target: "devops-engineer",
    relation_type: "transition",
    reason: "后端研发对运行环境和部署流程熟悉，向平台侧迁移成本相对可控。",
    required_skills: ["Docker", "Kubernetes", "CI/CD"],
    transition_cost: "medium",
    direction_label: "转岗",
  },
  {
    route_key: "transition-qa-implementation",
    source: "qa-engineer",
    target: "implementation-engineer",
    relation_type: "transition",
    reason: "测试工程师对系统流程和异常场景理解充分，适合转向实施交付。",
    required_skills: ["客户沟通", "上线支持"],
    transition_cost: "low",
    direction_label: "转岗",
  },
  {
    route_key: "transition-qa-product",
    source: "qa-engineer",
    target: "product-manager",
    relation_type: "transition",
    reason: "质量岗位对需求边界敏感，转产品时容易补强验收和需求质量能力。",
    required_skills: ["需求分析", "原型设计", "跨团队沟通"],
    transition_cost: "medium",
    direction_label: "转岗",
  },
  {
    route_key: "transition-algorithm-data",
    source: "algorithm-engineer",
    target: "data-engineer",
    relation_type: "transition",
    reason: "算法岗位转数据工程时，可把建模经验沉淀到特征和数据资产建设中。",
    required_skills: ["ETL", "数据仓库", "数据治理"],
    transition_cost: "medium",
    direction_label: "转岗",
  },
  {
    route_key: "transition-algorithm-backend",
    source: "algorithm-engineer",
    target: "backend-engineer",
    relation_type: "transition",
    reason: "算法能力工程化落地后，可进一步承担服务化和平台化开发职责。",
    required_skills: ["接口设计", "工程化实践", "数据库设计"],
    transition_cost: "high",
    direction_label: "转岗",
  },
  {
    route_key: "transition-data-backend",
    source: "data-engineer",
    target: "backend-engineer",
    relation_type: "transition",
    reason: "熟悉数据链路的工程师转后端时，更容易处理复杂数据与性能问题。",
    required_skills: ["业务建模", "接口开发", "缓存设计"],
    transition_cost: "medium",
    direction_label: "转岗",
  },
  {
    route_key: "transition-data-algorithm",
    source: "data-engineer",
    target: "algorithm-engineer",
    relation_type: "transition",
    reason: "数据岗位积累了高质量数据基础后，可向建模与智能分析演进。",
    required_skills: ["机器学习", "模型评估", "特征工程"],
    transition_cost: "medium",
    direction_label: "转岗",
  },
  {
    route_key: "transition-support-implementation",
    source: "technical-support-engineer",
    target: "implementation-engineer",
    relation_type: "transition",
    reason: "技术支持对客户现场问题和产品配置已经熟悉，转实施路径最短。",
    required_skills: ["项目实施", "系统配置"],
    transition_cost: "low",
    direction_label: "转岗",
  },
  {
    route_key: "transition-support-product",
    source: "technical-support-engineer",
    target: "product-manager",
    relation_type: "transition",
    reason: "一线问题反馈有助于沉淀真实需求，适合作为转产品的业务输入。",
    required_skills: ["需求分析", "文档输出", "业务抽象"],
    transition_cost: "medium",
    direction_label: "转岗",
  },
  {
    route_key: "transition-implementation-support",
    source: "implementation-engineer",
    target: "technical-support-engineer",
    relation_type: "transition",
    reason: "实施岗位对系统上线和客户使用场景熟悉，可快速切换到支持体系。",
    required_skills: ["问题定位", "客户沟通"],
    transition_cost: "low",
    direction_label: "转岗",
  },
  {
    route_key: "transition-implementation-qa",
    source: "implementation-engineer",
    target: "qa-engineer",
    relation_type: "transition",
    reason: "实施过程中积累的大量异常场景，可帮助测试岗位提升场景覆盖度。",
    required_skills: ["测试设计", "自动化思维"],
    transition_cost: "medium",
    direction_label: "转岗",
  },
  {
    route_key: "transition-devops-backend",
    source: "devops-engineer",
    target: "backend-engineer",
    relation_type: "transition",
    reason: "平台工程师熟悉运行环境与稳定性约束，回到业务研发时更具全局视角。",
    required_skills: ["业务开发", "接口设计", "领域建模"],
    transition_cost: "medium",
    direction_label: "转岗",
  },
  {
    route_key: "transition-devops-implementation",
    source: "devops-engineer",
    target: "implementation-engineer",
    relation_type: "transition",
    reason: "熟悉部署和运行环境的同学，在项目交付与上线保障场景中适配度较高。",
    required_skills: ["客户现场支持", "部署方案说明"],
    transition_cost: "medium",
    direction_label: "转岗",
  },
];

const roleByKey = new Map(CANONICAL_CAREER_ROLES.map((role) => [role.key, role]));

function normalizeTitleToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * 作用：把原始岗位标题归一到首批规范岗位。
 * 参数：title 为导入岗位或查询岗位的原始标题。
 * 返回：命中的规范岗位；若无法稳定命中，则返回 null。
 * 注意：这里优先保证可解释性，不做高风险模糊匹配。
 */
export function resolveCanonicalCareerRoleByTitle(title: string): CanonicalCareerRole | null {
  const normalizedTitle = normalizeTitleToken(title);
  let bestMatch: { role: CanonicalCareerRole; score: number } | null = null;

  for (const role of CANONICAL_CAREER_ROLES) {
    for (const alias of role.aliases) {
      const normalizedAlias = normalizeTitleToken(alias);
      if (!normalizedAlias) {
        continue;
      }

      const hit =
        normalizedTitle.includes(normalizedAlias) || normalizedAlias.includes(normalizedTitle);

      if (!hit) {
        continue;
      }

      const score = normalizedAlias.length;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { role, score };
      }
    }
  }

  return bestMatch?.role ?? null;
}

export function getCanonicalCareerRole(key: string): CanonicalCareerRole | null {
  return roleByKey.get(key) ?? null;
}

export function getOutgoingCareerEdges(
  roleKey: string,
  relationType?: CareerPathRelationType,
): CanonicalCareerEdge[] {
  return CANONICAL_CAREER_EDGES.filter((edge) => {
    return edge.source === roleKey && (!relationType || edge.relation_type === relationType);
  });
}
