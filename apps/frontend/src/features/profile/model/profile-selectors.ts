import type { DimensionScores, StudentProfileRecord } from "@career/contracts/types";

export function profileName(profile: StudentProfileRecord): string {
  return profile.basic_info.name;
}

export function profileTargetRole(profile: StudentProfileRecord): string {
  return profile.preference.target_role;
}

export function profileMajor(profile: StudentProfileRecord): string | null {
  return profile.education.major;
}

export function profileGraduationYear(profile: StudentProfileRecord): number | null {
  return profile.education.graduation_year;
}

export function profileSkillNames(profile: StudentProfileRecord): string[] {
  return profile.skills.map((item) => item.name);
}

export function profileCertificateNames(profile: StudentProfileRecord): string[] {
  return profile.certificates.map((item) => item.name);
}

export function profileExperienceCount(
  profile: StudentProfileRecord,
  kind: "project" | "internship" | "competition",
): number {
  return profile.experiences.filter((item) => item.kind === kind).length;
}

export function profileDimensionScores(profile: StudentProfileRecord): DimensionScores {
  return profile.evaluation.dimension_scores;
}

export function profileCompleteness(profile: StudentProfileRecord): number {
  return profile.evaluation.completeness_score;
}

export function profileCompetitiveness(profile: StudentProfileRecord): number {
  return profile.evaluation.competitiveness_score;
}
