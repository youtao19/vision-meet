/**
 * 文件作用：提供项目级 Pi Agent 登录、模型切换和认证状态检查入口。
 * 职责边界：本脚本只管理本项目独立 Agent 目录和本地 .env 的 AGENT_MODEL，不执行业务任务。
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

import {
  ensureCompatibleAgentBootstrap,
  ensureDirectory,
  resolveDefaultPiAgentDir,
} from "../shared/agent/agent-bootstrap.js";
import { appEnv } from "../shared/config/env.js";
import { resolveRepositoryRoot } from "../shared/utils/repository-root.js";

type AuthCredential = {
  type?: string;
};

type AuthFile = Record<string, AuthCredential | unknown>;

type ParsedArgs = {
  command: string;
  values: string[];
  model?: string;
  smoke: boolean;
};

/**
 * 解析命令行参数。
 * 逻辑：第一个位置参数作为命令，其余位置参数作为命令值；--model 用于登录后顺手切换模型，--smoke 用于切换后自检。
 */
function parseArgs(argv: string[]): ParsedArgs {
  const values: string[] = [];
  let model: string | undefined;
  let smoke = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--model") {
      model = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--smoke") {
      smoke = true;
      continue;
    }
    values.push(arg);
  }

  return {
    command: values[0] || "help",
    values: values.slice(1),
    model,
    smoke,
  };
}

/**
 * 打印傻瓜式使用说明。
 * 逻辑：只保留最常用的登录、切换、查看和自检命令，减少用户记忆负担。
 */
function printHelp(): void {
  console.log(`Career Agent Pi 登录配置

常用命令：
  npm run agent:auth -- status
  npm run agent:auth -- list
  npm run agent:auth -- models codex
  npm run agent:auth -- login openai-codex --model openai-codex/gpt-5.4
  npm run agent:auth -- switch kimi-coding/k2p5
  npm run agent:smoke

说明：
  login  使用 Pi 支持的 OAuth 登录方式，凭证写入本项目 Agent 目录
  switch 只切换 apps/backend/.env 里的 AGENT_MODEL
  models 用 Pi 当前模型注册表搜索 provider/model
`);
}

/**
 * 运行外部命令。
 * 逻辑：默认继承终端输入输出，适配 pi-ai 的浏览器登录和验证码交互流程。
 */
function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

/**
 * 读取 JSON 文件。
 * 逻辑：文件不存在或为空时返回兜底值；文件存在但 JSON 损坏时直接暴露错误。
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
 * 解析 provider/model 格式。
 * 逻辑：系统运行时只接受 provider/model，脚本也保持同一约束，避免切换后 smoke 才暴露格式错误。
 */
function parseModelRef(modelRef: string): { provider: string; modelId: string; raw: string } {
  const normalized = modelRef.trim();
  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0 || slashIndex === normalized.length - 1) {
    throw new Error(
      "模型必须采用 provider/model 格式，例如 openai-codex/gpt-5.4 或 kimi-coding/k2p5",
    );
  }
  return {
    provider: normalized.slice(0, slashIndex),
    modelId: normalized.slice(slashIndex + 1),
    raw: normalized,
  };
}

/**
 * 更新 .env 中的 AGENT_MODEL。
 * 逻辑：存在则替换第一条未注释的 AGENT_MODEL；不存在则追加，其他环境变量和密钥内容原样保留。
 */
function updateBackendEnvModel(backendEnvPath: string, modelRef: string): void {
  const line = `AGENT_MODEL=${modelRef}`;
  if (!fs.existsSync(backendEnvPath)) {
    fs.writeFileSync(backendEnvPath, `${line}\n`, "utf8");
    return;
  }

  const lines = fs.readFileSync(backendEnvPath, "utf8").split(/\r?\n/);
  let replaced = false;
  const nextLines = lines.map((item) => {
    if (!replaced && /^AGENT_MODEL\s*=/.test(item)) {
      replaced = true;
      return line;
    }
    return item;
  });

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") {
      nextLines.push("");
    }
    nextLines.push(line);
  }

  fs.writeFileSync(backendEnvPath, nextLines.join("\n").replace(/\n*$/, "\n"), "utf8");
}

