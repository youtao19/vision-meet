/**
 * 文件作用：验证学生画像服务在“简历上传”场景下的岗位归一与字段提取行为。
 * 职责边界：仅覆盖 profile service 的纯业务逻辑，不连接数据库与外部 Agent。
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { JobRecord, StudentProfileRecord } from "@career/contracts/types";

import type { JobsRepository } from "../../jobs/jobs.repository.js";
import type { ProfileRepository } from "../profile.repository.js";
import { createProfileService } from "../profile.service.js";

function buildJobRecord(id: number, title: string): JobRecord {
  return {
    id,
    source_row_id: null,
    normalized_source_key: null,
    title,
    location: null,
    salary_range: null,
    company_name: null,
    industry: null,
    company_size: null,
    company_type: null,
    job_code: null,
    job_description: null,
    company_intro: null,
    raw_payload: {},
    created_at: new Date().toISOString(),
  };
}

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

function createJobsRepositoryStub(
  resolver: (targetRole: string) => Promise<JobRecord | null> | JobRecord | null,
): JobsRepository {
  return {
    async addJobs() {
      throw new Error("not implemented in test");
    },
    async listJobs() {
      return { total: 0, items: [] };
    },
    async getJobById() {
      return null;
    },
    async findBestJobByTargetRole(targetRole) {
      return resolver(targetRole);
    },
    async getLatestProfileV2ByJobId() {
      return null;
    },
  };
}

test("createProfileFromResume: 应把占位岗位映射为数据库岗位标题", async () => {
  const repository = createProfileRepositoryStub();
  const jobsRepository = createJobsRepositoryStub(async (targetRole) => {
    if (targetRole === "前端开发工程师") {
      return buildJobRecord(101, "前端开发工程师");
    }
    return null;
  });
  const service = createProfileService(repository, { jobsRepository });

  const created = await service.createProfileFromResume({
    file_name: "resume.txt",
    file_content: ["姓名：张三", "求职意向：前端开发工程师", "技能：Vue TypeScript"].join("\n"),
    target_role: "待定岗位",
    parse_mode: "tolerant",
  });

  assert.equal(created.target_role, "前端开发工程师");
  assert.equal(created.name, "张三");
});

test("createProfileFromResume: 未显式写岗位时应按技能推断并映射数据库岗位", async () => {
  const repository = createProfileRepositoryStub();
  const jobsRepository = createJobsRepositoryStub(async (targetRole) => {
    if (targetRole === "后端开发工程师") {
      return buildJobRecord(202, "Java后端开发工程师");
    }
    return null;
  });
  const service = createProfileService(repository, { jobsRepository });

  const created = await service.createProfileFromResume({
    file_name: "resume.txt",
    file_content: ["姓名：李四", "专业：软件工程", "技能：Java Node Express SQL Docker"].join("\n"),
    target_role: "待定岗位",
    parse_mode: "tolerant",
  });

  assert.equal(created.target_role, "Java后端开发工程师");
});

test("createProfileFromResume: 不应把 PDF 字体元信息误识别为姓名", async () => {
  const repository = createProfileRepositoryStub();
  const jobsRepository = createJobsRepositoryStub(async () => buildJobRecord(301, "数据分析师"));
  const service = createProfileService(repository, { jobsRepository });

  const created = await service.createProfileFromResume({
    file_name: "resume.pdf",
    file_content: [
      "BT /F1 12 Tf",
      "Name /AAAAAA+GoogleSans-Regular_Bold",
      "技能：Python SQL 数据分析",
    ].join("\n"),
    target_role: "待定岗位",
    parse_mode: "tolerant",
  });

  assert.equal(created.name, "匿名候选人");
  assert.equal(created.target_role, "数据分析师");
});

test("createProfileFromResume: 姓名位于简历顶部时应能识别", async () => {
  const repository = createProfileRepositoryStub();
  const jobsRepository = createJobsRepositoryStub(async () =>
    buildJobRecord(401, "前端开发工程师"),
  );
  const service = createProfileService(repository, { jobsRepository });

  const created = await service.createProfileFromResume({
    file_name: "resume.txt",
    file_content: ["王小明", "前端开发工程师", "电话 13800001111", "技能：Vue TypeScript CSS"].join(
      "\n",
    ),
    target_role: "待定岗位",
    parse_mode: "tolerant",
  });

  assert.equal(created.name, "王小明");
});

test("createProfileFromResume: 标题复合行中的姓名应能拆解识别", async () => {
  const repository = createProfileRepositoryStub();
  const jobsRepository = createJobsRepositoryStub(async () =>
    buildJobRecord(402, "后端开发工程师"),
  );
  const service = createProfileService(repository, { jobsRepository });

  const created = await service.createProfileFromResume({
    file_name: "resume.txt",
    file_content: [
      "李晓彤 | 后端开发工程师",
      "电话 13800001111",
      "技能：Java Spring SQL Docker",
    ].join("\n"),
    target_role: "待定岗位",
    parse_mode: "tolerant",
  });

  assert.equal(created.name, "李晓彤");
});

test("createProfileFromResume: PDF 标题行中的方括号姓名应能识别", async () => {
  const repository = createProfileRepositoryStub();
  const jobsRepository = createJobsRepositoryStub(async () =>
    buildJobRecord(404, "后端开发工程师"),
  );
  const service = createProfileService(repository, { jobsRepository });

  const created = await service.createProfileFromResume({
    file_name: "简历制作.pdf",
    file_content: [
      "[   吴友桃] | 全栈开发工程师",
      "电话：139951339211 | 邮箱：wuyoutao19@email.com",
      "求职意向：全栈开发 / 后端开发工程师",
      "技能：Java Python Node.js",
    ].join("\n"),
    target_role: "待定岗位",
    parse_mode: "tolerant",
  });

  assert.equal(created.name, "吴友桃");
});

test("createProfileFromResume: 正文缺失姓名时应回退到文件名提取", async () => {
  const repository = createProfileRepositoryStub();
  const jobsRepository = createJobsRepositoryStub(async () =>
    buildJobRecord(403, "后端开发工程师"),
  );
  const service = createProfileService(repository, { jobsRepository });

  const created = await service.createProfileFromResume({
    file_name: "张三-后端开发工程师-简历.pdf",
    file_content: ["求职意向：后端开发工程师", "技能：Java SQL Docker"].join("\n"),
    target_role: "待定岗位",
    parse_mode: "tolerant",
  });

  assert.equal(created.name, "张三");
});
