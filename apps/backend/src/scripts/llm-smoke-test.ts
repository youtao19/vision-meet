import { appEnv } from "../shared/config/env.js";

function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

function parseErrorMessage(rawText: string): string | null {
  try {
    const parsed = JSON.parse(rawText) as {
      error?: { message?: string };
      message?: string;
    };

    return parsed.error?.message || parsed.message || null;
  } catch {
    return rawText.trim() || null;
  }
}

function getFriendlyErrorMessage(status: number, rawText: string): string {
  const detail = parseErrorMessage(rawText);

  if (status === 401) {
    return [
      "LLM_FAIL：鉴权失败（401）。",
      "请检查 apps/backend/.env 中的 LLM_API_KEY 是否是 Kimi/Moonshot 开放平台生成的有效 API Key。",
      detail ? `接口返回：${detail}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (status === 429) {
    return [
      "LLM_FAIL：请求被限流或额度不足（429）。",
      "请检查账号额度、计费状态，或稍后重试。",
      detail ? `接口返回：${detail}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (status >= 500) {
    return [
      `LLM_FAIL：模型服务异常（${status}）。`,
      "通常是上游暂时不可用，可以稍后重试。",
      detail ? `接口返回：${detail}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `LLM_FAIL：请求失败（${status}）。`,
    detail ? `接口返回：${detail}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

async function main(): Promise<void> {
  const baseUrl = appEnv.LLM_BASE_URL;
  const apiKey = appEnv.LLM_API_KEY;
  const model = appEnv.LLM_MODEL;

  if (!baseUrl) {
    fail("LLM_FAIL：缺少 LLM_BASE_URL，请检查 apps/backend/.env 配置。");
    return;
  }

  if (!apiKey) {
    fail("LLM_FAIL：缺少 LLM_API_KEY，请检查 apps/backend/.env 配置。");
    return;
  }

  if (!model) {
    fail("LLM_FAIL：缺少 LLM_MODEL，请检查 apps/backend/.env 配置。");
    return;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: 'Reply with exactly: {"ok":true}',
          },
        ],
        temperature: appEnv.LLM_TEMPERATURE,
        max_tokens: 64,
      }),
      signal: AbortSignal.timeout(appEnv.LLM_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`LLM_FAIL：无法连接模型服务。\n请检查网络、LLM_BASE_URL，或稍后重试。\n底层错误：${message}`);
    return;
  }

  const rawText = await response.text();

  if (!response.ok) {
    fail(getFriendlyErrorMessage(response.status, rawText));
    return;
  }

  console.log("LLM_OK");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(`LLM_FAIL：自检脚本执行失败。\n${message}`);
});
