/**
 * 文件作用：验证岗位画像漫画 prompt 能根据不同岗位生成差异化场景。
 * 职责边界：只测试 prompt 纯函数，不调用图片生成脚本和外部模型。
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { ManualJobPortraitRecord } from "@career/contracts/types";

import { buildJobPortraitComicPrompt } from "../jobs-intelligence.comic.js";

function buildPortrait(jobName: string, category: string): ManualJobPortraitRecord {
  return {
    job_name: jobName,
    category,
    profile_detail: {
      name: jobName,
      category,
      description: `${jobName}岗位描述`,
      educationRequirements: ["计算机相关专业"],
      skills: ["Vue", "TypeScript", "接口联调"],
      softSkills: ["沟通能力", "学习能力"],
      certificates: ["软考中级"],
      innovationAbility: "中高",
      learningAbility: "高",
      stressResistance: "中",
      communicationAbility: "高",
      internshipAbility: "有项目经验优先",
      careerPath: [jobName, `高级${jobName}`],
      subIndustries: [
        {
          industry: `${jobName}方向`,
          description: `${jobName}子行业描述`,
          representCompanies: ["示例公司"],
          skills: ["Vue", "TypeScript"],
          softSkills: ["沟通能力"],
          certificates: [],
          innovationAbility: "中高",
          learningAbility: "高",
          stressResistance: "中",
          communicationAbility: "高",
          internshipAbility: "建议有项目经验",
          salaryLevel: "高",
          overtimeLevel: "中",
          industryFeatures: ["迭代快"],
          recommendedProjects: ["后台系统"],
        },
      ],
    },
    created_at: new Date("2026-04-17T00:00:00.000Z").toISOString(),
    updated_at: new Date("2026-04-17T00:00:00.000Z").toISOString(),
  };
}

test("buildJobPortraitComicPrompt: 前端岗位应强调页面、组件和接口联调", () => {
  const prompt = buildJobPortraitComicPrompt(buildPortrait("前端开发", "software"), {
    summary: "负责 Web 页面与交互体验开发",
    tech_stack: ["Vue", "TypeScript", "Vite"],
    core_responsibilities: ["页面开发", "组件封装", "接口联调"],
  });

  assert.match(prompt, /识别到的岗位类型：前端开发/);
  assert.match(prompt, /还原设计稿/);
  assert.match(prompt, /拆分页面组件/);
  assert.match(prompt, /把设计稿和业务需求变成用户能操作的界面/);
});

test("buildJobPortraitComicPrompt: 测试岗位不应被画成通用写代码岗位", () => {
  const prompt = buildJobPortraitComicPrompt(buildPortrait("软件测试", "qa"), {
    summary: "保障功能上线前的质量",
    tech_stack: ["Postman", "JMeter"],
    core_responsibilities: ["功能测试", "接口测试", "缺陷管理"],
  });

  assert.match(prompt, /识别到的岗位类型：测试工程师/);
  assert.match(prompt, /写测试用例/);
  assert.match(prompt, /记录缺陷/);
  assert.match(prompt, /Postman：测接口/);
});

test("buildJobPortraitComicPrompt: 非研发岗位应使用岗位自身交付物", () => {
  const prompt = buildJobPortraitComicPrompt(buildPortrait("网络销售", "network"), {
    summary: "通过线上沟通推进客户转化",
    core_responsibilities: ["筛选客户", "介绍方案", "跟进报价"],
  });

  assert.match(prompt, /识别到的岗位类型：网络销售/);
  assert.match(prompt, /筛选客户/);
  assert.match(prompt, /客户理解产品/);
  assert.match(prompt, /不要把所有岗位都画成程序员写代码/);
});

test("buildJobPortraitComicPrompt: 更具体的岗位关键词应优先于泛化关键词", () => {
  const prompt = buildJobPortraitComicPrompt(buildPortrait("硬件测试", "hardware_qa"), {
    summary: "负责硬件功能、稳定性和可靠性验证",
    core_responsibilities: ["执行测试项", "记录异常", "输出测试报告"],
  });

  assert.match(prompt, /识别到的岗位类型：硬件测试/);
  assert.match(prompt, /连接测试设备/);
  assert.match(prompt, /示波器/);
});
