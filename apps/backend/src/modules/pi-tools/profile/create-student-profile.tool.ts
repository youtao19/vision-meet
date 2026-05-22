/**
 * 文件作用：把“创建学生画像”封装成 Pi 可调用工具。
 * 设计边界：工具只收集结构化参数并调用 profile service，画像评分和落库规则仍由 profile 领域负责。
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { CreateStudentProfileRequest } from "@career/contracts/types";

import type { ProfileService } from "../../profile/profile.service.js";
import { readStringParam } from "../../ai/runtime/ai-agent.utils.js";
import {
  getProfileCompletenessScore,
  getProfileCompetitivenessScore,
  getProfileMissingItems,
  getProfileName,
  getProfileTargetRole,
} from "../../profile/profile.selectors.js";

export type CreateStudentProfileToolContext = {
  profileService: ProfileService;
};

function readRequiredString(params: unknown, key: string): string {
  const value = readStringParam(params, key)?.trim();
  if (!value) {
    throw new Error(`create_student_profile 需要传入 ${key}`);
  }
  return value;
}

function readStringArray(params: unknown, key: string): string[] {
  if (!params || typeof params !== "object") {
    return [];
  }
  const value = (params as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readOptionalNumber(params: unknown, key: string): number | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const value = (params as Record<string, unknown>)[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * 创建学生画像工具。
 * 参数：context 注入 profile service；Pi 侧传学生基础信息、技能、证书和摘要。
 * 返回：落库后的学生画像记录。
 */
export function createStudentProfileTool(context: CreateStudentProfileToolContext): ToolDefinition {
  return {
    name: "create_student_profile",
    label: "生成学生画像",
    description: "根据结构化学生信息创建画像，并返回评分、缺口和摘要。",
    parameters: Type.Object({
      name: Type.String({ minLength: 1, description: "学生姓名" }),
      target_role: Type.String({ minLength: 1, description: "目标岗位" }),
      education_level: Type.Optional(Type.String({ minLength: 1, description: "学历" })),
      major: Type.Optional(Type.String({ minLength: 1, description: "专业" })),
      graduation_year: Type.Optional(Type.Integer({ minimum: 1970, maximum: 2100 })),
      skills: Type.Array(Type.String({ minLength: 1 }), { description: "技能列表" }),
      certificates: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      personal_summary: Type.Optional(Type.String({ minLength: 1, description: "个人摘要" })),
    }),
    execute: async (_toolCallId, params) => {
      const skills = readStringArray(params, "skills");
      const payload: CreateStudentProfileRequest = {
        basic_info: {
          name: readRequiredString(params, "name"),
        },
        preference: {
          target_role: readRequiredString(params, "target_role"),
          preferred_cities: [],
          preferred_industries: [],
        },
        education: {
          school: null,
          level: readStringParam(params, "education_level")?.trim() || null,
          major: readStringParam(params, "major")?.trim() || null,
          graduation_year: readOptionalNumber(params, "graduation_year") || null,
          evidence_refs: [],
        },
        skills: skills.map((name) => ({
          name,
          category: "other",
          level: 3,
          evidence_refs: [],
        })),
        certificates: readStringArray(params, "certificates").map((name) => ({
          name,
          issuer: null,
          acquired_at: null,
          evidence_refs: [],
        })),
        experiences: [],
        summary: readStringParam(params, "personal_summary")?.trim(),
      };

      const profile = await context.profileService.createProfile(payload);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: profile.id,
                name: getProfileName(profile),
                target_role: getProfileTargetRole(profile),
                completeness_score: getProfileCompletenessScore(profile),
                competitiveness_score: getProfileCompetitivenessScore(profile),
                missing_items: getProfileMissingItems(profile),
              },
              null,
              2,
            ),
          },
        ],
        details: profile,
      };
    },
  };
}
