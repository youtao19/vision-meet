/**
 * 文件作用：将岗位画像转换为四格漫画生成任务。
 * 职责边界：只负责 prompt 组织、本地文件路径规划和调用 baoyu-imagine，不参与岗位画像读写。
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import type { ManualJobPortraitRecord } from "@career/contracts/types";

import type { AppEnv } from "../../shared/config/env.js";

const BAOYU_IMAGINE_TIMEOUT_MS = 180000;

export type JobPortraitComicGenerationResult = {
  imageUrl: string;
  imagePath: string;
};

function resolveBaoyuImagineScript(env: AppEnv): string {
  return (
    env.BAOYU_IMAGINE_SCRIPT ||
    path.join(os.homedir(), ".codex", "skills", "baoyu-imagine", "scripts", "main.ts")
  );
}

function resolveBunCommand(): { command: string; argsPrefix: string[] } {
  const bunCheck = spawnSync("bun", ["--version"], { stdio: "ignore" });
  if (bunCheck.status === 0) {
    return { command: "bun", argsPrefix: [] };
  }
  return { command: "npx", argsPrefix: ["-y", "bun"] };
}

function toSafeFileStem(jobName: string): string {
  const normalized = jobName
    .toLowerCase()
    .replaceAll(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 40);
  const hash = createHash("sha1").update(jobName).digest("hex").slice(0, 10);
  return `${normalized || "job"}-${hash}`;
}

function formatDimension(
  title: string,
  dimension: { level: number; weight: number; description: string },
): string {
  return `${title}：L${dimension.level}，权重 ${dimension.weight}，${dimension.description}`;
}

/**
 * 作用：把结构化岗位画像压缩成稳定的四格漫画 prompt。
 * 参数：portrait 为人工岗位画像记录。
 * 返回：可直接交给 baoyu-imagine 的中文图片生成提示词。
 * 注意：MVP 固定单张 2x2，不生成角色设定表和多页分镜。
 */
export function buildJobPortraitComicPrompt(portrait: ManualJobPortraitRecord): string {
  const dimensionLines = [
    formatDimension("技能能力", portrait.skills),
    formatDimension("资质要求", portrait.certification),
    formatDimension("创新能力", portrait.innovation),
    formatDimension("学习能力", portrait.learning),
    formatDimension("抗压能力", portrait.stress),
    formatDimension("沟通能力", portrait.communication),
    formatDimension("经验要求", portrait.experience),
  ];

  return [
    "请生成一张单页 2×2 四格漫画，主题是“岗位画像漫画”。",
    "整体风格：简洁黑白线稿、清晰黑色描边、白色背景，只用少量蓝色作为强调色；不要复杂背景，不要写实照片。",
    "画面要求：严格四个格子，不能多格，不能少格；每格只放 1-2 句简短中文对白或标签，文字必须清晰可读。",
    `岗位名称：${portrait.job_name}`,
    `岗位分类：${portrait.category}`,
    "岗位画像维度：",
    ...dimensionLines,
    "四格剧情：",
    "第 1 格（起）：一名学生第一次看到这个岗位，面前出现岗位名称卡片。",
    "第 2 格（承）：学生翻开技能清单，看到核心技能和资质要求，关键技能用蓝色高亮。",
    "第 3 格（转）：学生发现真正拉开差距的是学习、沟通、抗压或创新等成长能力，出现一个醒目的 aha 时刻。",
    "第 4 格（合）：学生整理行动计划，朝岗位目标前进，画面传达“看懂岗位，补齐能力”。",
    "输出必须是一张完整漫画图片，不要生成说明文字、不要生成封面、不要生成 PDF。",
  ].join("\n");
}

function runBaoyuImagine(params: {
  env: AppEnv;
  prompt: string;
  imagePath: string;
  cwd: string;
}): Promise<void> {
  const scriptPath = resolveBaoyuImagineScript(params.env);
  if (!existsSync(scriptPath)) {
    throw new Error(`BAOYU_IMAGINE_SCRIPT_NOT_FOUND:${scriptPath}`);
  }

  const runtime = resolveBunCommand();
  const args = [
    ...runtime.argsPrefix,
    scriptPath,
    "--prompt",
    params.prompt,
    "--image",
    params.imagePath,
    "--ar",
    "4:3",
    "--quality",
    "normal",
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(runtime.command, args, {
      cwd: params.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`BAOYU_IMAGINE_TIMEOUT:${BAOYU_IMAGINE_TIMEOUT_MS}`));
    }, BAOYU_IMAGINE_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n").slice(0, 1000);
      reject(new Error(`BAOYU_IMAGINE_FAILED:${code}:${detail}`));
    });
  });
}

/**
 * 作用：调用 baoyu-imagine 为岗位画像生成并保存漫画图片。
 * 参数：portrait 为画像数据；env 提供输出目录和可选脚本路径；force 表示是否覆盖已存在图片。
 * 返回：本地静态资源 URL 与绝对路径。
 * 注意：MVP 采用同步等待，调用失败直接把错误抛给 HTTP 层。
 */
export async function generateJobPortraitComicImage(params: {
  portrait: ManualJobPortraitRecord;
  env: AppEnv;
  force: boolean;
  cwd: string;
}): Promise<JobPortraitComicGenerationResult> {
  const fileStem = toSafeFileStem(params.portrait.job_name);
  const imagePath = path.join(params.env.JOB_COMIC_OUTPUT_DIR, `${fileStem}.png`);
  const imageUrl = `/assets/job-comics/${fileStem}.png`;

  if (!params.force && existsSync(imagePath)) {
    return { imagePath, imageUrl };
  }

  await fs.mkdir(params.env.JOB_COMIC_OUTPUT_DIR, { recursive: true });
  await runBaoyuImagine({
    env: params.env,
    prompt: buildJobPortraitComicPrompt(params.portrait),
    imagePath,
    cwd: params.cwd,
  });

  return { imagePath, imageUrl };
}
