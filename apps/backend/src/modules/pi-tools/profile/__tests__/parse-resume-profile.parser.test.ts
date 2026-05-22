import assert from "node:assert/strict";
import test from "node:test";

import { HttpError } from "../../../../shared/errors/http-error.js";
import {
  parseResumeRawAgentOutput,
  parseStudentProfileAgentOutput,
} from "../parse-resume-profile.parser.js";

test("parseResumeRawAgentOutput: 只接受简历事实字段", () => {
  const parsed = parseResumeRawAgentOutput(
    JSON.stringify({
      basic_info: {
        name: "吴友桃",
        phone: null,
        email: null,
        github: null,
      },
      education: [],
      skills: [{ name: "Vue3", category: "frontend" }],
      projects: [
        {
          name: "酒店管理系统",
          role: "全栈开发",
          description: null,
          tech_stack: ["Vue3", "Node.js", "PostgreSQL"],
          responsibilities: ["负责订单、房态、账单模块开发"],
          outcomes: [],
        },
      ],
      certificates: [],
      competitions: [],
    }),
  );

  assert.equal(parsed.basic_info.name, "吴友桃");
  assert.equal(parsed.projects[0]?.responsibilities[0], "负责订单、房态、账单模块开发");
});

test("parseResumeRawAgentOutput: 禁止混入画像生成字段", () => {
  assert.throws(
    () =>
      parseResumeRawAgentOutput(
        JSON.stringify({
          basic_info: { name: "吴友桃" },
          education: [],
          skills: [],
          projects: [],
          certificates: [],
          competitions: [],
          summary: "不应该在 ResumeRaw 里生成总结",
        }),
      ),
    (error) =>
      error instanceof HttpError &&
      error.code === "RESUME_RAW_AGENT_OUTPUT_INVALID" &&
      JSON.stringify(error.detail).includes("summary"),
  );
});

test("parseStudentProfileAgentOutput: 拒绝最终画像里的 evaluation", () => {
  assert.throws(
    () =>
      parseStudentProfileAgentOutput(
        JSON.stringify({
          basic_info: { name: "吴友桃" },
          preference: {
            target_role: "",
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
          skills: [],
          certificates: [],
          experiences: [],
          self_assessment: {
            communication: 3,
            learning: 3,
            stress_tolerance: 3,
            innovation: 3,
          },
          evidences: [],
          summary: "画像摘要",
          confidence: 0.8,
          warnings: [],
          evaluation: {
            competitiveness_score: 66,
          },
        }),
      ),
    (error) =>
      error instanceof HttpError &&
      error.code === "STUDENT_PROFILE_AGENT_OUTPUT_INVALID" &&
      JSON.stringify(error.detail).includes("evaluation"),
  );
});
