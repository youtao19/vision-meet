import type { AiPolishResponse, CreateAiPolishRequest } from "@career/contracts/types";

import { runPolishAgent } from "./runtime/ai-polish.runtime.js";

type PolishServiceDependencies = {
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  cwd?: string;
};

type PolishRuntimeContext = {
  traceId: string;
};

export interface PolishService {
  polishText(
    input: CreateAiPolishRequest,
    runtime: PolishRuntimeContext,
  ): Promise<AiPolishResponse>;
}

export function createPolishService(dependencies: PolishServiceDependencies): PolishService {
  return {
    polishText: (input, runtime) =>
      runPolishAgent({
        input,
        traceId: runtime.traceId,
        piAgentDir: dependencies.piAgentDir,
        sessionStoreDir: dependencies.sessionStoreDir,
        model: dependencies.model,
        cwd: dependencies.cwd || process.cwd(),
      }),
  };
}
