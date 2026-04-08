/**
 * 文件作用：统一管理项目内 Pi Agent 目录的初始化、兼容迁移与旧版 OpenClaw 凭证导入。
 * 职责边界：这里只处理文件级配置引导，不负责创建会话、选择模型或执行业务逻辑。
 * 依赖关系：AI 运行时、岗位画像流水线、自检脚本和认证初始化脚本都应复用本文件。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type PiApiKeyCredential = {
  type: "api_key";
  key: string;
};

type PiOAuthCredential = {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
};

type PiAuthFile = Record<string, PiApiKeyCredential | PiOAuthCredential | unknown>;

type OpenClawAuthProfileCredential = {
  type?: string;
  provider?: string;
  key?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  accountId?: string;
};

type OpenClawAuthProfileStore = {
  profiles?: Record<string, OpenClawAuthProfileCredential | unknown>;
};

/**
 * 作用：返回 Career Agent 默认使用的独立 Agent 目录。
 * 参数：无。
 * 返回：独立 Agent 目录绝对路径。
 */
export function resolveDefaultPiAgentDir(): string {
  return path.join(os.homedir(), ".career-agent", "pi-agent");
}

/**
 * 作用：返回官方 Pi CLI/SDK 的标准配置目录。
 * 参数：无。
 * 返回：标准 Pi 目录绝对路径。
 */
export function resolveStandardPiAgentDir(): string {
  return path.join(os.homedir(), ".pi", "agent");
}

/**
 * 作用：返回旧版 OpenClaw 主智能体的 agentDir。
 * 参数：无。
 * 返回：OpenClaw 主智能体 agentDir 绝对路径。
 */
export function resolveLegacyCompatibleAgentDir(): string {
  return path.join(os.homedir(), ".openclaw", "agents", "main", "agent");
}

/**
 * 作用：返回旧版 OpenClaw 主智能体的认证配置文件路径。
 * 参数：无。
 * 返回：`auth-profiles.json` 绝对路径。
 */
export function resolveLegacyOpenClawAuthProfilesPath(): string {
  return path.join(resolveLegacyCompatibleAgentDir(), "auth-profiles.json");
}

/**
 * 作用：确保目录存在。
 * 参数：dirPath 为目标目录。
 * 返回：无。
 */
export function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 作用：安全读取 JSON 文件；文件不存在或为空时返回兜底值。
 * 参数：filePath 为目标文件路径；fallback 为默认值。
 * 返回：解析结果或 fallback。
 * 注意：若文件存在但 JSON 非法，则直接抛错，让配置损坏尽早暴露。
 */
function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return fallback;
  }

  return JSON.parse(raw) as T;
}

/**
 * 作用：写入 JSON 文件并收紧权限。
 * 参数：filePath 为目标路径；value 为要写入的对象。
 * 返回：无。
 */
function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.chmodSync(filePath, 0o600);
}

/**
 * 作用：读取 OpenClaw 主智能体的认证配置。
 * 参数：无。
 * 返回：认证配置对象；若文件不存在则返回 null。
 */
function readLegacyOpenClawAuthProfileStore(): OpenClawAuthProfileStore | null {
  const authProfilesPath = resolveLegacyOpenClawAuthProfilesPath();
  if (!fs.existsSync(authProfilesPath)) {
    return null;
  }

  return readJsonFile<OpenClawAuthProfileStore>(authProfilesPath, {});
}

/**
 * 作用：从 OpenClaw 认证配置中提取指定 provider 的 API key。
 * 参数：provider 为目标 provider，例如 `moonshot`、`kimi-coding`。
 * 返回：匹配到的 API key；若不存在则返回 undefined。
 * 注意：优先取 `provider:default`，否则回退到第一个匹配到的 API key profile。
 */
