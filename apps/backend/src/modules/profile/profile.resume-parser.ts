/**
 * 文件作用：把上传的简历文件渲染为可供学生画像 Agent 读取的图片输入。
 * 职责边界：只负责文件格式识别、PDF 渲染与图片 base64 转换；不负责画像字段抽取。
 */

import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { HttpError } from "../../shared/errors/http-error.js";

const execFileAsync = promisify(execFile);

/**
 * 读取上传文件扩展名。
 * 逻辑：统一转小写，后续格式判断不再关心用户原始文件名大小写。
 */
function getResumeFileExtension(fileName: string): string {
  return path.extname(fileName).toLowerCase();
}

/**
 * 判断扩展名是否属于可直接发送给 Agent 的图片。
 * 逻辑：图片文件不需要系统工具转换，只需转 base64 并附带 MIME 类型。
 */
export function isResumeImageExtension(extension: string): boolean {
  return [".png", ".jpg", ".jpeg", ".webp", ".bmp"].includes(extension.toLowerCase());
}

/**
 * 根据图片扩展名推断 MIME 类型。
 * 逻辑：只覆盖当前上传白名单，未知情况按 PNG 处理，避免缺失 MIME 导致多模态输入失败。
 */
function getImageMimeType(extension: string): string {
  switch (extension.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".png":
    default:
      return "image/png";
  }
}

/**
 * 把上传简历渲染成 Agent 可读取的图片数组。
 * 逻辑：图片文件直接转 base64；PDF 先写入临时目录，再用 pdftoppm 按页渲染为 PNG。
 * 复杂点：PDF 渲染结果按自然页码排序，最后清理临时目录，避免多页简历乱序或残留临时文件。
 */
export async function renderUploadedResumeToImages(params: {
  fileName: string;
  buffer: Buffer;
  maxPages?: number;
}): Promise<Array<{ data: string; mimeType: string }>> {
  const extension = getResumeFileExtension(params.fileName);
  if (isResumeImageExtension(extension)) {
    return [
      {
        data: params.buffer.toString("base64"),
        mimeType: getImageMimeType(extension),
      },
    ];
  }

  if (extension !== ".pdf") {
    throw new HttpError(
      422,
      "RESUME_IMAGE_INPUT_REQUIRED",
      "当前简历画像生成直接读取图片，请上传 PDF 或 PNG/JPG/WebP 图片简历",
    );
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "career-agent-resume-images-"));
  const inputPath = path.join(tempDir, "resume.pdf");
  const outputPrefix = path.join(tempDir, "resume-page");
  const maxPages = Math.max(1, Math.min(params.maxPages ?? 6, 10));

  try {
    // pdftoppm 只能处理文件路径，因此先把内存中的上传 buffer 写入临时 PDF。
    await writeFile(inputPath, params.buffer);
    await execFileAsync("pdftoppm", [
      "-f",
      "1",
      "-l",
      String(maxPages),
      "-png",
      inputPath,
      outputPrefix,
    ]);
    const pageFiles = (await readdir(tempDir))
      .filter((fileName) => fileName.startsWith("resume-page") && fileName.endsWith(".png"))
      .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));

    if (pageFiles.length === 0) {
      throw new Error("PDF_RENDER_EMPTY");
    }

    // 每页图片都带上 MIME 类型，后续 runPiSession 可以直接作为 images 输入。
    return Promise.all(
      pageFiles.map(async (fileName) => ({
        data: (await readFile(path.join(tempDir, fileName))).toString("base64"),
        mimeType: "image/png",
      })),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    throw new HttpError(422, "RESUME_RENDER_FAILED", `简历图片渲染失败：${message}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
