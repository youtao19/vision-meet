import fs from "node:fs/promises";

import type {
  CodexAppServerConfig,
  CodexImageGenerationInput,
  CodexImageGenerationOutput,
} from "./codex-types.js";
import { runCodexImageTurn } from "./codex-thread.js";

/**
 * 文件作用：把 Codex app-server 生图结果保存成岗位漫画本地文件。
 * 设计边界：只处理图片结果落盘，不拼装岗位画像 prompt。
 */

// 兼容 data URL 与纯 base64 字符串的输入。
function normalizeBase64Image(raw: string): Buffer {
  const base64 = raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
  return Buffer.from(base64, "base64");
}

/**
 * 作用：调用 Codex app-server 生图并写入目标文件。
 * 参数：input 提供 prompt、输出路径和运行目录；config 提供 app-server 参数。
 * 返回：写入后的图片路径。
 */
export async function generateImageWithCodexAppServer(
  input: CodexImageGenerationInput,
  config: CodexAppServerConfig,
): Promise<CodexImageGenerationOutput> {
  // 拼装给 Codex 的单轮提示词，只允许生图。
  const turnPrompt = [
    "请只使用 Codex 的生图能力生成一张图片，不要修改代码或运行命令。",
    "图片生成完成后，最终回答只需要说明生成完成。",
    "图片提示词如下：",
    input.prompt,
  ].join("\n");

  // 走 Codex app-server 的一轮图片生成。
  const result = await runCodexImageTurn({
    config: {
      ...config,
      cwd: input.cwd,
    },
    prompt: turnPrompt,
  });

  // 优先处理直接返回的 base64 图片。
  if (result.imageBase64) {
    await fs.writeFile(input.outputPath, normalizeBase64Image(result.imageBase64));
    return { imagePath: input.outputPath };
  }

  // 兜底处理已落盘的图片路径。
  if (result.savedPath) {
    await fs.copyFile(result.savedPath, input.outputPath);
    return { imagePath: input.outputPath };
  }

  throw new Error("CODEX_IMAGE_GENERATION_EMPTY_RESULT");
}
