import type {
  GenerateJobPortraitComicResponse,
  JobPortraitComicContext,
} from "@career/contracts/types";

import type { AppEnv } from "../../shared/config/env.js";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  generateJobPortraitComicImage,
  resolveJobPortraitComicAsset,
} from "./job-comics.generator.js";
import type { JobComicsRepository } from "./job-comics.repository.js";

export type JobComicsService = {
  generateManualJobPortraitComic(input: {
    jobName: string;
    force: boolean;
    comicContext?: JobPortraitComicContext;
  }): Promise<GenerateJobPortraitComicResponse>;
  getManualJobPortraitComic(jobName: string): Promise<{
    job_name: string;
    comic_image_url: string | null;
  }>;
};

/**
 * 文件作用：承载岗位漫画生成和查询业务。
 * 设计边界：service 负责画像读取、复用判断、图片生成和结果回写；具体图片能力在 pi-tools/codex。
 */
export function createJobComicsService(params: {
  repository: JobComicsRepository;
  env: AppEnv;
  cwd: string;
}): JobComicsService {
  async function generateManualJobPortraitComic(input: {
    jobName: string;
    force: boolean;
    comicContext?: JobPortraitComicContext;
  }): Promise<GenerateJobPortraitComicResponse> {
    const portrait = await params.repository.getManualJobPortraitByName(input.jobName);
    if (!portrait) {
      throw new HttpError(404, "MANUAL_JOB_PORTRAIT_NOT_FOUND", "目标岗位画像不存在");
    }

    if (!input.force && portrait.comic_image_url) {
      return {
        job_name: portrait.job_name,
        comic_image_url: portrait.comic_image_url,
      };
    }

    const generated = await generateJobPortraitComicImage({
      portrait,
      comicContext: input.comicContext,
      env: params.env,
      force: input.force,
      cwd: params.cwd,
    });

    const updated = await params.repository.updateManualJobPortraitComic({
      job_name: portrait.job_name,
      comic_image_url: generated.imageUrl,
      comic_generated_at: new Date().toISOString(),
    });

    return {
      job_name: updated.job_name,
      comic_image_url: updated.comic_image_url || generated.imageUrl,
    };
  }

  async function getManualJobPortraitComic(jobName: string): Promise<{
    job_name: string;
    comic_image_url: string | null;
  }> {
    const asset = resolveJobPortraitComicAsset({ jobName, env: params.env });
    return {
      job_name: jobName,
      comic_image_url: asset.exists ? asset.imageUrl : null,
    };
  }

  return {
    generateManualJobPortraitComic,
    getManualJobPortraitComic,
  };
}
