import test from "node:test";
import assert from "node:assert/strict";

import type { ManualJobPortraitRecord } from "@career/contracts/types";

import { HttpError } from "../../../shared/errors/http-error.js";
import { createJobPortraitsService } from "../job-portraits.service.js";
import type { JobPortraitsRepository } from "../job-portraits.repository.js";

function buildManualPortrait(
  jobName: string,
  category: string,
  skills: string[],
  input: Partial<ManualJobPortraitRecord> = {},
): ManualJobPortraitRecord {
  const now = new Date().toISOString();
  return {
    id: input.id ?? 1,
    job_name: jobName,
    category,
    profile_detail: {
      name: jobName,
      category,
      description: `${jobName}岗位画像`,
      educationRequirements: ["计算机相关专业"],
      skills,
      softSkills: ["沟通能力", "协作能力"],
      certificates: ["软考中级"],
      innovationAbility: "中高",
      learningAbility: "高",
      stressResistance: "中",
      communicationAbility: "高",
      internshipAbility: "建议有项目经验",
      careerPath: [jobName, `高级${jobName}`],
      subIndustries: [
        {
          industry: `${jobName}方向`,
          description: `${jobName}子行业`,
          representCompanies: ["示例公司"],
          skills,
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
          recommendedProjects: ["业务系统"],
        },
      ],
    },
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
  };
}

test("listManualJobPortraits: 应返回人工岗位画像列表", async () => {
  const expected = [
    buildManualPortrait("前端开发工程师", "frontend", ["JavaScript", "TypeScript"]),
    buildManualPortrait("后端开发工程师", "backend", ["Java", "SQL"]),
  ];

  const repository: JobPortraitsRepository = {
    listManualJobPortraits() {
      return Promise.resolve(expected);
    },
  };

  const service = createJobPortraitsService(repository);
  const result = await service.listManualJobPortraits();
  assert.equal(result.length, 2);
  assert.equal(result[0]?.job_name, "前端开发工程师");
  assert.equal(result[1]?.job_name, "后端开发工程师");
});

test("listManualJobPortraits: 仓储未实现时应返回 501", async () => {
  const repository: JobPortraitsRepository = {};

  const service = createJobPortraitsService(repository);
  await assert.rejects(
    () => service.listManualJobPortraits(),
    (error: unknown) => error instanceof HttpError && error.status === 501,
  );
});

test("seedManualJobPortraits: 应写入种子数据并返回计数", async () => {
  let replaced = false;

  const repository: JobPortraitsRepository = {
    async replaceManualJobPortraits() {
      replaced = true;
    },
  };

  const service = createJobPortraitsService(repository);
  const result = await service.seedManualJobPortraits();
  assert.equal(typeof result.seeded, "number");
  assert.ok(result.seeded > 0);
  assert.ok(replaced);
});

test("seedManualJobPortraits: 仓储未实现时应返回 501", async () => {
  const repository: JobPortraitsRepository = {};

  const service = createJobPortraitsService(repository);
  await assert.rejects(
    () => service.seedManualJobPortraits(),
    (error: unknown) => error instanceof HttpError && error.status === 501,
  );
});
