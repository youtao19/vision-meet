import type {
  CreateStudentProfileRequest,
  ListStudentProfilesResponse,
  StudentProfileRecord,
} from "@career/contracts/types";

export interface ProfileRepository {
  listStudentProfiles(): ListStudentProfilesResponse;
  createStudentProfile(input: CreateStudentProfileRequest): StudentProfileRecord;
}
