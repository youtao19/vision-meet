/**
 * 文件作用：提供 Pi 运行时的公共辅助函数。
 * 设计边界：这里只放纯工具函数，不依赖任何业务模块，可被 ai/ 和 pi-tools/ 安全引用。
 */

export function summarizeAssistantMessage(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((item) => {
      if (typeof item === "string") {
        return [item];
      }

      if (!item || typeof item !== "object") {
        return [];
      }

      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? [text] : [];
    })
    .join("\n")
    .trim();
}

export function readStringParam(params: unknown, key: string): string | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export function readBooleanParam(params: unknown, key: string): boolean | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const value = (params as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

export function readIntegerParam(params: unknown, key: string): number | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const value = (params as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}
