import fs from "node:fs";
import path from "node:path";

import type {
  CreateStudentProfileRequest,
  ListStudentProfilesResponse,
  StudentProfileRecord,
} from "@career/contracts/types";

import type { ProfileRepository } from "./profile.repository.js";

type ProfileStoreData = {
  counter: number;
  profiles: StudentProfileRecord[];
};

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
    const items = [...store.profiles].sort((a, b) => b.id - a.id);
    return {
      total: items.length,
      items,
    };
  }

  function createStudentProfile(input: CreateStudentProfileRequest): StudentProfileRecord {
    const store = readStore();
    store.counter += 1;

    const profile: StudentProfileRecord = {
      id: store.counter,
      name: input.name,
      target_role: input.target_role,
      skills: input.skills,
      summary: `目标岗位：${input.target_role}；技能数：${input.skills.length}`,
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
