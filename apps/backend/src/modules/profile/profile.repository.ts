import type {
  ListStudentProfilesResponse,
  StudentProfileRecord,
} from "@career/contracts/types";

export type StudentProfileCreateInput = Omit<StudentProfileRecord, "id" | "created_at">;

export interface ProfileRepository {
  listStudentProfiles(): ListStudentProfilesResponse;
  createStudentProfile(input: StudentProfileCreateInput): StudentProfileRecord;
}
