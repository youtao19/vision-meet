/**
 * 文件作用：验证人岗匹配服务的证据驱动评分逻辑。
 * 职责边界：只覆盖 matching service 的纯业务编排，不连接数据库、不调用外部 Agent。
 */

import assert from "node:assert/strict";
import test from "node:test";

import type {
  DimensionScores,
  ManualJobPortraitRecord,
  MatchResultDetail,
  MatchResultListResponse,
  StudentProfileRecord,
} from "@career/contracts/types";

import type { ProfileRepository } from "../../profile/profile.repository.js";
import type {
  MatchResultCreateInput,
  MatchResultUniqueKey,
  MatchingRepository,
} from "../matching.repository.js";
import { createMatchingService, type JobPortraitRepository } from "../matching.service.js";

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
    basic_info: { name: `学生${input.id}` },
    preference: {
      target_role: "后端开发工程师",
      preferred_cities: [],
      preferred_industries: [],
    },
    education: {
      school: null,
      level: "本科",
      major: "软件工程",
      graduation_year: 2026,
      evidence_refs: [],
    },
    skills: input.skills.map((name) => ({
      name,
      category: "backend",
      level: 4,
      evidence_refs: [],
    })),
    certificates: [{ name: "英语六级", issuer: null, acquired_at: null, evidence_refs: [] }],
    experiences: [
      {
        kind: "internship",
        title: "后端实习",
        organization: null,
        role: null,
        period: null,
        tech_stack: [],
        responsibilities: [],
        outcomes: [],
        evidence_refs: [],
      },
      {
        kind: "project",
        title: "项目一",
        organization: null,
        role: null,
        period: null,
        tech_stack: [],
        responsibilities: [],
        outcomes: [],
        evidence_refs: [],
      },
      {
        kind: "project",
        title: "项目二",
        organization: null,
        role: null,
        period: null,
        tech_stack: [],
        responsibilities: [],
        outcomes: [],
        evidence_refs: [],
      },
      {
        kind: "competition",
        title: "竞赛经历",
        organization: null,
        role: null,
        period: null,
        tech_stack: [],
        responsibilities: [],
        outcomes: [],
        evidence_refs: [],
      },
    ],
    self_assessment: {
      communication: 4,
      stress_tolerance: 4,
      learning: 5,
      innovation: 4,
    },
    evidences: [],
    evaluation: {
      dimension_scores: buildDimensionScores(70),
      completeness_score: 90,
      competitiveness_score: 76,
      missing_items: [],
      warnings: [],
    },
    parse_meta: {
      parser: "manual",
      model: null,
      confidence: 1,
      warnings: [],
    },
    summary: "软件工程学生，目标后端开发。",
    created_at: new Date().toISOString(),
  };
}

function buildPortrait(): ManualJobPortraitRecord {
  return {
    job_name: "Java后端开发工程师",
    category: "计算机/互联网",
    profile_detail: {
      name: "Java后端开发工程师",
      category: "计算机/互联网",
      description: "负责后端服务开发与性能优化。",
      educationRequirements: ["本科"],
      skills: ["Java", "Spring", "MySQL", "Redis"],
      softSkills: ["沟通", "学习能力", "抗压"],
      certificates: ["英语六级"],
      innovationAbility: "中",
      learningAbility: "高",
      stressResistance: "中",
      communicationAbility: "中",
      internshipAbility: "需要项目或实习经历",
      careerPath: [],
      subIndustries: [],
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

function createJobPortraitRepository(
  portrait: ManualJobPortraitRecord | null,
): JobPortraitRepository {
  return {
    async getManualJobPortraitByName(jobName) {
      return portrait && portrait.job_name === jobName ? portrait : null;
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
  };
}

test("createMatch: 技能证据应影响职业技能匹配分并写入解释", async () => {
  const portrait = buildPortrait();
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
    createJobPortraitRepository(portrait),
    { scoringVersion: "test" },
  );
  const weakService = createMatchingService(
    createMatchingRepository(),
    createProfileRepository(weakProfile),
    createJobPortraitRepository(portrait),
    { scoringVersion: "test" },
  );

  const strongResult = await strongService.createMatch({
    student_profile_id: strongProfile.id,
    job_portrait_name: portrait.job_name,
    force_recalculate: true,
  });
  const weakResult = await weakService.createMatch({
    student_profile_id: weakProfile.id,
    job_portrait_name: portrait.job_name,
    force_recalculate: true,
  });

  assert.ok(
    strongResult.dimension_scores.professional_skills >
      weakResult.dimension_scores.professional_skills,
  );
  assert.ok(strongResult.evidence_refs.some((item) => item.includes("核心技能覆盖率：100%")));
  assert.equal(strongResult.scoring_snapshot.algorithm_version, "requirement-evidence-v1");
  assert.ok(strongResult.requirement_scores.length > 0);
  assert.ok(strongResult.confidence > 0);
  assert.ok(
    weakResult.explanations.some((item) =>
      item.evidence_refs.some((evidence) => evidence.includes("待补齐要求")),
    ),
  );
  assert.ok(weakResult.weak_requirements.length > 0);
});

test("createMatch: 岗位画像不存在时应抛出 HttpError", async () => {
  const profile = buildStudentProfile({ id: 3, skills: ["Java"] });

  const service = createMatchingService(
    createMatchingRepository(),
    createProfileRepository(profile),
    createJobPortraitRepository(null),
    { scoringVersion: "test" },
  );

  await assert.rejects(
    service.createMatch({
      student_profile_id: profile.id,
      job_portrait_name: "不存在的岗位画像",
    }),
    (err: any) => {
      return err.status === 404 && err.code === "JOB_PORTRAIT_NOT_FOUND";
    },
  );
});