/**
 * 验证模型是否存在于 Pi 模型注册表。
 * 逻辑：先通过 AuthStorage/ModelRegistry 读取项目 Agent 目录，再按 provider/model 查找。
 */
function assertModelExists(agentDir: string, modelRef: string): void {
  const parsed = parseModelRef(modelRef);
  const authStorage = AuthStorage.create(path.join(agentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(agentDir, "models.json"));
  const model = modelRegistry.find(parsed.provider, parsed.modelId);
  if (!model) {
    throw new Error(
      `未找到模型 ${parsed.raw}。请先运行：npm run agent:auth -- models ${parsed.provider}`,
    );
  }
}

/**
 * 输出当前认证和模型状态。
 * 逻辑：只展示 provider 和认证类型，不打印 token/API key。
 */
function printStatus(params: { agentDir: string; backendEnvPath: string }): void {
  const authPath = path.join(params.agentDir, "auth.json");
  const auth = readJsonFile<AuthFile>(authPath, {});
  const providers = Object.entries(auth).map(([provider, credential]) => {
    const type =
      credential && typeof credential === "object"
        ? (credential as AuthCredential).type || "unknown"
        : "unknown";
    return `${provider}:${type}`;
  });

  const currentModel = appEnv.AGENT_MODEL || "(未配置)";
  console.log("AGENT_AUTH_STATUS");
  console.log(`agent_dir=${params.agentDir}`);
  console.log(`backend_env=${params.backendEnvPath}`);
  console.log(`current_model=${currentModel}`);
  console.log(`auth_providers=${providers.length > 0 ? providers.join(",") : "(none)"}`);
}

/**
 * 主流程。
 * 逻辑：所有命令先准备项目 Agent 目录；OAuth 登录委托给 Pi 官方 pi-ai CLI；模型切换只改本地 .env。
 */
async function main(): Promise<void> {
  const repoRoot = resolveRepositoryRoot();
  const backendEnvPath = path.join(repoRoot, "apps", "backend", ".env");
  const agentDir = appEnv.AGENT_PI_DIR || resolveDefaultPiAgentDir();
  const piAiBin = path.join(repoRoot, "node_modules", ".bin", "pi-ai");
  const piBin = path.join(repoRoot, "node_modules", ".bin", "pi");
  const args = parseArgs(process.argv.slice(2));

  ensureDirectory(agentDir);
  ensureCompatibleAgentBootstrap(agentDir);

  if (args.command === "help" || args.command === "--help" || args.command === "-h") {
    printHelp();
    return;
  }

  if (args.command === "status") {
    printStatus({ agentDir, backendEnvPath });
    return;
  }

  if (args.command === "list") {
    await runCommand(piAiBin, ["list"], { cwd: agentDir });
    return;
  }

  if (args.command === "models") {
    await runCommand(piBin, ["--list-models", args.values[0] || ""], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
      },
    });
    return;
  }

  if (args.command === "login") {
    const provider = args.values[0];
    await runCommand(piAiBin, provider ? ["login", provider] : ["login"], { cwd: agentDir });
    const modelRef = args.model;
    if (modelRef) {
      assertModelExists(agentDir, modelRef);
      updateBackendEnvModel(backendEnvPath, modelRef);
      console.log(`AGENT_MODEL_UPDATED ${modelRef}`);
    }
    if (args.smoke) {
      await runCommand("npm", ["run", "agent:smoke", "-w", "career-backend"], { cwd: repoRoot });
    }
    return;
  }

  if (args.command === "switch" || args.command === "use") {
    const modelRef = args.values[0];
    if (!modelRef) {
      throw new Error("缺少模型，例如：npm run agent:auth -- switch openai-codex/gpt-5.4");
    }
    assertModelExists(agentDir, modelRef);
    updateBackendEnvModel(backendEnvPath, modelRef);
    console.log(`AGENT_MODEL_UPDATED ${modelRef}`);
    if (args.smoke) {
      await runCommand("npm", ["run", "agent:smoke", "-w", "career-backend"], { cwd: repoRoot });
    }
    return;
  }

  throw new Error(`未知命令 ${args.command}。运行 npm run agent:auth -- help 查看用法。`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`AGENT_AUTH_FAIL: ${message}`);
  process.exit(1);
});
