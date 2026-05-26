import type { CodexAppServerConfig, CodexThreadResult } from "./codex-types.js";
import { CodexAppServerClient } from "./codex-client.js";

/**
 * 文件作用：用 Codex app-server 创建临时线程并等待生图结果。
 * 设计边界：只负责 thread/turn 协议编排，不参与图片文件保存。
 */

// 解析 thread/start 的响应，读取线程 id。
function readThreadId(response: unknown): string {
  if (!response || typeof response !== "object") {
    throw new Error("CODEX_THREAD_START_INVALID_RESPONSE");
  }
  const thread = (response as { thread?: { id?: unknown } }).thread;
  if (!thread || typeof thread.id !== "string" || !thread.id.trim()) {
    throw new Error("CODEX_THREAD_ID_MISSING");
  }
  return thread.id;
}

// 从 item/completed 事件中抽取成功的生图结果。
function readImageItem(
  message: unknown,
): { result: string | null; savedPath: string | null } | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const item = (message as { params?: { item?: unknown } }).params?.item;
  if (!item || typeof item !== "object") {
    return null;
  }
  const payload = item as {
    type?: unknown;
    result?: unknown;
    savedPath?: unknown;
    status?: unknown;
  };
  if (payload.type !== "imageGeneration" || payload.status === "failed") {
    return null;
  }
  return {
    result: typeof payload.result === "string" && payload.result.trim() ? payload.result : null,
    savedPath:
      typeof payload.savedPath === "string" && payload.savedPath.trim() ? payload.savedPath : null,
  };
}

/**
 * 作用：启动一次临时 Codex turn 并等待其中的 imageGeneration item。
 * 参数：config 为 app-server 连接配置；prompt 为生图任务提示词。
 * 返回：图片 base64 或 app-server 侧保存路径。
 */
export async function runCodexImageTurn(params: {
  config: CodexAppServerConfig;
  prompt: string;
}): Promise<CodexThreadResult> {
  // 每次调用都创建独立 client，避免跨调用复用状态。
  const client = new CodexAppServerClient(params.config);
  let imageBase64: string | null = null;
  let savedPath: string | null = null;

  try {
    await client.start();
    // 创建临时线程并启动一轮对话。
    const threadStart = await client.request("thread/start", {
      cwd: params.config.cwd,
      approvalPolicy: "never",
      sandbox: "read-only",
      model: params.config.model ?? null,
      ephemeral: true,
      threadSource: null,
    });
    const threadId = readThreadId(threadStart);

    await client.request("turn/start", {
      threadId,
      input: [
        {
          type: "text",
          text: params.prompt,
          text_elements: [],
        },
      ],
      cwd: params.config.cwd,
      approvalPolicy: "never",
      sandboxPolicy: { type: "readOnly", networkAccess: true },
      model: params.config.model ?? null,
      effort: "minimal",
      summary: "none",
    });

    while (true) {
      // 监听 item/completed 或 turn/completed，前者可能包含图片。
      const message = await client.waitForNotification((event) => {
        return event.method === "item/completed" || event.method === "turn/completed";
      });

      if (message.method === "item/completed") {
        const imageItem = readImageItem(message);
        if (imageItem) {
          imageBase64 = imageItem.result;
          savedPath = imageItem.savedPath;
        }
        continue;
      }

      return { imageBase64, savedPath };
    }
  } finally {
    client.stop();
  }
}
