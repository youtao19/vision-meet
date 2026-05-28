/**
 * 文件作用：从 data/jobs 读取新版岗位画像种子数据。
 * 依赖边界：data/jobs/*.json 是人工岗位画像唯一数据源。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { JobPortraitDetail, ManualJobPortraitRecord } from "@career/contracts/types";

export type ManualJobPortraitSeedInput = Omit<
  ManualJobPortraitRecord,
  "id" | "created_at" | "updated_at"
>;

const EXPECTED_JOB_PROFILE_COUNT = 10;
function resolveJobDataDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "data/jobs"),
    path.resolve(process.cwd(), "../../data/jobs"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error("JOB_PROFILE_DATA_DIR_NOT_FOUND:data/jobs");
  }
  return found;
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`JOB_PROFILE_FIELD_INVALID:${fieldName}`);
  }
  return value;
}

function assertJobPortraitDetail(value: unknown, filename: string): JobPortraitDetail {
  const detail = value as Partial<JobPortraitDetail>;
  if (!detail || typeof detail !== "object") {
    throw new Error(`JOB_PROFILE_INVALID:${filename}`);
  }
  if (!detail.name || !detail.category || !detail.description) {
    throw new Error(`JOB_PROFILE_REQUIRED_FIELD_MISSING:${filename}`);
  }
  if (!Array.isArray(detail.subIndustries) || detail.subIndustries.length === 0) {
    throw new Error(`JOB_PROFILE_SUB_INDUSTRIES_EMPTY:${filename}`);
  }

  return {
    name: String(detail.name),
    category: String(detail.category),
    description: String(detail.description),
    educationRequirements: readStringArray(detail.educationRequirements, "educationRequirements"),
    skills: readStringArray(detail.skills, "skills"),
    softSkills: readStringArray(detail.softSkills, "softSkills"),
    certificates: readStringArray(detail.certificates, "certificates"),
    innovationAbility: String(detail.innovationAbility ?? ""),
    learningAbility: String(detail.learningAbility ?? ""),
    stressResistance: String(detail.stressResistance ?? ""),
    communicationAbility: String(detail.communicationAbility ?? ""),
    internshipAbility: String(detail.internshipAbility ?? ""),
    careerPath: readStringArray(detail.careerPath, "careerPath"),
    subIndustries: detail.subIndustries,
  };
}

export function loadManualJobPortraitSeeds(): ManualJobPortraitSeedInput[] {
  const jobDataDir = resolveJobDataDir();
  const files = readdirSync(jobDataDir)
    .filter((file) => file.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));

  if (files.length !== EXPECTED_JOB_PROFILE_COUNT) {
    throw new Error(`JOB_PROFILE_COUNT_INVALID:expected=${EXPECTED_JOB_PROFILE_COUNT},actual=${files.length}`);
  }

  return files.map((file) => {
    const raw = JSON.parse(readFileSync(path.join(jobDataDir, file), "utf8")) as { job?: unknown };
    const profileDetail = assertJobPortraitDetail(raw.job, file);
    return {
      job_name: profileDetail.name,
      category: profileDetail.category,
      profile_detail: profileDetail,
      comic_image_url: null,
      comic_generated_at: null,
    };
  });
}

export const MANUAL_JOB_PORTRAITS_SEED = loadManualJobPortraitSeeds();
