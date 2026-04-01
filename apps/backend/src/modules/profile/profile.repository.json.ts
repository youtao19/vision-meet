import fs from "node:fs";
import path from "node:path";

import type {
  ListStudentProfilesResponse,
  StudentProfileRecord,
} from "@career/contracts/types";

import type { ProfileRepository, StudentProfileCreateInput } from "./profile.repository.js";

type ProfileStoreData = {
  counter: number;
  profiles: StudentProfileRecord[];
};

function normalizeLegacyProfile(profile: StudentProfileRecord): StudentProfileRecord {
  const legacy = profile as Partial<StudentProfileRecord>;

  return {
    id: legacy.id || 0,
    name: legacy.name || "",
    target_role: legacy.target_role || "",
    education_level: legacy.education_level ?? null,
    major: legacy.major ?? null,
    graduation_year: legacy.graduation_year ?? null,
    skills: legacy.skills || [],
    certificates: legacy.certificates || [],
    experience: {
      internship_count: legacy.experience?.internship_count ?? 0,
      project_count: legacy.experience?.project_count ?? 0,
      competition_count: legacy.experience?.competition_count ?? 0,
    },
    self_assessment: {
      communication: legacy.self_assessment?.communication ?? 3,
      learning: legacy.self_assessment?.learning ?? 3,
      stress_tolerance: legacy.self_assessment?.stress_tolerance ?? 3,
      innovation: legacy.self_assessment?.innovation ?? 3,
    },
    dimension_scores: {
      base_requirements: legacy.dimension_scores?.base_requirements ?? 0,
      professional_skills: legacy.dimension_scores?.professional_skills ?? 0,
      professional_quality: legacy.dimension_scores?.professional_quality ?? 0,
      development_potential: legacy.dimension_scores?.development_potential ?? 0,
    },
    completeness_score: legacy.completeness_score ?? 0,
    competitiveness_score: legacy.competitiveness_score ?? 0,
    missing_items: legacy.missing_items || [],
    personal_summary: legacy.personal_summary ?? null,
    summary: legacy.summary || "",
    created_at: legacy.created_at || new Date(0).toISOString(),
  };
}

export function createJsonProfileRepository(storagePath?: string): ProfileRepository {
  const storageFile = storagePath || path.join(process.cwd(), "storage", "student-profiles.json");

  function ensureStore(): void {
    const dir = path.dirname(storageFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(storageFile)) {
      const initial: ProfileStoreData = {
        counter: 0,
        profiles: [],
      };
      fs.writeFileSync(storageFile, JSON.stringify(initial, null, 2), "utf-8");
    }
  }

  function readStore(): ProfileStoreData {
    ensureStore();
    const raw = fs.readFileSync(storageFile, "utf-8");
    return JSON.parse(raw) as ProfileStoreData;
  }

  function writeStore(data: ProfileStoreData): void {
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2), "utf-8");
  }

  function listStudentProfiles(): ListStudentProfilesResponse {
    const store = readStore();
    const items = [...store.profiles].map(normalizeLegacyProfile).sort((a, b) => b.id - a.id);
    return {
      total: items.length,
      items,
    };
  }

  function createStudentProfile(input: StudentProfileCreateInput): StudentProfileRecord {
    const store = readStore();
    store.counter += 1;

    const profile: StudentProfileRecord = {
      ...input,
      id: store.counter,
      created_at: new Date().toISOString(),
    };

    store.profiles.push(profile);
    writeStore(store);

    return profile;
  }

  return {
    listStudentProfiles,
    createStudentProfile,
  };
}
