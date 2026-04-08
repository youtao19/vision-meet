import { createHash } from "node:crypto";

/**
 * 文件作用：提供可复现哈希工具，用于画像来源摘要和匹配输入指纹。
 * 关键约束：必须对对象键做稳定排序，避免 JS 对象遍历顺序导致同输入不同哈希。
 */

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | {
      [key: string]: JsonLike;
    };

function sortValue(value: unknown): JsonLike {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return entries.reduce<Record<string, JsonLike>>((acc, [key, nested]) => {
      acc[key] = sortValue(nested);
      return acc;
    }, {});
  }

  return String(value);
}

export function buildSha256Digest(value: unknown): string {
  const normalized = JSON.stringify(sortValue(value));
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * 生成匹配请求输入指纹。
 * 参数含义：
 * - payload: 匹配计算所需的稳定输入快照。
 * 返回值：sha256 十六进制字符串。
 */
export function createMatchFingerprint(payload: unknown): string {
  return buildSha256Digest(payload);
}
