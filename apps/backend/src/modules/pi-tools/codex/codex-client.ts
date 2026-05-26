import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

import type { CodexAppServerConfig } from "./codex-types.js";

/**
 * 文件作用：提供最小 JSON-RPC 客户端，用 stdio 连接 Codex app-server。
 * 设计边界：只负责协议收发、超时和进程生命周期，不理解岗位漫画业务。
 */

type JsonRpcMessage = {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export class CodexAppServerClient {
  // 通过 stdio JSON-RPC 运行的 Codex app-server 子进程。
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  // 以 id 为键的待响应请求，用于异步回包匹配。
  private readonly pending = new Map<number, PendingRequest>();
  // 未被消费的通知队列。
  private readonly notifications: JsonRpcMessage[] = [];
  private notificationWaiter: (() => void) | null = null;

  constructor(private readonly config: CodexAppServerConfig) {}

  /**
   * 作用：启动 Codex app-server 并完成 initialize 握手。
   * 返回：握手成功后 resolve。
   * 异常：app-server 启动失败、协议超时或 initialize 返回错误时抛出。
   */
  async start(): Promise<void> {
    this.child = spawn(this.config.command, ["app-server", "--listen", "stdio://"], {
      cwd: this.config.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // 进程退出时，拒绝所有未完成请求。
    this.child.once("exit", (code) => {
      const error = new Error(`CODEX_APP_SERVER_EXITED:${code ?? "signal"}`);
      for (const request of this.pending.values()) {
        request.reject(error);
      }
      this.pending.clear();
    });

    // 解析按行分隔的 JSON-RPC 响应/通知。
    readline.createInterface({ input: this.child.stdout }).on("line", (line) => {
      this.handleLine(line);
    });

    // 记录最近的 stderr，便于初始化失败定位。
    let stderr = "";
    this.child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 4000) {
        stderr = stderr.slice(-4000);
      }
    });

    try {
      await this.request("initialize", {
        clientInfo: {
          name: "career_agent",
          title: "Career Agent Backend",
          version: "0.1.0",
        },
        capabilities: null,
      });
      this.notify("initialized");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`CODEX_APP_SERVER_INIT_FAILED:${message}:${stderr.trim()}`);
    }
  }

  /**
   * 作用：发送 JSON-RPC 请求并等待同 id 响应。
   * 参数：method 为 app-server 方法名；params 为对应参数。
   * 返回：app-server 返回的 result。
   */
  async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload = { id, method, params };

    return new Promise((resolve, reject) => {
      // 为每个请求加超时，避免无限等待。
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CODEX_APP_SERVER_TIMEOUT:${method}:${this.config.timeoutMs}`));
      }, this.config.timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.write(payload);
    });
  }

  /**
   * 作用：发送无需响应的 JSON-RPC 通知。
   * 参数：method 为通知方法名。
   */
  notify(method: string): void {
    this.write({ method });
  }

  /**
   * 作用：等待满足条件的 app-server 通知。
   * 参数：predicate 用于筛选目标通知。
   * 返回：匹配到的通知消息。
   */
  async waitForNotification(
    predicate: (message: JsonRpcMessage) => boolean,
  ): Promise<JsonRpcMessage> {
    // 若已在队列中，直接返回匹配的通知。
    const existingIndex = this.notifications.findIndex(predicate);
    if (existingIndex >= 0) {
      return this.notifications.splice(existingIndex, 1)[0]!;
    }

    return new Promise((resolve, reject) => {
      // 通知等待超时，防止死等。
      const timer = setTimeout(() => {
        this.notificationWaiter = null;
        reject(new Error(`CODEX_APP_SERVER_NOTIFICATION_TIMEOUT:${this.config.timeoutMs}`));
      }, this.config.timeoutMs);

      this.notificationWaiter = () => {
        const index = this.notifications.findIndex(predicate);
        if (index >= 0) {
          clearTimeout(timer);
          this.notificationWaiter = null;
          resolve(this.notifications.splice(index, 1)[0]!);
        }
      };
    });
  }

  /**
   * 作用：停止当前 app-server 子进程。
   */
  stop(): void {
    this.child?.kill("SIGTERM");
    this.child = null;
  }

  private handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
      return;
    }

    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || `CODEX_APP_SERVER_ERROR:${message.id}`));
        return;
      }
      pending.resolve(message.result);
      return;
    }

    // 其他消息视为通知，进入队列等待消费。
    this.notifications.push(message);
    this.notificationWaiter?.();
  }

  private write(payload: unknown): void {
    if (!this.child) {
      throw new Error("CODEX_APP_SERVER_NOT_STARTED");
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}
