/**
 * 文件作用：提供学生画像结构的只读选择器。
 * 边界说明：这里只做字段读取和轻量派生，不做评分、归一化或数据库访问。
 */

import type { DimensionScores, StudentProfileRecord } from "@career/contracts/types";

/**
 * 读取学生姓名。
 * 逻辑：统一从 basic_info.name 获取，避免调用方散落访问结构细节。
 */
export function getProfileName(profile: StudentProfileRecord): string {
  return profile.basic_info.name;
}

/**
 * 读取目标岗位。
 * 逻辑：统一从 preference.target_role 获取，兼容后续画像结构调整。
 */
export function getProfileTargetRole(profile: StudentProfileRecord): string {
  return profile.preference.target_role;
}

/**
 * 读取技能名称列表。
 * 逻辑：只返回技能名，供摘要、匹配上下文和工具返回值快速展示。
 */
export function getProfileSkillNames(profile: StudentProfileRecord): string[] {
  return profile.skills.map((item) => item.name);
}

/**
 * 读取证书名称列表。
 * 逻辑：只抽取证书名，避免展示层关心证书内部字段。
 */
export function getProfileCertificateNames(profile: StudentProfileRecord): string[] {
  return profile.certificates.map((item) => item.name);
}

/**
 * 统计指定类型经历数量。
 * 逻辑：按 project、internship、competition 分类过滤，用于报告和页面摘要。
 */
export function getProfileExperienceCount(
  profile: StudentProfileRecord,
  kind: "project" | "internship" | "competition",
): number {
  return profile.experiences.filter((item) => item.kind === kind).length;
}

/**
 * 读取四维评分。
 * 逻辑：直接返回 evaluation.dimension_scores，保持评分来源只有 service。
 */
export function getProfileDimensionScores(profile: StudentProfileRecord): DimensionScores {
  return profile.evaluation.dimension_scores;
}

/**
 * 读取画像完整度。
 * 逻辑：完整度已在创建时计算，这里只做只读访问。
 */
export function getProfileCompletenessScore(profile: StudentProfileRecord): number {
  return profile.evaluation.completeness_score;
}

/**
 * 读取画像竞争力。
 * 逻辑：竞争力已在创建时计算，这里只做只读访问。
 */
export function getProfileCompetitivenessScore(profile: StudentProfileRecord): number {
  return profile.evaluation.competitiveness_score;
}

/**
 * 读取缺失项列表。
 * 逻辑：返回 service 计算出的字段路径，供页面转换成人类可读文案。
 */
export function getProfileMissingItems(profile: StudentProfileRecord): string[] {
  return profile.evaluation.missing_items;
}

/**
 * 判断画像是否有可展示叙述信息。
 * 逻辑：摘要或证据任一存在，就认为画像具备叙述内容。
 */
export function hasProfileNarrative(profile: StudentProfileRecord): boolean {
  return Boolean(profile.summary.trim() || profile.evidences.length > 0);
}
