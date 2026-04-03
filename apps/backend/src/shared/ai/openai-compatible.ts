/**
 * 文件作用：封装 OpenAI 兼容 Chat Completions 调用，供岗位画像与报告生成复用。
 * 设计边界：这里只负责请求协议和响应解析，不承载任何业务提示词。
 */

export type OpenAiCompatibleOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
};

export type OpenAiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionResult = {
  rawText: string;
  json?: unknown;
};

function withTrailingSlashRemoved(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  const direct = safeParseJson(trimmed);
  if (direct !== undefined) {
    return direct;
  }

  // 兼容模型返回 ```json ... ``` 的常见格式。
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!fenced) {
    return undefined;
  }

  return safeParseJson(fenced[1].trim());
}

/**
 * 调用 OpenAI 兼容接口并返回文本与可选 JSON 解析结果。
 * 注意：调用方应自行处理异常和降级策略，避免把模型波动直接透传到业务层。
 */
export async function chatCompletionJson(
  options: OpenAiCompatibleOptions,
  messages: OpenAiMessage[],
): Promise<ChatCompletionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);

  try {
    const endpoint = `${withTrailingSlashRemoved(options.baseUrl)}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM_REQUEST_FAILED:${response.status}:${text.slice(0, 240)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawText = payload.choices?.[0]?.message?.content?.trim() || "";

    return {
      rawText,
      json: extractJsonFromText(rawText),
    };
  } finally {
    clearTimeout(timeout);
  }
}
