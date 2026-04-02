import type {
  ListStudentProfilesResponse,
  StudentProfileRecord,
} from "@career/contracts/types";

/**
 * 文件作用：定义学生画像仓储抽象接口。
 * 边界约束：service 只依赖该抽象，不允许直接耦合 JSON/数据库实现。
 */
export type StudentProfileCreateInput = Omit<StudentProfileRecord, "id" | "created_at">;

export interface ProfileRepository {
  listStudentProfiles(): Promise<ListStudentProfilesResponse>;
  getStudentProfileById(profileId: number): Promise<StudentProfileRecord | null>;
  createStudentProfile(input: StudentProfileCreateInput): Promise<StudentProfileRecord>;
}
