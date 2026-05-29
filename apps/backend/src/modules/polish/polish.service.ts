import type { CreatePolishRequest, PolishResponse } from "@career/contracts/types";

import { runPolishAgent } from "../pi-tools/polish/polish.runtime.js";

export type PolishServiceDependencies = {
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  cwd?: string;
};

export type PolishRuntimeContext = {
  traceId: string;
};

export interface PolishService {
  polishText(input: CreatePolishRequest, runtime: PolishRuntimeContext): Promise<PolishResponse>;
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
