/**
 * 文件作用：定义 TTS 引擎抽象接口。
 * 设计边界：只约束输入输出，不耦合具体 TTS 实现。
 */

export type TtsSynthesizeResult = {
  audioPath: string;
  durationMs: number;
};

export type TtsSynthesizeParams = {
  text: string;
  outputPath: string;
  voice?: string;
};

export interface TtsEngine {
  audioFileExtension: string;
  synthesize(params: TtsSynthesizeParams): Promise<TtsSynthesizeResult>;
}
