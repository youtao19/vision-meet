/**
 * 文件作用：根据配置创建 TTS 引擎实例。
 * 设计边界：只负责引擎选择和实例化，不参与合成调用。
 */

import type { TtsEngine } from "./tts-engine.js";
import { MacosSayTtsEngine } from "./macos-say-tts-engine.js";
import { VolcengineTtsEngine } from "./volcengine-tts-engine.js";

export type TtsEngineType = "volcengine" | "say";

export type TtsFactoryOptions = {
  engine?: TtsEngineType;
  voice?: string;
  volcengineAppId?: string;
  volcengineAccessToken?: string;
  volcengineCluster?: string;
};

export function createTtsEngine(options: TtsFactoryOptions = {}): TtsEngine {
  const engineType = options.engine ?? "say";

  switch (engineType) {
    case "volcengine":
      return new VolcengineTtsEngine({
        appId: options.volcengineAppId,
        accessToken: options.volcengineAccessToken,
        cluster: options.volcengineCluster,
        voice: options.voice,
      });
    case "say":
      return new MacosSayTtsEngine(options.voice);
    default:
      throw new Error(`UNSUPPORTED_TTS_ENGINE:${engineType}`);
  }
}
