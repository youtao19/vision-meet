/**
 * 文件作用：验证学生画像 service 的表单创建、缺失项计算和经历字段兼容逻辑。
 * 边界说明：测试使用内存仓储替身，只覆盖 service 业务规则，不连接真实数据库或 Pi Agent。
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { StudentProfileRecord } from "@career/contracts/types";

import type { ProfileRepository } from "../profile.repository.js";
import { createProfileService } from "../profile.service.js";

/**
 * 创建内存版画像仓储。
 * 逻辑：用数组模拟列表、按 ID 查询和创建行为，让测试专注验证 service 的归一化与评分结果。
 */
function createProfileRepositoryStub(): ProfileRepository {
  let nextId = 1;
  const items: StudentProfileRecord[] = [];

  return {
    async listStudentProfiles() {
      return {
        total: items.length,
        items,
      };
    },
    async getStudentProfileById(profileId) {
      return items.find((item) => item.id === profileId) ?? null;
    },
    async createStudentProfile(input) {
      const record: StudentProfileRecord = {
        ...input,
        id: nextId++,
        created_at: new Date().toISOString(),
      };
      items.unshift(record);
      return record;
    },
  };
}

/**
 * 验证完整表单画像创建。
 * 逻辑：输入教育、技能、证书、项目和自评后，断言核心字段被保留且 parser 标记为 manual。
 */
test("createProfile: 表单录入应生成结构化学生画像", async () => {
  const service = createProfileService(createProfileRepositoryStub());

  const created = await service.createProfile({
    basic_info: { name: "张三" },
    preference: {
      target_role: "后端开发工程师",
      preferred_cities: ["苏州"],
      preferred_industries: ["互联网"],
    },
    education: {
      school: "示例大学",
      level: "本科",
      major: "软件工程",
      graduation_year: 2026,
      evidence_refs: [],
    },
    skills: [
      {
        name: "Java",
        category: "backend",
        level: 4,
        evidence_refs: [],
      },
    ],
    certificates: [
      {
        name: "英语六级",
        issuer: null,
        acquired_at: null,
        evidence_refs: [],
      },
    ],
    experiences: [
      {
        kind: "project",
        title: "招聘推荐系统",
        organization: null,
        role: "后端开发",
        period: "2025",
        tech_stack: ["Node.js", "PostgreSQL"],
        responsibilities: ["实现画像接口"],
        outcomes: ["完成端到端联调"],
        evidence_refs: [],
      },
    ],
    self_assessment: {
      communication: 4,
      learning: 5,
      stress_tolerance: 4,
      innovation: 4,
    },
    summary: "具备后端项目经验。",
  });

  assert.equal(created.basic_info.name, "张三");
  assert.equal(created.preference.target_role, "后端开发工程师");
  assert.equal(created.skills[0]?.name, "Java");
  assert.equal(created.experiences[0]?.title, "招聘推荐系统");
  assert.equal(created.parse_meta.parser, "manual");
  assert.ok(created.evaluation.completeness_score > 80);
});

/**
 * 验证缺失项计算。
 * 逻辑：只输入最低限度信息，确认教育和经历缺失会进入 evaluation.missing_items，自评使用默认值。
 */
test("createProfile: 缺少经历和证据时应写入缺失项", async () => {
  const service = createProfileService(createProfileRepositoryStub());

  const created = await service.createProfile({
    basic_info: { name: "李四" },
    preference: {
      target_role: "数据分析师",
      preferred_cities: [],
      preferred_industries: [],
    },
    education: {
      school: null,
      level: null,
      major: null,
      graduation_year: null,
      evidence_refs: [],
    },
    skills: [{ name: "Python", category: "data", level: 3, evidence_refs: [] }],
  });

  assert.ok(created.evaluation.missing_items.includes("education.level"));
  assert.ok(created.evaluation.missing_items.includes("experiences"));
  assert.equal(created.self_assessment.learning, 3);
});

/**
 * 验证 Agent 常见别名字段兼容。
 * 逻辑：用 name/description/achievements 等非标准经历字段模拟模型输出，确认 service 会归一到标准经历结构。
 */
test("createProfile: 应兼容模型常见的项目经历别名字段", async () => {
  const service = createProfileService(createProfileRepositoryStub());

  const created = await service.createProfile({
    basic_info: { name: "吴友桃" },
    preference: {
      target_role: "",
      preferred_cities: [],
      preferred_industries: [],
    },
    education: {
      school: "苏州城市学院",
      level: "本科",
      major: "计算机科学与技术",
      graduation_year: 2027,
      evidence_refs: [],
    },
    skills: [{ name: "Vue3", category: "frontend", level: 4, evidence_refs: [] }],
    experiences: [
      {
        kind: "project",
        name: "酒店管理与 OTA 接入系统",
        role: "全栈开发",
        description: "覆盖订单管理、入住退房、房态管理、账单管理和 OTA 平台订单接入。",
        achievements: "实现多 OTA 平台订单统一接入；完成抖音 OTA 接口联调与消息幂等处理",
        tech_stack: "Vue3；Node.js；PostgreSQL；Redis",
      },
    ],
  } as never);

  assert.equal(created.experiences.length, 1);
  assert.equal(created.experiences[0]?.title, "酒店管理与 OTA 接入系统");
  assert.equal(created.experiences[0]?.role, "全栈开发");
  assert.ok(created.experiences[0]?.responsibilities[0]?.includes("覆盖订单管理"));
  assert.ok(created.experiences[0]?.outcomes.includes("实现多 OTA 平台订单统一接入"));
  assert.ok(!created.evaluation.missing_items.includes("experiences"));
});
