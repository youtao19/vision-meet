/**
 * 文件作用：提供项目级 Pi Agent 登录、模型切换和认证状态检查入口。
 * 职责边界：本脚本只管理本项目独立 Agent 目录和运行时模型选择，不执行业务任务。
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ModelRegistry } from "@mariozechner/pi-coding-agent";

import {
  ensureCompatibleAgentBootstrap,
  ensureDirectory,
  resolveDefaultPiAgentDir,
} from "../shared/agent/agent-bootstrap.js";
import { createPiAuthStorage } from "../shared/agent/pi-provider-config.js";
import { readPiRuntimeConfig, writeActivePiModel } from "../shared/agent/pi-runtime-config.js";
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

class CommandExitError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly args: string[],
    readonly code: number | null,
  ) {
    super(message);
  }
}

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
 * 打印常用的 API Key 配置、状态查看和模型切换命令。
 */
function printHelp(): void {
  console.log(`Career Agent Pi 登录配置

常用命令：
  npm run agent:auth -- login
  npm run agent:auth -- status
  npm run agent:auth -- use deepseek/deepseek-flash

说明：
  login  检查 .env 中的 API Key 和 URL，首次使用时自动选模型
  API Key 不需要通过 Pi 的 OAuth 登录，也不会写入 models.json
  首次使用时按 .env 中已填写的服务自动选择默认模型
`);
}

/**
 * 运行 Pi 的只读诊断命令。
 * 逻辑：默认继承终端输入输出，保持 Pi 自带模型列表的行为。
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
      reject(
        new CommandExitError(
          `${command} ${args.join(" ")} failed with exit code ${code}`,
          command,
          args,
          code,
        ),
      );
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
    throw new Error("模型必须采用 provider/model 格式，例如 kimi-coding/kimi-for-coding");
  }
  return {
    provider: normalized.slice(0, slashIndex),
    modelId: normalized.slice(slashIndex + 1),
    raw: normalized,
  };
}

/**
 * 验证模型是否存在于 Pi 模型注册表。
 * 逻辑：先通过 AuthStorage/ModelRegistry 读取项目 Agent 目录，再按 provider/model 查找。
 */
function assertModelExists(agentDir: string, modelRef: string): void {
  const parsed = parseModelRef(modelRef);
  const authStorage = createPiAuthStorage(agentDir);
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
  const storedProviders = Object.entries(auth).map(([provider, credential]) => {
    const type =
      credential && typeof credential === "object"
        ? (credential as AuthCredential).type || "unknown"
        : "unknown";
    return `${provider}:${type}`;
  });
  const envProviders = [
    appEnv.KIMI_API_KEY || appEnv.KIMICODE_API_KEY ? "kimi-coding:env" : undefined,
    appEnv.MOONSHOT_API_KEY ? "moonshot:env" : undefined,
    appEnv.DEEPSEEK_API_KEY ? "deepseek:env" : undefined,
  ].filter((provider): provider is string => Boolean(provider));
  const providers = [...envProviders, ...storedProviders];

  const currentModel = readPiRuntimeConfig(params.agentDir).active_model || "(未选择)";
  console.log("AGENT_AUTH_STATUS");
  console.log(`agent_dir=${params.agentDir}`);
  console.log(`backend_env=${params.backendEnvPath}`);
  console.log(`active_model=${currentModel}`);
  console.log(`auth_providers=${providers.length > 0 ? providers.join(",") : "(none)"}`);
}

/**
 * 主流程。
 * 逻辑：所有命令先从 .env 同步 Pi provider 配置；login 只检查配置，不再启动 OAuth 流程。
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
    const modelRef = args.model || readPiRuntimeConfig(agentDir).active_model;
    if (!modelRef) {
      throw new Error(
        "没有找到可用模型。请在 apps/backend/.env 填写 KIMI_API_KEY 和 KIMI_BASE_URL，或填写 DEEPSEEK_API_KEY 和 DEEPSEEK_BASE_URL。",
      );
    }
    assertModelExists(agentDir, modelRef);
    if (args.model) {
      writeActivePiModel(agentDir, modelRef);
    }
    console.log(`AGENT_ENV_LOGIN_OK ${modelRef}`);
    if (args.smoke) {
      await runCommand("npm", ["run", "agent:smoke", "-w", "career-backend"], { cwd: repoRoot });
    }
    return;
  }

  if (args.command === "switch" || args.command === "use") {
    const modelRef = args.values[0];
    if (!modelRef) {
      throw new Error("缺少模型，例如：npm run agent:auth -- use kimi-coding/kimi-for-coding");
    }
    assertModelExists(agentDir, modelRef);
    writeActivePiModel(agentDir, modelRef);
    console.log(`AGENT_ACTIVE_MODEL_UPDATED ${modelRef}`);
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
