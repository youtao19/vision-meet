/**
 * 文件作用：验证人岗匹配服务的证据驱动评分逻辑。
 * 职责边界：只覆盖 matching service 的纯业务编排，不连接数据库、不调用外部 Agent。
 */

import assert from "node:assert/strict";
import test from "node:test";

import type {
  DimensionScores,
  JobProfileV2Record,
  JobRecord,
  MatchResultDetail,
  MatchResultListResponse,
  StudentProfileRecord,
} from "@career/contracts/types";

import type { JobsRepository } from "../../jobs/jobs.repository.js";
import type { ProfileRepository } from "../../profile/profile.repository.js";
import type {
  MatchResultCreateInput,
  MatchResultUniqueKey,
  MatchingRepository,
  NormalizedJobHint,
} from "../matching.repository.js";
import { createMatchingService } from "../matching.service.js";

function buildDimensionScores(value: number): DimensionScores {
  return {
    base_requirements: value,
    professional_skills: value,
    professional_quality: value,
    development_potential: value,
  };
}

function buildStudentProfile(input: { id: number; skills: string[] }): StudentProfileRecord {
  return {
    id: input.id,
    source_type: "manual",
    source_digest: `student-${input.id}`,
    name: `学生${input.id}`,
    target_role: "后端开发工程师",
    education_level: "本科",
    major: "软件工程",
    graduation_year: 2026,
    skills: input.skills,
    certificates: ["英语六级"],
    experience: {
      internship_count: 1,
      project_count: 2,
      competition_count: 1,
    },
    self_assessment: {
      communication: 4,
      stress_tolerance: 4,
      learning: 5,
      innovation: 4,
    },
    dimension_scores: buildDimensionScores(70),
    completeness_score: 90,
    competitiveness_score: 76,
    missing_items: [],
    personal_summary: "具备真实项目交付经验。",
    summary: "软件工程学生，目标后端开发。",
    created_at: new Date().toISOString(),
  };
}

function buildJobRecord(): JobRecord {
  return {
    id: 101,
    source_row_id: null,
    normalized_source_key: null,
    title: "Java后端开发工程师",
    location: null,
    salary_range: null,
    company_name: null,
    industry: "互联网",
    company_size: null,
    company_type: null,
    job_code: null,
    job_description: null,
    company_intro: null,
    raw_payload: {},
    created_at: new Date().toISOString(),
  };
}

function buildJobProfile(): JobProfileV2Record {
  return {
    id: 1,
    job_id: 101,
    profile_version: 3,
    normalized_title: "Java后端开发工程师",
    job_family: "software_backend",
    job_level: 3,
    professional_skills: ["Java", "Spring", "MySQL", "Redis"],
    certificate_requirements: ["英语六级"],
    innovation_score: 72,
    learning_score: 80,
    stress_tolerance_score: 78,
    communication_score: 74,
    internship_score: 70,
    summary: "负责后端服务开发与性能优化。",
    confidence: 0.9,
    generation_model: "test",
    generation_mode: "heuristic",
    extracted_features: {},
    created_at: new Date().toISOString(),
  };
}

function createProfileRepository(profile: StudentProfileRecord): ProfileRepository {
  return {
    async listStudentProfiles() {
      return {
        total: 1,
        items: [profile],
      };
    },
    async getStudentProfileById(profileId) {
      return profileId === profile.id ? profile : null;
    },
    async createStudentProfile() {
      throw new Error("not implemented in matching service test");
    },
  };
}

function createJobsRepository(job: JobRecord, jobProfile: JobProfileV2Record): JobsRepository {
  return {
    async addJobs() {
      throw new Error("not implemented in matching service test");
    },
    async listJobs() {
      return {
        total: 1,
        items: [job],
      };
    },
    async getJobById(jobId) {
      return jobId === job.id ? job : null;
    },
    async findBestJobByTargetRole() {
      return job;
    },
    async getLatestProfileV2ByJobId(jobId) {
      return jobId === job.id ? jobProfile : null;
    },
  };
}

function createMatchingRepository(): MatchingRepository {
  let nextId = 1;
  const items: MatchResultDetail[] = [];

  return {
    async createMatchResult(input: MatchResultCreateInput) {
      const record: MatchResultDetail = {
        ...input,
        id: nextId++,
        from_cache: false,
        created_at: new Date().toISOString(),
      };
      items.unshift(record);
      return record;
    },
    async getMatchResultById(matchId) {
      return items.find((item) => item.id === matchId) ?? null;
    },
    async listMatchResults(): Promise<MatchResultListResponse> {
      return {
        total: items.length,
        items,
      };
    },
    async findReusableResult(_uniqueKey: MatchResultUniqueKey) {
      return null;
    },
    async getNormalizedJobHint(): Promise<NormalizedJobHint> {
      return {
        normalized_title: "Java后端开发工程师",
        normalized_job_family: "software_backend",
        confidence: 0.92,
      };
    },
  };
}

test("createMatch: 技能证据应影响职业技能匹配分并写入解释", async () => {
  const job = buildJobRecord();
  const jobProfile = buildJobProfile();
  const strongProfile = buildStudentProfile({
    id: 1,
    skills: ["Java", "Spring Boot", "MySQL", "Redis", "Docker"],
  });
  const weakProfile = buildStudentProfile({
    id: 2,
    skills: ["Photoshop", "运营策划"],
  });

  const strongService = createMatchingService(
    createMatchingRepository(),
    createProfileRepository(strongProfile),
    createJobsRepository(job, jobProfile),
    { scoringVersion: "test" },
  );
  const weakService = createMatchingService(
    createMatchingRepository(),
    createProfileRepository(weakProfile),
    createJobsRepository(job, jobProfile),
    { scoringVersion: "test" },
  );

  const strongResult = await strongService.createMatch({
    student_profile_id: strongProfile.id,
    job_id: job.id,
    force_recalculate: true,
  });
  const weakResult = await weakService.createMatch({
    student_profile_id: weakProfile.id,
    job_id: job.id,
    force_recalculate: true,
  });

  assert.ok(
    strongResult.dimension_scores.professional_skills >
      weakResult.dimension_scores.professional_skills,
  );
  assert.ok(strongResult.evidence_refs.some((item) => item.includes("核心技能覆盖率：100%")));
  assert.ok(
    weakResult.explanations.some((item) =>
      item.evidence_refs.some((evidence) => evidence.includes("待补齐技能")),
    ),
  );
});
