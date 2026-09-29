/**
 * 文件作用：兼容旧命令，检查 .env 中的 Pi API Key 和 URL 配置。
 * 职责边界：实际 provider 配置由 Pi runtime 自动生成，本脚本不再启动 OAuth 或落盘 API Key。
 */

import {
  ensureCompatibleAgentBootstrap,
  resolveDefaultPiAgentDir,
} from "../shared/agent/agent-bootstrap.js";
import { readPiRuntimeConfig } from "../shared/agent/pi-runtime-config.js";
import { appEnv } from "../shared/config/env.js";

async function main(): Promise<void> {
  const agentDir = appEnv.AGENT_PI_DIR || resolveDefaultPiAgentDir();
  ensureCompatibleAgentBootstrap(agentDir);

  const providers = [
    appEnv.KIMI_API_KEY || appEnv.KIMICODE_API_KEY ? "kimi-coding" : undefined,
    appEnv.MOONSHOT_API_KEY ? "moonshot" : undefined,
    appEnv.DEEPSEEK_API_KEY ? "deepseek" : undefined,
  ].filter((provider): provider is string => Boolean(provider));
  const activeModel = readPiRuntimeConfig(agentDir).active_model;

  if (!providers.length || !activeModel) {
    throw new Error(
      "请在 apps/backend/.env 填写 KIMI_API_KEY 和 KIMI_BASE_URL，或填写 DEEPSEEK_API_KEY 和 DEEPSEEK_BASE_URL。",
    );
  }

  console.log("AGENT_ENV_SETUP_OK");
  console.log(`agent_dir=${agentDir}`);
  console.log(`providers=${providers.join(",")}`);
  console.log(`active_model=${activeModel}`);
  console.log("auth_source=.env");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`AGENT_AUTH_FAIL: ${message}`);
  process.exit(1);
});
