import type { StudentProfileRecord } from "@career/contracts/types";

import {
  getProfileCompletenessScore,
  getProfileExperienceCount,
} from "../profile/profile.selectors.js";

export type StudentMatchSkill = {
  name: string;
  level: number;
  evidence_refs: string[];
};

export type StudentMatchExperience = {
  kind: "project" | "internship" | "competition";
  title: string;
  text: string;
  tech_stack: string[];
  evidence_refs: string[];
};

export type StudentMatchSnapshot = {
  skills: StudentMatchSkill[];
  certificates: Array<{ name: string; evidence_refs: string[] }>;
  education: {
    level: string | null;
    major: string | null;
    graduation_year: number | null;
    evidence_refs: string[];
  };
  experiences: StudentMatchExperience[];
  self_assessment: StudentProfileRecord["self_assessment"];
  completeness_score: number;
  source_confidence: number;
  has_narrative: boolean;
};

function joinText(items: string[]): string {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .join("；");
}

export function buildStudentMatchSnapshot(profile: StudentProfileRecord): StudentMatchSnapshot {
  return {
    skills: profile.skills.map((item) => ({
      name: item.name,
      level: item.level,
      evidence_refs: item.evidence_refs,
    })),
    certificates: profile.certificates.map((item) => ({
      name: item.name,
      evidence_refs: item.evidence_refs,
    })),
    education: {
      level: profile.education.level,
      major: profile.education.major,
      graduation_year: profile.education.graduation_year,
      evidence_refs: profile.education.evidence_refs,
    },
    experiences: profile.experiences.map((item) => ({
      kind: item.kind,
      title: item.title,
      tech_stack: item.tech_stack,
      text: joinText([
        item.title,
        item.role || "",
        ...item.tech_stack,
        ...item.responsibilities,
        ...item.outcomes,
      ]),
      evidence_refs: item.evidence_refs,
    })),
    self_assessment: profile.self_assessment,
    completeness_score: getProfileCompletenessScore(profile),
    source_confidence: profile.parse_meta.confidence,
    has_narrative: Boolean(
      profile.summary.trim() ||
      profile.evidences.length > 0 ||
      getProfileExperienceCount(profile, "project") > 0,
    ),
  };
}
