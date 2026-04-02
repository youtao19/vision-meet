import { z } from "zod";

import {
  createUnavailableLlmClient,
  LlmClientError,
  type LlmClient,
  type LlmMessage,
  type StructuredCompletionInput,
} from "./llm-client.js";

const chatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.union([
            z.string(),
            z.array(
              z.object({
                type: z.string().optional(),
                text: z.string().optional(),
              }),
            ),
          ]),
        }),
      }),
    )
    .min(1),
});

type OpenAiCompatibleLlmClientOptions = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
  temperature: number;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function normalizeModel(model: string): string {
  return model.startsWith("moonshot/") ? model.slice("moonshot/".length) : model;
}

function extractContentText(content: string | Array<{ text?: string }>): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((item) => item.text?.trim() || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new LlmClientError("LLM_INVALID_RESPONSE", "模型返回内容为空");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new LlmClientError("LLM_INVALID_RESPONSE", "模型返回中未找到合法 JSON 对象", trimmed);
}

/**
 * 文件作用：实现兼容 OpenAI Chat Completions 协议的最小客户端。
 * 设计取舍：统一走 JSON 文本约束而不绑定某家 SDK，方便后续切换兼容网关。
 */
class OpenAiCompatibleLlmClient implements LlmClient {
  readonly model: string;

  private readonly baseUrl: string;

  private readonly apiKey: string;

  private readonly timeoutMs: number;

  private readonly temperature: number;

  constructor(options: {
    baseUrl: string;
    apiKey: string;
    model: string;
    timeoutMs: number;
    temperature: number;
  }) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.apiKey = options.apiKey;
    this.model = normalizeModel(options.model);
    this.timeoutMs = options.timeoutMs;
    this.temperature = options.temperature;
  }

  isConfigured(): boolean {
    return true;
  }

  async completeStructuredJson<T>(input: StructuredCompletionInput): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: input.messages.map((message: LlmMessage) => ({
            role: message.role,
            content: message.content,
          })),
          temperature: input.temperature ?? this.temperature,
          max_tokens: input.maxTokens ?? 1600,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new LlmClientError("LLM_TIMEOUT", "模型请求超时", error.message);
      }

      throw new LlmClientError("LLM_HTTP_ERROR", "模型请求失败", error);
    }

    const rawText = await response.text();
    if (!response.ok) {
      throw new LlmClientError("LLM_HTTP_ERROR", "模型接口返回异常状态", {
        status: response.status,
        body: rawText,
      });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText) as unknown;
    } catch {
      throw new LlmClientError("LLM_INVALID_RESPONSE", "模型接口返回了非 JSON 响应", rawText);
    }

    const parsedResponse = chatCompletionResponseSchema.safeParse(parsedJson);
    if (!parsedResponse.success) {
      throw new LlmClientError(
        "LLM_INVALID_RESPONSE",
        "模型接口响应结构不符合预期",
        parsedResponse.error.flatten(),
      );
    }

    const content = extractContentText(parsedResponse.data.choices[0].message.content);
    const jsonPayload = extractJsonObject(content);

    try {
      return JSON.parse(jsonPayload) as T;
    } catch (error) {
      throw new LlmClientError("LLM_INVALID_RESPONSE", "模型返回的 JSON 无法解析", {
        error: error instanceof Error ? error.message : String(error),
        raw: jsonPayload,
      });
    }
  }
}

export function createOpenAiCompatibleLlmClient(
  options: OpenAiCompatibleLlmClientOptions,
): LlmClient {
  if (!options.baseUrl || !options.apiKey || !options.model) {
    return createUnavailableLlmClient();
  }

    return new OpenAiCompatibleLlmClient({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      model: options.model,
      timeoutMs: options.timeoutMs,
      temperature: options.temperature,
    });
}
