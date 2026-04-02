import OpenAI from "openai";

import { appEnv } from "../shared/config/env.js";

/**
 * 文件作用：使用 Moonshot 官方文档推荐的 OpenAI SDK 方式验证 Kimi 连通性。
 * 职责边界：该脚本只负责验证“当前环境变量 + 官方 SDK 调用”是否能通过鉴权，
 * 不依赖任何业务 service，避免把供应商接入问题误判为业务链路问题。
 */

type CompletionChoice = {
  message?: {
    content?: string | null;
  };
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

function formatSdkError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const sdkError = error as {
      status?: number;
      message?: string;
      error?: { message?: string };
    };
    const detail = sdkError.error?.message || sdkError.message || "unknown error";

    return [
      `MOONSHOT_SDK_SMOKE_FAIL status=${sdkError.status ?? "unknown"}`,
      `detail=${detail}`,
      sdkError.status === 401
        ? "hint=官方 SDK 也返回 401，说明问题仍在 Moonshot 凭证或账号权限，而不是 HTTP 写法"
        : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return ["MOONSHOT_SDK_SMOKE_FAIL exception", `detail=${String(error)}`].join("\n");
}

/**
 * 使用官方 SDK 发起最小请求。
 * 参数：
 * - 无；统一从集中配置中读取 baseURL、apiKey、model 和 temperature。
 * 返回：
 * - 成功时在 stdout 打印模型回复片段，失败时设置非零退出码。
 * 注意：
 * - 该脚本只验证最小 chat/completions 能力，不覆盖工具调用、多模态或流式输出。
 */
async function main(): Promise<void> {
  const baseUrl = appEnv.LLM_BASE_URL;
  const apiKey = appEnv.LLM_API_KEY;
  const model = appEnv.LLM_MODEL;

  if (!baseUrl || !apiKey || !model) {
    console.error(
      [
        "MOONSHOT_SDK_SMOKE_FAIL missing_config",
        `base_url=${baseUrl || "<missing>"}`,
        `api_key=${maskApiKey(apiKey)}`,
        `model=${model || "<missing>"}`,
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    [
      "MOONSHOT_SDK_SMOKE_START",
      `base_url=${baseUrl.replace(/\/$/, "")}`,
      `model=${model}`,
      `temperature=${appEnv.LLM_TEMPERATURE}`,
      `api_key=${maskApiKey(apiKey)}`,
    ].join("\n"),
  );

  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout: appEnv.LLM_TIMEOUT_MS,
  });

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: 'Reply with exactly: {"ok":true}',
      },
    ],
    temperature: appEnv.LLM_TEMPERATURE,
    max_tokens: 64,
  });

  const firstChoice = response.choices[0] as CompletionChoice | undefined;

  console.log(
    [
      "MOONSHOT_SDK_CHAT_OK",
      `content=${firstChoice?.message?.content?.trim() || "<empty>"}`,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(formatSdkError(error));
  process.exitCode = 1;
});
