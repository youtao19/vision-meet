/**
 * 文件作用：定义后端统一使用的大模型客户端抽象。
 * 设计边界：业务模块只依赖这里暴露的能力，不直接感知具体厂商协议。
 */

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type StructuredCompletionInput = {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
};

export class LlmClientError extends Error {
  readonly code: "LLM_NOT_CONFIGURED" | "LLM_TIMEOUT" | "LLM_HTTP_ERROR" | "LLM_INVALID_RESPONSE";
  readonly detail?: unknown;

  constructor(
    code: "LLM_NOT_CONFIGURED" | "LLM_TIMEOUT" | "LLM_HTTP_ERROR" | "LLM_INVALID_RESPONSE",
    message: string,
    detail?: unknown,
  ) {
    super(message);
    this.name = "LlmClientError";
    this.code = code;
    this.detail = detail;
  }
}

export interface LlmClient {
  readonly model: string | null;
  isConfigured(): boolean;
  completeStructuredJson<T>(input: StructuredCompletionInput): Promise<T>;
}

/**
 * 文件作用：提供一个显式的“未配置”实现。
 * 使用场景：让调用方可以统一依赖 LlmClient 接口，并在运行时决定是否报错或降级。
 */
export function createUnavailableLlmClient(): LlmClient {
  return {
    model: null,
    isConfigured(): boolean {
      return false;
    },
    async completeStructuredJson(): Promise<never> {
      throw new LlmClientError("LLM_NOT_CONFIGURED", "当前环境未配置可用的大模型客户端");
    },
  };
}
