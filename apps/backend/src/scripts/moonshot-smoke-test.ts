import { appEnv } from "../shared/config/env.js";

/**
 * 文件作用：提供独立于业务链路的 Moonshot/Kimi 连通性自检脚本。
 * 使用场景：当 agent 或报告链路怀疑被模型配置阻塞时，优先运行该脚本快速定位
 * “环境变量 / 鉴权 / 端点 / 模型名” 是否可用，而不是先排查业务代码。
 */

type ParsedErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
  };
  message?: string;
};

function maskApiKey(value: string | undefined): string {
  if (!value) {
    return "<missing>";
  }

  if (value.length <= 12) {
    return "***";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function parseErrorText(rawText: string): ParsedErrorPayload | null {
  try {
    return JSON.parse(rawText) as ParsedErrorPayload;
  } catch {
    return null;
  }
}

function formatError(status: number, rawText: string): string {
  const payload = parseErrorText(rawText);
  const detail = payload?.error?.message || payload?.message || rawText.trim() || "unknown error";

  return [
    `MOONSHOT_SMOKE_FAIL status=${status}`,
    `detail=${detail}`,
    status === 401
      ? "hint=请检查 key 是否来自 Moonshot 开放平台，且与当前 .ai/.cn 端点匹配"
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

async function requestWithReport(params: {
  url: string;
  apiKey: string;
  body?: Record<string, unknown>;
}): Promise<{ status: number; text: string }> {
  const response = await fetch(params.url, {
    method: params.body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      ...(params.body ? { "Content-Type": "application/json" } : {}),
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
    signal: AbortSignal.timeout(appEnv.LLM_TIMEOUT_MS),
  });

  return {
    status: response.status,
    text: await response.text(),
  };
}

async function main(): Promise<void> {
  const baseUrl = appEnv.LLM_BASE_URL;
  const apiKey = appEnv.LLM_API_KEY;
  const model = appEnv.LLM_MODEL;

  if (!baseUrl || !apiKey || !model) {
    console.error(
      [
        "MOONSHOT_SMOKE_FAIL missing_config",
        `base_url=${baseUrl || "<missing>"}`,
        `api_key=${maskApiKey(apiKey)}`,
        `model=${model || "<missing>"}`,
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  console.log(
    [
      "MOONSHOT_SMOKE_START",
      `base_url=${normalizedBaseUrl}`,
      `model=${model}`,
      `temperature=${appEnv.LLM_TEMPERATURE}`,
      `api_key=${maskApiKey(apiKey)}`,
    ].join("\n"),
  );

  const modelsCheck = await requestWithReport({
    url: `${normalizedBaseUrl}/models`,
    apiKey,
  });

  if (modelsCheck.status !== 200) {
    console.error(formatError(modelsCheck.status, modelsCheck.text));
    process.exitCode = 1;
    return;
  }

  console.log("MOONSHOT_MODELS_OK");

  const completionCheck = await requestWithReport({
    url: `${normalizedBaseUrl}/chat/completions`,
    apiKey,
    body: {
      model,
      messages: [
        {
          role: "user",
          content: 'Reply with exactly: {"ok":true}',
        },
      ],
      temperature: appEnv.LLM_TEMPERATURE,
      max_tokens: 64,
    },
  });

  if (completionCheck.status !== 200) {
    console.error(formatError(completionCheck.status, completionCheck.text));
    process.exitCode = 1;
    return;
  }

  console.log("MOONSHOT_CHAT_OK");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(["MOONSHOT_SMOKE_FAIL exception", `detail=${message}`].join("\n"));
  process.exitCode = 1;
});
