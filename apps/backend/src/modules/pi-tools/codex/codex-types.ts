/**
 * 文件作用：定义 Codex app-server 生图客户端的内部类型。
 * 设计边界：这些类型只服务于后端实现，不进入前后端共享契约。
 */

// Codex app-server 的基础配置。
export type CodexAppServerConfig = {
  command: string;
  model?: string;
  timeoutMs: number;
  cwd: string;
};

// 生图输入参数。
export type CodexImageGenerationInput = {
  prompt: string;
  outputPath: string;
  cwd: string;
};

// 生图输出结果。
export type CodexImageGenerationOutput = {
  imagePath: string;
};

// 一轮 Codex 生成的结果载体。
export type CodexThreadResult = {
  imageBase64: string | null;
  savedPath: string | null;
};