export function resolveLegacyOpenClawApiKey(provider: string): string | undefined {
  const store = readLegacyOpenClawAuthProfileStore();
  const profiles = store?.profiles;
  if (!profiles) {
    return undefined;
  }

  const defaultProfile = profiles[`${provider}:default`];
  if (
    defaultProfile &&
    typeof defaultProfile === "object" &&
    (defaultProfile as OpenClawAuthProfileCredential).type === "api_key"
  ) {
    const key = (defaultProfile as OpenClawAuthProfileCredential).key?.trim();
    if (key) {
      return key;
    }
  }

  for (const value of Object.values(profiles)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const credential = value as OpenClawAuthProfileCredential;
    if (credential.type !== "api_key" || credential.provider !== provider) {
      continue;
    }
    const key = credential.key?.trim();
    if (key) {
      return key;
    }
  }

  return undefined;
}

/**
 * 作用：把 OpenClaw 的 `auth-profiles.json` 中可直接迁移的凭证转换为 Pi `auth.json`。
 * 参数：targetAuthPath 为项目 Agent 目录下的 `auth.json` 路径。
 * 返回：是否发生了实际写入。
 * 注意：
 * 1. 只补齐当前 `auth.json` 中缺失的 provider，不覆盖已有项目配置。
 * 2. 仅迁移 Pi 可直接识别的 API key / OAuth 字段，忽略 OpenClaw 自有统计元数据。
 */
function importLegacyOpenClawAuthProfiles(targetAuthPath: string): boolean {
  const store = readLegacyOpenClawAuthProfileStore();
  const profiles = store?.profiles;
  if (!profiles) {
    return false;
  }

  const currentAuth = readJsonFile<PiAuthFile>(targetAuthPath, {});
  let changed = false;

  for (const value of Object.values(profiles)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const credential = value as OpenClawAuthProfileCredential;
    const provider = credential.provider?.trim();
    if (!provider || currentAuth[provider]) {
      continue;
    }

    if (credential.type === "api_key" && credential.key?.trim()) {
      currentAuth[provider] = {
        type: "api_key",
        key: credential.key.trim(),
      } satisfies PiApiKeyCredential;
      changed = true;
      continue;
    }

    if (
      credential.type === "oauth" &&
      credential.access?.trim() &&
      credential.refresh?.trim() &&
      typeof credential.expires === "number"
    ) {
      currentAuth[provider] = {
        type: "oauth",
        access: credential.access.trim(),
        refresh: credential.refresh.trim(),
        expires: credential.expires,
        accountId: credential.accountId?.trim() || undefined,
      } satisfies PiOAuthCredential;
      changed = true;
    }
  }

  if (changed) {
    writeJsonFile(targetAuthPath, currentAuth);
  }

  return changed;
}

/**
 * 作用：补齐当前项目独立 Agent 目录中的认证与模型配置，并兼容导入旧版 OpenClaw 凭证。
 * 参数：targetAgentDir 为当前项目 Agent 主目录。
 * 返回：无。
 * 注意：
 * 1. 优先从标准 Pi 目录复制 `auth.json/models.json`。
 * 2. 若目标目录已有空的 `auth.json`，仍会尝试从 OpenClaw 的 `auth-profiles.json` 导入 provider 凭证。
 * 3. OpenClaw 旧目录没有 `auth.json`，因此这里必须显式做结构转换。
 */
export function ensureCompatibleAgentBootstrap(targetAgentDir: string): void {
  ensureDirectory(targetAgentDir);

  const compatibleFiles = ["auth.json", "models.json"] as const;
  const candidateSourceDirs = [resolveStandardPiAgentDir(), resolveLegacyCompatibleAgentDir()];

  for (const fileName of compatibleFiles) {
    const targetPath = path.join(targetAgentDir, fileName);
    if (fs.existsSync(targetPath)) {
      continue;
    }

    for (const sourceDir of candidateSourceDirs) {
      if (!fs.existsSync(sourceDir)) {
        continue;
      }

      const sourcePath = path.join(sourceDir, fileName);
      if (!fs.existsSync(sourcePath)) {
        continue;
      }

      fs.copyFileSync(sourcePath, targetPath);
      fs.chmodSync(targetPath, 0o600);
      break;
    }
  }

  importLegacyOpenClawAuthProfiles(path.join(targetAgentDir, "auth.json"));
}
