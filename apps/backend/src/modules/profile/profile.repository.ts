/**
 * 文件作用：定义学生画像仓储抽象接口。
 * 边界说明：service 只依赖该抽象，不允许直接耦合 PostgreSQL 或 JSONB 存储实现。
 */

import type { ListStudentProfilesResponse, StudentProfileRecord } from "@career/contracts/types";

/**
 * 创建画像的仓储输入。
 * 逻辑：业务层负责生成除 id 和 created_at 之外的完整记录，数据库层只补主键和创建时间。
 */
export type StudentProfileCreateInput = Omit<StudentProfileRecord, "id" | "created_at">;

export interface ProfileRepository {
  /**
   * 查询所有学生画像。
   * 逻辑：返回列表和总数，排序规则由具体仓储实现决定。
   */
  listStudentProfiles(): Promise<ListStudentProfilesResponse>;

  /**
   * 按 ID 查询单个学生画像。
   * 逻辑：找不到时返回 null，让调用方决定是否转成 404。
   */
  getStudentProfileById(profileId: number): Promise<StudentProfileRecord | null>;

  /**
   * 创建学生画像。
   * 逻辑：接收 service 已经归一化、评分完成的记录并持久化。
   */
  createStudentProfile(input: StudentProfileCreateInput): Promise<StudentProfileRecord>;
}
