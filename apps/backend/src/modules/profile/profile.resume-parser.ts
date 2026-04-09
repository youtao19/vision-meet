/**
 * 文件作用：把上传的简历文件解析为可供学生画像服务消费的纯文本。
 * 职责边界：只负责文件格式识别、系统工具调用与文本清洗；不负责姓名/技能/岗位等业务字段抽取。
 */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { HttpError } from "../../shared/errors/http-error.js";

const execFileAsync = promisify(execFile);

function normalizeResumePlainText(content: string): string {
  return content
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getResumeFileExtension(fileName: string): string {
  return path.extname(fileName).toLowerCase();
}

export function getResumeUploadExtension(fileName: string): string {
  return getResumeFileExtension(fileName);
}

export function isResumeImageExtension(extension: string): boolean {
  return [".png", ".jpg", ".jpeg", ".webp", ".bmp"].includes(extension.toLowerCase());
}

async function parseTextLikeResume(buffer: Buffer): Promise<string> {
  return normalizeResumePlainText(buffer.toString("utf-8"));
}

async function parsePdfResume(inputPath: string, outputPath: string): Promise<string> {
  await execFileAsync("pdftotext", ["-layout", "-enc", "UTF-8", inputPath, outputPath]);
  return normalizeResumePlainText(await readFile(outputPath, "utf-8"));
}

async function parseOfficeResume(inputPath: string, outputPath: string): Promise<string> {
  await execFileAsync("textutil", ["-convert", "txt", "-output", outputPath, inputPath]);
  return normalizeResumePlainText(await readFile(outputPath, "utf-8"));
}

/**
 * 作用：解析上传简历为纯文本。
 * 参数：
 * - fileName：原始文件名，用于识别扩展名。
 * - buffer：上传文件二进制内容。
 * 返回：清洗后的纯文本。
 * 注意：PDF / DOC / DOCX 会借助系统工具转换；若转换结果为空，则抛 422，避免继续生成误导性画像。
 */
export async function parseUploadedResumeToText(params: {
  fileName: string;
  buffer: Buffer;
}): Promise<string> {
  const extension = getResumeFileExtension(params.fileName);

  if (extension === ".txt" || extension === ".md") {
    return parseTextLikeResume(params.buffer);
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "career-agent-resume-"));
  const inputPath = path.join(tempDir, `resume${extension || ".bin"}`);
  const outputPath = path.join(tempDir, "resume.txt");

  try {
    await writeFile(inputPath, params.buffer);

    if (extension === ".pdf") {
      return await parsePdfResume(inputPath, outputPath);
    }

    if (extension === ".doc" || extension === ".docx") {
      return await parseOfficeResume(inputPath, outputPath);
    }

    return parseTextLikeResume(params.buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    throw new HttpError(
      422,
      "RESUME_PARSE_FAILED",
      `简历解析失败：暂无法读取该文件内容，请优先上传可复制文本的 PDF / DOCX / TXT / MD 文件（${message}）`,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
