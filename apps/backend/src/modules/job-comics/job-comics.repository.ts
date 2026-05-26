import type { ManualJobPortraitRecord } from "@career/contracts/types";

export type ManualJobPortraitComicUpdateInput = {
  job_name: string;
  comic_image_url: string;
  comic_generated_at: string;
};

/**
 * 文件作用：定义岗位漫画模块需要的画像读写能力。
 * 设计边界：这里只暴露漫画生成所需的最小数据接口，不承接岗位智能流水线逻辑。
 */
export interface JobComicsRepository {
  getManualJobPortraitByName(jobName: string): Promise<ManualJobPortraitRecord | null>;
  updateManualJobPortraitComic(
    input: ManualJobPortraitComicUpdateInput,
  ): Promise<ManualJobPortraitRecord>;
}
