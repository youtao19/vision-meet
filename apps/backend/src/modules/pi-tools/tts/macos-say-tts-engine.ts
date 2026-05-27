/**
 * 文件作用：macOS 本地 say 语音引擎，不依赖外部 TTS 服务。
 * 设计边界：只负责把文本合成为浏览器可播放的 m4a 文件。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import type { TtsEngine, TtsSynthesizeParams, TtsSynthesizeResult } from "./tts-engine.js";

const DEFAULT_VOICE = "Tingting";
const M4A_BIT_RATE = 48000;

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command.toUpperCase()}_FAILED:${code}:${stderr.trim()}`));
    });
  });
}

export class MacosSayTtsEngine implements TtsEngine {
  readonly audioFileExtension = "m4a";

  constructor(private readonly defaultVoice: string = DEFAULT_VOICE) {}

  async synthesize(params: TtsSynthesizeParams): Promise<TtsSynthesizeResult> {
    const voice = params.voice || this.defaultVoice;
    const tempAiffPath = path.join(
      os.tmpdir(),
      `career-agent-tts-${Date.now()}-${Math.random().toString(16).slice(2)}.aiff`,
    );

    await fs.promises.mkdir(path.dirname(params.outputPath), { recursive: true });

    try {
      await runCommand("say", ["-v", voice, "-o", tempAiffPath, params.text]);
      await runCommand("afconvert", ["-f", "m4af", "-d", "aac", tempAiffPath, params.outputPath]);
    } finally {
      await fs.promises.rm(tempAiffPath, { force: true });
    }

    const stat = await fs.promises.stat(params.outputPath);
    const durationMs = Math.round((stat.size * 8 * 1000) / M4A_BIT_RATE);

    return { audioPath: params.outputPath, durationMs };
  }
}
