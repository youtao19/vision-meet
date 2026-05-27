import type {
  JobPictureBook,
  GeneratePictureBookResponse,
  GenerateJobPortraitPictureBookResponse,
  JobPortraitPictureBookContext,
} from "@career/contracts/types";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { AppEnv } from "../../shared/config/env.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type { TtsEngine } from "../pi-tools/tts/tts-engine.js";
import {
  generateComicBook,
  generateJobPortraitComicImage,
  resolveComicBookAssetDir,
  resolveJobPortraitComicAsset,
} from "./job-comics.generator.js";
import type { JobComicsRepository } from "./job-comics.repository.js";

export type JobComicsService = {
  generateManualJobPortraitComic(input: {
    jobName: string;
    force: boolean;
    comicContext?: JobPortraitPictureBookContext;
  }): Promise<GenerateJobPortraitPictureBookResponse>;
  getManualJobPortraitComic(jobName: string): Promise<{
    job_name: string;
    comic_image_url: string | null;
  }>;
  generateComicBook(input: {
    jobName: string;
    force: boolean;
    comicContext?: JobPortraitPictureBookContext;
  }): Promise<GeneratePictureBookResponse>;
  getComicBook(jobName: string): Promise<JobPictureBook>;
};

export function createJobComicsService(params: {
  repository: JobComicsRepository;
  env: AppEnv;
  cwd: string;
  ttsEngine: TtsEngine;
}): JobComicsService {
  function normalizeComicBookGenerationError(error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.startsWith("TTS_SYNTHESIS_FAILED") ||
      message.includes("Unexpected server response: 403")
    ) {
      throw new HttpError(502, "PICTURE_BOOK_TTS_FAILED", "语音合成服务访问失败", {
        cause: message,
      });
    }
    if (message.startsWith("BAOYU_IMAGINE_FAILED")) {
      throw new HttpError(502, "PICTURE_BOOK_IMAGE_FAILED", "绘本图片生成服务调用失败", {
        cause: message,
      });
    }
    throw error;
  }

  async function generateManualJobPortraitComic(input: {
    jobName: string;
    force: boolean;
    comicContext?: JobPortraitPictureBookContext;
  }): Promise<GenerateJobPortraitPictureBookResponse> {
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

  async function serviceGenerateComicBook(input: {
    jobName: string;
    force: boolean;
    comicContext?: JobPortraitPictureBookContext;
  }): Promise<GeneratePictureBookResponse> {
    const portrait = await params.repository.getManualJobPortraitByName(input.jobName);
    if (!portrait) {
      throw new HttpError(404, "MANUAL_JOB_PORTRAIT_NOT_FOUND", "目标岗位画像不存在");
    }

    let book: JobPictureBook;
    try {
      book = await generateComicBook({
        portrait,
        comicContext: input.comicContext,
        env: params.env,
        force: input.force,
        cwd: params.cwd,
        ttsEngine: params.ttsEngine,
      });
    } catch (error) {
      normalizeComicBookGenerationError(error);
    }

    await params.repository.updateManualJobPortraitComic({
      job_name: portrait.job_name,
      comic_image_url: book.pages[0]?.image_url ?? "",
      comic_generated_at: new Date().toISOString(),
    });

    return {
      job_name: book.job_name,
      pages: book.pages,
    };
  }

  async function serviceGetComicBook(jobName: string): Promise<JobPictureBook> {
    const assetDir = resolveComicBookAssetDir({ jobName, env: params.env });
    const bookPath = path.join(assetDir.dirPath, "book.json");

    let raw: string;
    try {
      raw = await readFile(bookPath, "utf-8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        throw new HttpError(404, "PICTURE_BOOK_NOT_FOUND", "目标岗位有声绘本尚未生成");
      }
      throw error;
    }
    return JSON.parse(raw) as JobPictureBook;
  }

  return {
    generateManualJobPortraitComic,
    getManualJobPortraitComic,
    generateComicBook: serviceGenerateComicBook,
    getComicBook: serviceGetComicBook,
  };
}
