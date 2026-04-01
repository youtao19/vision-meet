import type {
  CreateStudentProfileRequest,
  ListStudentProfilesResponse,
  StudentProfileRecord,
} from "@career/contracts/types";

import type { ProfileRepository } from "./profile.repository.js";

export interface ProfileService {
  listProfiles(): ListStudentProfilesResponse;
  createProfile(input: CreateStudentProfileRequest): StudentProfileRecord;
}

export function createProfileService(repository: ProfileRepository): ProfileService {
  return {
    listProfiles: repository.listStudentProfiles,
    createProfile: repository.createStudentProfile,
  };
}
