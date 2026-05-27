/**
 * 文件作用：火山引擎语音合成实现。
 * 设计边界：只负责把文本合成为浏览器可播放的 mp3 文件。
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { TtsEngine, TtsSynthesizeParams, TtsSynthesizeResult } from "./tts-engine.js";

const VOLCENGINE_TTS_URL = "https://openspeech.bytedance.com/api/v1/tts";
const DEFAULT_CLUSTER = "volcano_tts";
const DEFAULT_VOICE = "zh_female_shuangkuaisisi_moon_bigtts";
const MP3_BIT_RATE = 48000;

export type VolcengineTtsEngineOptions = {
  appId?: string;
  accessToken?: string;
  cluster?: string;
  voice?: string;
};

type VolcengineTtsResponse = {
  code?: number;
  message?: string;
  data?: string;
  addition?: {
    duration?: string;
  };
};

function resolveDurationMs(response: VolcengineTtsResponse, fileSizeBytes: number): number {
  const durationSeconds = Number(response.addition?.duration);
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return Math.round(durationSeconds * 1000);
  }
  return Math.round((fileSizeBytes * 8 * 1000) / MP3_BIT_RATE);
}

export class VolcengineTtsEngine implements TtsEngine {
  readonly audioFileExtension = "mp3";

  constructor(private readonly options: VolcengineTtsEngineOptions) {}

  async synthesize(params: TtsSynthesizeParams): Promise<TtsSynthesizeResult> {
    const appId = this.options.appId;
    const accessToken = this.options.accessToken;
    if (!appId || !accessToken) {
      throw new Error("VOLCENGINE_TTS_CONFIG_MISSING");
    }

    const response = await fetch(VOLCENGINE_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer;${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app: {
          appid: appId,
          token: accessToken,
          cluster: this.options.cluster || DEFAULT_CLUSTER,
        },
        user: {
          uid: "career-agent",
        },
        audio: {
          voice_type: params.voice || this.options.voice || DEFAULT_VOICE,
          encoding: "mp3",
          speed_ratio: 1,
          volume_ratio: 1,
          pitch_ratio: 1,
        },
        request: {
          reqid: randomUUID(),
          text: params.text,
          text_type: "plain",
          operation: "query",
        },
      }),
    });

    const payload = (await response.json().catch(() => null)) as VolcengineTtsResponse | null;
    if (!response.ok || !payload || payload.code !== 3000 || !payload.data) {
      throw new Error(
        `VOLCENGINE_TTS_FAILED:status=${response.status}:code=${payload?.code ?? "UNKNOWN"}:message=${
          payload?.message ?? response.statusText
        }`,
      );
    }

    const audio = Buffer.from(payload.data, "base64");
    await fs.promises.mkdir(path.dirname(params.outputPath), { recursive: true });
    await fs.promises.writeFile(params.outputPath, audio);

    return {
      audioPath: params.outputPath,
      durationMs: resolveDurationMs(payload, audio.byteLength),
    };
  }
}
